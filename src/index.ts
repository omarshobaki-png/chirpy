import express, { NextFunction, Request, Response } from "express";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  checkPasswordHash,
  getAPIKey,
  getBearerToken,
  hashPassword,
  makeJWT,
  makeRefreshToken,
  validateJWT,
} from "./auth.js";
import { config } from "./config.js";
import {
  createChirp,
  deleteChirpById,
  getAllChirps,
  getChirpById,
} from "./db/queries/chirps.js";
import {
  createRefreshToken,
  getUserFromRefreshToken,
  revokeRefreshToken,
} from "./db/queries/refreshTokens.js";
import {
  createUser,
  deleteUsers,
  getUserByEmail,
  updateUser,
  upgradeUserToChirpyRed,
} from "./db/queries/users.js";
import type {
  User,
  UserResponse,
} from "./db/schema.js";

const migrationClient = postgres(config.db.url, { max: 1 });

await migrate(
  drizzle(migrationClient),
  config.db.migrationConfig,
);

const app = express();
const PORT = config.api.port;

const ACCESS_TOKEN_DURATION_SECONDS = 60 * 60;
const REFRESH_TOKEN_DURATION_MS =
  60 * 24 * 60 * 60 * 1000;

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

function userToResponse(user: User): UserResponse {
  const {
    hashedPassword: _hashedPassword,
    ...response
  } = user;

  return response;
}

function middlewareLogResponses(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`,
      );
    }
  });

  next();
}

function middlewareMetricsInc(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  config.api.fileserverHits++;
  next();
}

function handlerReadiness(_req: Request, res: Response) {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
}

function handlerMetrics(_req: Request, res: Response) {
  res.set("Content-Type", "text/html; charset=utf-8");

  res.send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>`);
}

async function handlerReset(_req: Request, res: Response) {
  if (config.api.platform !== "dev") {
    throw new ForbiddenError("Forbidden");
  }

  config.api.fileserverHits = 0;
  await deleteUsers();

  res.status(200).end();
}

async function handlerCreateUser(req: Request, res: Response) {
  const email = req.body?.email;
  const password = req.body?.password;

  if (
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    throw new BadRequestError(
      "Email and password are required",
    );
  }

  const hashedPassword = await hashPassword(password);

  const user = await createUser({
    email,
    hashedPassword,
  });

  if (!user) {
    throw new BadRequestError("User already exists");
  }

  res.status(201).json(userToResponse(user));
}

async function handlerUpdateUser(
  req: Request,
  res: Response,
) {
  let userId: string;

  try {
    const token = getBearerToken(req);

    userId = validateJWT(
      token,
      config.api.jwtSecret,
    );
  } catch {
    throw new UnauthorizedError("Invalid token");
  }

  const email = req.body?.email;
  const password = req.body?.password;

  if (
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    throw new BadRequestError(
      "Email and password are required",
    );
  }

  const hashedPassword = await hashPassword(password);

  const user = await updateUser(
    userId,
    email,
    hashedPassword,
  );

  if (!user) {
    throw new UnauthorizedError("Invalid token");
  }

  res.status(200).json(userToResponse(user));
}

async function handlerLogin(req: Request, res: Response) {
  const email = req.body?.email;
  const password = req.body?.password;

  if (
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    throw new UnauthorizedError(
      "incorrect email or password",
    );
  }

  const user = await getUserByEmail(email);

  if (!user) {
    throw new UnauthorizedError(
      "incorrect email or password",
    );
  }

  let passwordMatches = false;

  try {
    passwordMatches = await checkPasswordHash(
      password,
      user.hashedPassword,
    );
  } catch {
    passwordMatches = false;
  }

  if (!passwordMatches) {
    throw new UnauthorizedError(
      "incorrect email or password",
    );
  }

  const token = makeJWT(
    user.id,
    ACCESS_TOKEN_DURATION_SECONDS,
    config.api.jwtSecret,
  );

  const refreshToken = makeRefreshToken();

  await createRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(
      Date.now() + REFRESH_TOKEN_DURATION_MS,
    ),
  });

  res.status(200).json({
    ...userToResponse(user),
    token,
    refreshToken,
  });
}

async function handlerRefresh(req: Request, res: Response) {
  let refreshToken: string;

  try {
    refreshToken = getBearerToken(req);
  } catch {
    throw new UnauthorizedError(
      "Invalid refresh token",
    );
  }

  const user = await getUserFromRefreshToken(
    refreshToken,
  );

  if (!user) {
    throw new UnauthorizedError(
      "Invalid refresh token",
    );
  }

  const token = makeJWT(
    user.id,
    ACCESS_TOKEN_DURATION_SECONDS,
    config.api.jwtSecret,
  );

  res.status(200).json({
    token,
  });
}

async function handlerRevoke(req: Request, res: Response) {
  let refreshToken: string;

  try {
    refreshToken = getBearerToken(req);
  } catch {
    throw new UnauthorizedError(
      "Invalid refresh token",
    );
  }

  await revokeRefreshToken(refreshToken);

  res.status(204).end();
}

async function handlerCreateChirp(req: Request, res: Response) {
  let userId: string;

  try {
    const token = getBearerToken(req);

    userId = validateJWT(
      token,
      config.api.jwtSecret,
    );
  } catch {
    throw new UnauthorizedError("Invalid token");
  }

  const body = req.body?.body;

  if (typeof body !== "string") {
    throw new BadRequestError("Chirp body is required");
  }

  if (body.length > 140) {
    throw new BadRequestError(
      "Chirp is too long. Max length is 140",
    );
  }

  const profaneWords = ["kerfuffle", "sharbert", "fornax"];

  const cleanedBody = body
    .split(" ")
    .map((word: string) => {
      if (profaneWords.includes(word.toLowerCase())) {
        return "****";
      }

      return word;
    })
    .join(" ");

  const chirp = await createChirp({
    body: cleanedBody,
    userId,
  });

  res.status(201).json(chirp);
}

async function handlerGetChirps(
  req: Request,
  res: Response,
) {
  const authorId =
    typeof req.query.authorId === "string"
      ? req.query.authorId
      : undefined;

  const sort =
    req.query.sort === "desc"
      ? "desc"
      : "asc";

  const chirps = await getAllChirps(authorId);

  chirps.sort((a, b) => {
    const aTime = a.createdAt.getTime();
    const bTime = b.createdAt.getTime();

    return sort === "desc"
      ? bTime - aTime
      : aTime - bTime;
  });

  res.status(200).json(chirps);
}

async function handlerGetChirp(
  req: Request,
  res: Response,
) {
  const chirpId = req.params.chirpId;

  if (typeof chirpId !== "string") {
    throw new NotFoundError("Chirp not found");
  }

  const chirp = await getChirpById(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  res.status(200).json(chirp);
}

async function handlerDeleteChirp(
  req: Request,
  res: Response,
) {
  let userId: string;

  try {
    const token = getBearerToken(req);

    userId = validateJWT(
      token,
      config.api.jwtSecret,
    );
  } catch {
    throw new UnauthorizedError("Invalid token");
  }

  const chirpId = req.params.chirpId;

  if (typeof chirpId !== "string") {
    throw new NotFoundError("Chirp not found");
  }

  const chirp = await getChirpById(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  if (chirp.userId !== userId) {
    throw new ForbiddenError(
      "You cannot delete another user's chirp",
    );
  }

  await deleteChirpById(chirpId);

  res.status(204).end();
}

async function handlerPolkaWebhook(
  req: Request,
  res: Response,
) {
  let apiKey: string;

  try {
    apiKey = getAPIKey(req);
  } catch {
    throw new UnauthorizedError("Invalid API key");
  }

  if (apiKey !== config.api.polkaKey) {
    throw new UnauthorizedError("Invalid API key");
  }

  const event = req.body?.event;

  if (event !== "user.upgraded") {
    res.status(204).end();
    return;
  }

  const userId = req.body?.data?.userId;

  if (typeof userId !== "string") {
    throw new BadRequestError("User ID is required");
  }

  const user = await upgradeUserToChirpyRed(userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(204).end();
}

function middlewareErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.log(err);

  let statusCode = 500;
  let message = "Something went wrong on our end";

  if (err instanceof BadRequestError) {
    statusCode = 400;
    message = err.message;
  } else if (err instanceof UnauthorizedError) {
    statusCode = 401;
    message = err.message;
  } else if (err instanceof ForbiddenError) {
    statusCode = 403;
    message = err.message;
  } else if (err instanceof NotFoundError) {
    statusCode = 404;
    message = err.message;
  }

  res.status(statusCode).json({
    error: message,
  });
}

app.use(middlewareLogResponses);
app.use(express.json());

app.get("/api/healthz", handlerReadiness);

app.use(
  "/app",
  middlewareMetricsInc,
  express.static("./src/app"),
);

app.get("/admin/metrics", handlerMetrics);
app.post("/admin/reset", handlerReset);

app.post("/api/users", handlerCreateUser);
app.put("/api/users", handlerUpdateUser);

app.post("/api/login", handlerLogin);
app.post("/api/refresh", handlerRefresh);
app.post("/api/revoke", handlerRevoke);

app.get("/api/chirps", handlerGetChirps);
app.get("/api/chirps/:chirpId", handlerGetChirp);
app.post("/api/chirps", handlerCreateChirp);
app.delete("/api/chirps/:chirpId", handlerDeleteChirp);

app.post("/api/polka/webhooks", handlerPolkaWebhook);

app.use(middlewareErrorHandler);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
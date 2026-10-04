import express, { NextFunction, Request, Response } from "express";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  checkPasswordHash,
  hashPassword,
} from "./auth.js";
import { config } from "./config.js";
import {
  createChirp,
  getAllChirps,
  getChirpById,
} from "./db/queries/chirps.js";
import {
  createUser,
  deleteUsers,
  getUserByEmail,
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
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${statusCode}`,
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

  res.status(200).json(userToResponse(user));
}

async function handlerCreateChirp(req: Request, res: Response) {
  const body = req.body?.body;
  const userId = req.body?.userId;

  if (
    typeof body !== "string" ||
    typeof userId !== "string"
  ) {
    res.status(400).json({
      error: "Something went wrong",
    });
    return;
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
  _req: Request,
  res: Response,
) {
  const chirps = await getAllChirps();

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
app.post("/api/login", handlerLogin);

app.get("/api/chirps", handlerGetChirps);
app.get("/api/chirps/:chirpId", handlerGetChirp);
app.post("/api/chirps", handlerCreateChirp);

app.use(middlewareErrorHandler);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
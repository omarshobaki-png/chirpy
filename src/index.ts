import express, { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

const app = express();
const PORT = 8080;

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
  config.fileserverHits++;
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
    <p>Chirpy has been visited ${config.fileserverHits} times!</p>
  </body>
</html>`);
}

function handlerReset(_req: Request, res: Response) {
  config.fileserverHits = 0;
  res.status(200).end();
}

function handlerValidateChirp(req: Request, res: Response) {
  const body = req.body?.body;

  if (typeof body !== "string") {
    res.status(400).json({
      error: "Something went wrong",
    });
    return;
  }

  if (body.length > 140) {
    res.status(400).json({
      error: "Chirp is too long",
    });
    return;
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

  res.status(200).json({
    cleanedBody,
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
app.post("/api/validate_chirp", handlerValidateChirp);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
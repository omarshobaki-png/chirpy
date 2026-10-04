import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

type Payload = Pick<
  JwtPayload,
  "iss" | "sub" | "iat" | "exp"
>;

export async function hashPassword(
  password: string,
): Promise<string> {
  return argon2.hash(password);
}

export async function checkPasswordHash(
  password: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);

  const payload: Payload = {
    iss: "chirpy",
    sub: userID,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  };

  return jwt.sign(payload, secret);
}

export function validateJWT(
  tokenString: string,
  secret: string,
): string {
  const decoded = jwt.verify(tokenString, secret);

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string"
  ) {
    throw new Error("Invalid JWT");
  }

  return decoded.sub;
}

export function getBearerToken(req: Request): string {
  const authorization = req.get("Authorization");

  if (!authorization) {
    throw new Error("Authorization header is missing");
  }

  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token) {
    throw new Error("Invalid Authorization header");
  }

  return token;
}

export function getAPIKey(req: Request): string {
  const authorization = req.get("Authorization");

  if (!authorization) {
    throw new Error("Authorization header is missing");
  }

  const [scheme, apiKey] = authorization.trim().split(/\s+/);

  if (scheme !== "ApiKey" || !apiKey) {
    throw new Error("Invalid Authorization header");
  }

  return apiKey;
}

export function makeRefreshToken(): string {
  return randomBytes(32).toString("hex");
}
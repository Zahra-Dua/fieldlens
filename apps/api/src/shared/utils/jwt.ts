// Plain JWT signing/verification using jsonwebtoken directly instead of
// @fastify/jwt's "namespace" feature — its TypeScript support for multiple
// namespaces is genuinely unresolved upstream (fastify/fastify-jwt#286),
// not worth fighting for this project. Two secrets, four plain functions,
// fully typed. See ADR 0004.

import jwt from "jsonwebtoken";

export type UserRole = "ADMIN" | "FIELD_WORKER";

// The access token carries the role, so the auth middleware can check
// permissions without an extra database round-trip on every request.
export type AccessTokenPayload = { sub: string; role: UserRole };
export type RefreshTokenPayload = { sub: string };

function getSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in .env`);
  }
  return value;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSecret("JWT_ACCESS_SECRET"), {
    expiresIn: "15m",
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, getSecret("JWT_REFRESH_SECRET"), {
    expiresIn: "7d",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getSecret("JWT_ACCESS_SECRET")) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, getSecret("JWT_REFRESH_SECRET")) as RefreshTokenPayload;
}
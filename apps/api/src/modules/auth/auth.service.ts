// The actual business logic for authentication. This file knows nothing
// about HTTP — no request/response objects — so it stays testable and
// reusable. The controller is the only thing that talks to Fastify.

import argon2 from "argon2";
import { prisma } from "../../database/prisma";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type UserRole,
} from "../../shared/utils/jwt";
import type { RegisterInput, LoginInput } from "./auth.schemas";

const REFRESH_TOKEN_EXPIRY_DAYS = 7; // must match the "7d" in jwt.ts

export class AuthService {
  // ── Register ──────────────────────────────────────────────
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new Error("EMAIL_ALREADY_REGISTERED");
    }

    const passwordHash = await argon2.hash(input.password);

    // New self-registered users are always FIELD_WORKER — see ADR on
    // admin provisioning. Admins are created via the seed script, not
    // through this endpoint.
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "FIELD_WORKER",
      },
    });

    return user;
  }

  // ── Login ─────────────────────────────────────────────────
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.isActive) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const passwordValid = await argon2.verify(
      user.passwordHash,
      input.password
    );

    if (!passwordValid) {
      throw new Error("INVALID_CREDENTIALS");
    }

    return this.issueTokens(user.id, user.role as UserRole);
  }

  // ── Issue a fresh access + refresh token pair ────────────────
  private async issueTokens(userId: string, role: UserRole) {
    const accessToken = signAccessToken({ sub: userId, role });
    const refreshToken = signRefreshToken({ sub: userId });

    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  // ── Refresh — exchange a valid refresh token for a new access token ──
  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    const candidates = await prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    let matchedTokenId: string | null = null;
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.tokenHash, refreshToken)) {
        matchedTokenId = candidate.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    // Rotate — revoke the used refresh token and issue a new pair.
    await prisma.refreshToken.update({
      where: { id: matchedTokenId },
      data: { revokedAt: new Date() },
    });

    // Need the user's current role to sign a fresh access token — a
    // refresh token alone doesn't carry it (kept minimal on purpose).
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    return this.issueTokens(user.id, user.role as UserRole);
  }

  // ── Get current user (for GET /auth/me) ──────────────────────
  async getById(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    return user;
  }

  // ── Logout — revoke the specific refresh token being used ────────
  // Deliberately forgiving: if the token is already invalid/expired,
  // logout still "succeeds" from the client's point of view — the
  // client clears its stored tokens either way.
  async logout(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    const candidates = await prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
    });

    for (const candidate of candidates) {
      if (await argon2.verify(candidate.tokenHash, refreshToken)) {
        await prisma.refreshToken.update({
          where: { id: candidate.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
    }
  }
}

export const authService = new AuthService();
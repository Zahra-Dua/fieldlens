import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/database/prisma";

describe("Auth", () => {
  let app: FastifyInstance;
  const email = "auth-flow-test@example.com";
  const password = "Password123!";

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  // ── Happy path ──────────────────────────────────────────────
  it("registers, logs in, accesses a protected route, and refreshes", async () => {
    const registerResponse = await supertest(app.server)
      .post("/auth/register")
      .send({ name: "Auth Flow Tester", email, password });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.role).toBe("FIELD_WORKER");

    const loginResponse = await supertest(app.server)
      .post("/auth/login")
      .send({ email, password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toBeTruthy();
    expect(loginResponse.body.refreshToken).toBeTruthy();

    const meResponse = await supertest(app.server)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.email).toBe(email);

    const refreshResponse = await supertest(app.server)
      .post("/auth/refresh")
      .send({ refreshToken: loginResponse.body.refreshToken });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toBeTruthy();
    // Token rotation — the new refresh token should differ from the one
    // that was just used (see ADR on token rotation in auth.service.ts).
    expect(refreshResponse.body.refreshToken).not.toBe(loginResponse.body.refreshToken);
  });

  // ── Failure paths ───────────────────────────────────────────
  it("rejects registering the same email twice", async () => {
    const duplicateEmail = "auth-duplicate-test@example.com";
    await supertest(app.server)
      .post("/auth/register")
      .send({ name: "First", email: duplicateEmail, password });

    const secondAttempt = await supertest(app.server)
      .post("/auth/register")
      .send({ name: "Second", email: duplicateEmail, password });

    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");

    await prisma.user.deleteMany({ where: { email: duplicateEmail } });
  });

  it("rejects login with the wrong password", async () => {
    const response = await supertest(app.server)
      .post("/auth/login")
      .send({ email, password: "WrongPassword123!" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a protected route with no token", async () => {
    const response = await supertest(app.server).get("/auth/me");
    expect(response.status).toBe(401);
  });

  it("rejects a protected route with a malformed token", async () => {
    const response = await supertest(app.server)
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-real-token");

    expect(response.status).toBe(401);
  });
    it("rejects reusing a refresh token after it has been rotated", async () => {
    const rotateEmail = "auth-rotate-test@example.com";
    await supertest(app.server)
      .post("/auth/register")
      .send({ name: "Rotate Tester", email: rotateEmail, password });

    const login = await supertest(app.server)
      .post("/auth/login")
      .send({ email: rotateEmail, password });

    const firstRefresh = await supertest(app.server)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(firstRefresh.status).toBe(200);

    // The original token was rotated out — using it again must fail.
    const reuse = await supertest(app.server)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);

    await prisma.refreshToken.deleteMany({ where: { user: { email: rotateEmail } } });
    await prisma.user.deleteMany({ where: { email: rotateEmail } });
  });

  it("rejects a refresh token after logout (revocation)", async () => {
    const logoutEmail = "auth-logout-test@example.com";
    await supertest(app.server)
      .post("/auth/register")
      .send({ name: "Logout Tester", email: logoutEmail, password });

    const login = await supertest(app.server)
      .post("/auth/login")
      .send({ email: logoutEmail, password });

    const logout = await supertest(app.server)
      .post("/auth/logout")
      .send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(204);

    const afterLogout = await supertest(app.server)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(afterLogout.status).toBe(401);

    await prisma.refreshToken.deleteMany({ where: { user: { email: logoutEmail } } });
    await prisma.user.deleteMany({ where: { email: logoutEmail } });
  });
});
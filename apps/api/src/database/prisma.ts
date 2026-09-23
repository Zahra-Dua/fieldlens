// A single, shared Prisma Client instance for the whole app.
// Every other file imports THIS instance instead of creating its own,
// so we don't open a new database connection pool in every module.

import { PrismaClient } from "../generated/prisma/client";

export const prisma = new PrismaClient();
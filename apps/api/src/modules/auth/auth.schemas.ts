// Zod schemas for every auth request body. Fastify will validate incoming
// requests against these before the controller ever sees them — if a
// request fails validation, it never reaches our business logic.

import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Must be a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

// Inferred TypeScript types — one source of truth (the Zod schema),
// so the type and the validation never drift apart.
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export const logoutSchema = refreshSchema; // { refreshToken: string }
// A known, expected error — e.g. "email already registered", "not found".
// Carries its own HTTP status code and error code, so the global error
// handler (shared/middleware/errorHandler.ts) can turn it into a
// consistent response without each controller repeating that mapping.

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
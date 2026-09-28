// Runs once before any test file. Loads .env.test and forces it to
// override any values already in process.env (e.g. from a plain .env
// that got loaded some other way), so tests always talk to
// fieldlens_test, never the dev database.

import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

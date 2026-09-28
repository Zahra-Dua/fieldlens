import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/vitest.setup.ts"],
    // Integration tests hit a real (test) database — run them one at a
    // time to avoid two tests racing on the same rows.
    fileParallelism: false,
    testTimeout: 15000,
  },
});

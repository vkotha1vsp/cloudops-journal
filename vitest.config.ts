import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // API tests that need Postgres are skipped automatically when TEST_DATABASE_URL is unset.
    testTimeout: 20000,
  },
});

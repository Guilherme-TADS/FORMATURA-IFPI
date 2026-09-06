import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/mocks/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});

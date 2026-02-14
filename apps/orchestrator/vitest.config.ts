import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "orchestrator",
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/__tests__/**/*.test.ts"],
    globals: true,
    testTimeout: 10000,
  },
});

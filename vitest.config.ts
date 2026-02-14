import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "orchestrator",
          root: "./apps/orchestrator",
          environment: "node",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/__tests__/**/*.test.ts"],
          globals: true,
          testTimeout: 10000,
        },
      },
      {
        test: {
          name: "web",
          root: "./apps/web",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/__tests__/**/*.test.{ts,tsx}"],
          globals: true,
          testTimeout: 10000,
        },
        resolve: {
          alias: {
            "@": resolve(__dirname, "./apps/web/src"),
          },
        },
      },
    ],
  },
});

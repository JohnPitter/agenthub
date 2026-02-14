import { afterAll } from "vitest";

// Suppress logger output in tests
process.env.NODE_ENV = "test";

afterAll(() => {
  // Cleanup any test resources
});

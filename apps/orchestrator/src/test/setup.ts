import { vi, afterAll } from "vitest";

// Suppress logger output in tests
process.env.NODE_ENV = "test";

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

afterAll(() => {
  // Cleanup any test resources
});

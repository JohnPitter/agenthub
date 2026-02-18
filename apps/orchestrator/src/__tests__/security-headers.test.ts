import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { securityHeaders } from "../middleware/security-headers.js";

describe("Security Headers Middleware", () => {
  const app = express();
  app.use(securityHeaders);
  app.get("/test", (_req, res) => res.json({ ok: true }));

  it("sets X-Content-Type-Options to nosniff", async () => {
    const res = await request(app).get("/test");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY", async () => {
    const res = await request(app).get("/test");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets X-XSS-Protection", async () => {
    const res = await request(app).get("/test");
    expect(res.headers["x-xss-protection"]).toBe("1; mode=block");
  });

  it("sets Referrer-Policy", async () => {
    const res = await request(app).get("/test");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("sets Strict-Transport-Security", async () => {
    const res = await request(app).get("/test");
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("does NOT set CSP in non-production", async () => {
    const res = await request(app).get("/test");
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  describe("production CSP", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("sets Content-Security-Policy in production", async () => {
      // Need a fresh app so the middleware reads the env at request time
      const prodApp = express();
      prodApp.use(securityHeaders);
      prodApp.get("/test", (_req, res) => res.json({ ok: true }));

      const res = await request(prodApp).get("/test");
      expect(res.headers["content-security-policy"]).toBe(
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss:",
      );
    });
  });
});

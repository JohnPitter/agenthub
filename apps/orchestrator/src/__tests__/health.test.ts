import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

describe("Health Check", () => {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  it("returns status ok", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeTypeOf("number");
  });
});

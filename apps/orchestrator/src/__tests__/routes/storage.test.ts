import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the storage service
vi.mock("../../services/storage-service.js", () => ({
  storageService: {
    getUserStorageUsage: vi.fn(),
    deleteProjectClone: vi.fn(),
    recloneProject: vi.fn(),
  },
}));

import { storageRouter } from "../../routes/storage.js";
import { storageService } from "../../services/storage-service.js";

function createApp() {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware: inject user from x-user-id header
  app.use((req, _res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (userId) {
      (req as unknown as { user: { userId: string } }).user = { userId };
    }
    next();
  });

  app.use("/api/storage", storageRouter);
  return app;
}

describe("Storage Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  // ---- GET /api/storage/usage ----
  describe("GET /api/storage/usage", () => {
    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/storage/usage");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authentication required");
    });

    it("returns storage usage for authenticated user", async () => {
      const mockUsage = {
        usedMb: 250.5,
        limitMb: 1000,
        usedPercent: 25.05,
        projectCount: 3,
        maxProjects: 10,
        repoTtlDays: 30,
      };

      vi.mocked(storageService.getUserStorageUsage).mockResolvedValue(mockUsage);

      const res = await request(app)
        .get("/api/storage/usage")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(200);
      expect(res.body.usage).toEqual(mockUsage);
      expect(storageService.getUserStorageUsage).toHaveBeenCalledWith("user-123");
    });

    it("returns 500 when service throws", async () => {
      vi.mocked(storageService.getUserStorageUsage).mockRejectedValue(
        new Error("DB error"),
      );

      const res = await request(app)
        .get("/api/storage/usage")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get storage usage");
    });
  });

  // ---- DELETE /api/storage/projects/:id/clone ----
  describe("DELETE /api/storage/projects/:id/clone", () => {
    it("returns success when clone is deleted", async () => {
      vi.mocked(storageService.deleteProjectClone).mockResolvedValue(undefined);

      const res = await request(app)
        .delete("/api/storage/projects/proj-123/clone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(storageService.deleteProjectClone).toHaveBeenCalledWith("proj-123");
    });

    it("returns 500 with error message on failure", async () => {
      vi.mocked(storageService.deleteProjectClone).mockRejectedValue(
        new Error("Project not found"),
      );

      const res = await request(app)
        .delete("/api/storage/projects/proj-123/clone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Project not found");
    });

    it("handles non-Error thrown values", async () => {
      vi.mocked(storageService.deleteProjectClone).mockRejectedValue(
        "string error",
      );

      const res = await request(app)
        .delete("/api/storage/projects/proj-123/clone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to delete clone");
    });
  });

  // ---- POST /api/storage/projects/:id/reclone ----
  describe("POST /api/storage/projects/:id/reclone", () => {
    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/storage/projects/proj-123/reclone");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authentication required");
    });

    it("returns success with new path on reclone", async () => {
      const newPath = "/home/user/.agenthub/repos/user-123/my-project";
      vi.mocked(storageService.recloneProject).mockResolvedValue(newPath);

      const res = await request(app)
        .post("/api/storage/projects/proj-123/reclone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.path).toBe(newPath);
      expect(storageService.recloneProject).toHaveBeenCalledWith("proj-123", "user-123");
    });

    it("returns 500 when quota exceeded", async () => {
      vi.mocked(storageService.recloneProject).mockRejectedValue(
        new Error("Storage quota exceeded"),
      );

      const res = await request(app)
        .post("/api/storage/projects/proj-123/reclone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Storage quota exceeded");
    });

    it("returns 500 when access token not found", async () => {
      vi.mocked(storageService.recloneProject).mockRejectedValue(
        new Error("GitHub access token not found"),
      );

      const res = await request(app)
        .post("/api/storage/projects/proj-123/reclone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("GitHub access token not found");
    });

    it("handles non-Error thrown values", async () => {
      vi.mocked(storageService.recloneProject).mockRejectedValue(42);

      const res = await request(app)
        .post("/api/storage/projects/proj-123/reclone")
        .set("x-user-id", "user-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to reclone");
    });
  });
});

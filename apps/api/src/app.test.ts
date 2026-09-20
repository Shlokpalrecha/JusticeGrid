import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("health endpoints (Phase 0 wiring smoke test)", () => {
  const app = createApp();

  it("GET /api/v1/health returns ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: "ok" } });
  });

  it("GET /api/v1/version returns the service name", async () => {
    const res = await request(app).get("/api/v1/version");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { name: "justicegrid-api", version: "0.1.0" },
    });
  });
});

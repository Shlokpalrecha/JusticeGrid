import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { buildOpenApiDocument } from "./openapi.js";

describe("OpenAPI document (spec §4)", () => {
  it("builds a valid OpenAPI 3.1 document with every mounted route registered", () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("JusticeGrid API");
    expect(doc.paths?.["/api/v1/cases"]).toBeDefined();
    expect(doc.paths?.["/api/v1/priority/queue"]).toBeDefined();
    expect(doc.paths?.["/api/v1/rules/simulate"]).toBeDefined();
    expect(doc.paths?.["/api/v1/reports/{name}/export.csv"]).toBeDefined();
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
  });

  it("GET /api/docs/openapi.json serves the document", async () => {
    const app = createApp();
    const res = await request(app).get("/api/docs/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
  });

  it("GET /api/docs serves the Swagger UI page", async () => {
    const app = createApp();
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
});

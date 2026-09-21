import { Router } from "express";
import { SearchQuerySchema } from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validateQuery } from "../../middleware/validate.js";
import { searchHandler } from "./search.controller.js";

/** spec §7: `GET /search?q=` — no capability gate beyond `requireAuth`,
 * since scoping happens per-entity inside `search.service.ts` (the same
 * pattern as `GET /cases`, not a route-level RBAC capability). */
export const searchRouter: Router = Router();

searchRouter.get("/", requireAuth, validateQuery(SearchQuerySchema), searchHandler);

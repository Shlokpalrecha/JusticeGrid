import { Router } from "express";
import {
  IdParamSchema,
  PersonCreateInputSchema,
  PersonUpdateInputSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import {
  createPersonHandler,
  getPersonHandler,
  listPersonsHandler,
  updatePersonHandler,
} from "./persons.controller.js";

export const personsRouter: Router = Router();

personsRouter.get("/", requireAuth, requireCapability("VIEW_ANY_CASE"), listPersonsHandler);
personsRouter.get(
  "/:id",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(IdParamSchema),
  getPersonHandler,
);
personsRouter.post(
  "/",
  requireAuth,
  requireCapability("CREATE_EDIT_CASE"),
  validateBody(PersonCreateInputSchema),
  createPersonHandler,
);
personsRouter.patch(
  "/:id",
  requireAuth,
  requireCapability("CREATE_EDIT_CASE"),
  validateParams(IdParamSchema),
  validateBody(PersonUpdateInputSchema),
  updatePersonHandler,
);

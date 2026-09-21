import { Router } from "express";
import {
  IdParamSchema,
  RuleCreateInputSchema,
  RuleSimulateInputSchema,
  RuleToggleInputSchema,
  RuleUpdateInputSchema,
  RulesetConfigCreateInputSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import {
  createRuleHandler,
  getRuleVersionsHandler,
  getRulesetConfigHandler,
  listRulesHandler,
  recomputeAllHandler,
  simulateRulesetHandler,
  toggleRuleHandler,
  updateRuleHandler,
  updateRulesetConfigHandler,
} from "./rules.controller.js";

/** Spec §7: "Rules (ADMIN write, all roles read)" — read routes need
 * only `requireAuth`; every mutating route (including the simulator,
 * which spec §9 places on the ADMIN-only Rules admin screen even though
 * it persists nothing) gates on CONFIGURE_RULES. */
export const rulesRouter: Router = Router();

rulesRouter.get("/", requireAuth, listRulesHandler);
rulesRouter.post(
  "/",
  requireAuth,
  requireCapability("CONFIGURE_RULES"),
  validateBody(RuleCreateInputSchema),
  createRuleHandler,
);
rulesRouter.patch(
  "/:id",
  requireAuth,
  requireCapability("CONFIGURE_RULES"),
  validateParams(IdParamSchema),
  validateBody(RuleUpdateInputSchema),
  updateRuleHandler,
);
rulesRouter.post(
  "/:id/toggle",
  requireAuth,
  requireCapability("CONFIGURE_RULES"),
  validateParams(IdParamSchema),
  validateBody(RuleToggleInputSchema),
  toggleRuleHandler,
);
rulesRouter.get(
  "/:id/versions",
  requireAuth,
  validateParams(IdParamSchema),
  getRuleVersionsHandler,
);
rulesRouter.get("/config", requireAuth, getRulesetConfigHandler);
rulesRouter.put(
  "/config",
  requireAuth,
  requireCapability("CONFIGURE_RULES"),
  validateBody(RulesetConfigCreateInputSchema),
  updateRulesetConfigHandler,
);
rulesRouter.post(
  "/simulate",
  requireAuth,
  requireCapability("CONFIGURE_RULES"),
  validateBody(RuleSimulateInputSchema),
  simulateRulesetHandler,
);
rulesRouter.post(
  "/recompute-all",
  requireAuth,
  requireCapability("CONFIGURE_RULES"),
  recomputeAllHandler,
);

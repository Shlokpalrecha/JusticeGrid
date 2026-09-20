import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { loginRateLimiter } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from "./auth.controller.js";
import { ChangePasswordInputSchema, LoginInputSchema } from "./auth.schema.js";

export const authRouter: Router = Router();

authRouter.post("/login", loginRateLimiter, validateBody(LoginInputSchema), loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", requireAuth, meHandler);
authRouter.post(
  "/change-password",
  requireAuth,
  validateBody(ChangePasswordInputSchema),
  changePasswordHandler,
);

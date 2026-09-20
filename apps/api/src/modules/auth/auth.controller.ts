import type { CookieOptions, Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import { env } from "../../config/env.js";
import type { AuditRequestContext } from "../../lib/audit.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as authService from "./auth.service.js";
import type { AuthSessionResponse, ChangePasswordInput, LoginInput } from "./auth.schema.js";

const REFRESH_TOKEN_COOKIE = "refreshToken";

function requestContext(req: Request): AuditRequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    requestId: getRequestId(req),
  };
}

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/api/v1/auth",
  };
}

function setRefreshCookie(res: Response, value: string, expiresAt: Date): void {
  res.cookie(REFRESH_TOKEN_COOKIE, value, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  // req.body is statically `any` on Express's Request type; validateBody
  // middleware (mounted on this route) has already parsed it against
  // LoginInputSchema by the time this handler runs.
  const session = await authService.login(req.body as LoginInput, requestContext(req));
  setRefreshCookie(res, session.refreshTokenValue, session.refreshTokenExpiresAt);
  const data: AuthSessionResponse = { accessToken: session.accessToken, user: session.user };
  const response: ApiSuccessResponse<AuthSessionResponse> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const cookies = req.cookies as Record<string, string | undefined>;
  const token = cookies[REFRESH_TOKEN_COOKIE];
  if (!token) {
    throw new AppError("UNAUTHENTICATED", "No refresh token was presented.");
  }
  const session = await authService.refresh(token, requestContext(req));
  setRefreshCookie(res, session.refreshTokenValue, session.refreshTokenExpiresAt);
  const data: AuthSessionResponse = { accessToken: session.accessToken, user: session.user };
  const response: ApiSuccessResponse<AuthSessionResponse> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const cookies = req.cookies as Record<string, string | undefined>;
  const token = cookies[REFRESH_TOKEN_COOKIE];
  if (token) {
    await authService.logout(token, requestContext(req));
  }
  clearRefreshCookie(res);
  const response: ApiSuccessResponse<{ loggedOut: true }> = {
    success: true,
    data: { loggedOut: true },
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  }
  const user = await authService.getMe(req.user.id);
  const response: ApiSuccessResponse<typeof user> = {
    success: true,
    data: user,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  }
  // Same rationale as loginHandler above: validateBody already parsed
  // req.body against ChangePasswordInputSchema.
  await authService.changePassword(
    req.user.id,
    req.body as ChangePasswordInput,
    requestContext(req),
  );
  clearRefreshCookie(res); // every session was revoked server-side; the cookie is now stale.
  const response: ApiSuccessResponse<{ changed: true }> = {
    success: true,
    data: { changed: true },
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse, type SearchResponse } from "@justicegrid/shared";
import { getRequestId } from "../../middleware/requestId.js";
import { search } from "./search.service.js";

export async function searchHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) throw new AppError("UNAUTHENTICATED", "Authentication is required.");

  const { q } = req.query as unknown as { q: string };
  const data = await search(user, q);
  const response: ApiSuccessResponse<SearchResponse> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

import type { Request, Response } from "express";
import type { ApiSuccessResponse, AuditChainVerification } from "@justicegrid/shared";
import { verifyAuditChain } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { getRequestId } from "../../middleware/requestId.js";

export async function verifyChainHandler(req: Request, res: Response): Promise<void> {
  const result = await verifyAuditChain(prisma);
  const data: AuditChainVerification = {
    intact: result.intact,
    entriesChecked: result.entriesChecked,
    firstBreakAtSequence: result.firstBreakAtSequence,
  };
  const response: ApiSuccessResponse<AuditChainVerification> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

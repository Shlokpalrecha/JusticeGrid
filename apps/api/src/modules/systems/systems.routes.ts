import { guardSystemRequest as guarded } from "../../lib/systemRequests.js";
import { Router, type Request } from "express";
import { z } from "zod";
import { AppError } from "@justicegrid/shared";
import {
  compileExpression,
  DEFAULT_TEXT_RULES,
  RULE_FIELDS,
  evaluateExpression,
} from "@justicegrid/rules-engine";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { getRequestId } from "../../middleware/requestId.js";
import { prisma } from "../../lib/prisma.js";
import { verifyActivityLedger } from "../../lib/audit.js";
import { heapStatus } from "../../lib/activeHeap.js";
import { loadAccessibleCase } from "../../lib/caseAccess.js";
import * as identity from "./identity.service.js";
import * as graph from "./graph.service.js";
import {
  IdentityInput,
  IngestInput,
  RecordEditInput,
  DecisionInput,
  GraphInput,
  NodeTransition,
  RuleEvidence,
  ExpressionInput,
} from "./systems.schemas.js";
const requestContext = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.headers["user-agent"] ?? null,
  requestId: getRequestId(req),
});
const actor = (req: Request) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first.");
  return req.user;
};
export const systemsRouter: Router = Router();
systemsRouter.use(requireAuth);
systemsRouter.get("/status", requireCapability("CONFIGURE_RULES"), (_req, res) => {
  res.json({
    success: true,
    data: {
      engine: "Deterministic AST + Soundex inverted index + shared-memory heap + DAG",
      heap: heapStatus(),
      fields: RULE_FIELDS,
      defaultRules: DEFAULT_TEXT_RULES,
    },
  });
});
systemsRouter.get("/records", requireCapability("VIEW_ANY_CASE"), async (req, res) => {
  res.json({ success: true, data: await identity.listRecords(actor(req)) });
});
systemsRouter.post("/identity/match", requireCapability("VIEW_ANY_CASE"), async (req, res) => {
  res.json({
    success: true,
    data: await guarded(req, () =>
      identity.findCandidates(actor(req), IdentityInput.parse(req.body)),
    ),
  });
});
systemsRouter.post(
  "/identity/ingest",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    res.status(201).json({
      success: true,
      data: await guarded(req, () =>
        identity.ingestRecords(actor(req), IngestInput.parse(req.body), requestContext(req)),
      ),
    });
  },
);
systemsRouter.put("/records/:id", requireCapability("RECORD_CASE_ACTIVITY"), async (req, res) => {
  res.json({
    success: true,
    data: await guarded(req, () =>
      identity.editRecord(
        actor(req),
        req.params.id!,
        RecordEditInput.parse(req.body),
        requestContext(req),
      ),
    ),
  });
});
systemsRouter.post(
  "/identity/decisions",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    res.json({
      success: true,
      data: await guarded(req, () =>
        identity.decideIdentity(actor(req), DecisionInput.parse(req.body), requestContext(req)),
      ),
    });
  },
);
systemsRouter.get("/graphs/case/:caseId", requireCapability("VIEW_ANY_CASE"), async (req, res) => {
  res.json({ success: true, data: await graph.getGraph(actor(req), req.params.caseId!) });
});
systemsRouter.put(
  "/graphs/case/:caseId",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    res.json({
      success: true,
      data: await guarded(req, () =>
        graph.saveGraph(
          actor(req),
          req.params.caseId!,
          GraphInput.parse(req.body),
          requestContext(req),
        ),
      ),
    });
  },
);
systemsRouter.patch(
  "/graphs/case/:caseId/nodes/:key",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    res.json({
      success: true,
      data: await guarded(req, () =>
        graph.transitionNode(
          actor(req),
          req.params.caseId!,
          req.params.key!,
          NodeTransition.parse(req.body),
          requestContext(req),
        ),
      ),
    });
  },
);
systemsRouter.get(
  "/rule-evidence/case/:caseId",
  requireCapability("VIEW_ANY_CASE"),
  async (req, res) => {
    await loadAccessibleCase(prisma, actor(req), req.params.caseId!);
    res.json({
      success: true,
      data: await prisma.caseRuleEvidence.findUnique({ where: { caseId: req.params.caseId! } }),
    });
  },
);
systemsRouter.put(
  "/rule-evidence/case/:caseId",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    res.json({
      success: true,
      data: await guarded(req, () =>
        graph.saveRuleEvidence(
          actor(req),
          req.params.caseId!,
          RuleEvidence.parse(req.body),
          requestContext(req),
        ),
      ),
    });
  },
);
systemsRouter.post("/rules/compile", requireCapability("CONFIGURE_RULES"), async (req, res) => {
  res.json({
    success: true,
    data: await guarded(req, () => {
      const input = ExpressionInput.parse(req.body),
        ast = compileExpression(input.expression, RULE_FIELDS, input.resultType);
      return { ast, result: evaluateExpression(ast, input.context), javascriptExecution: false };
    }),
  });
});
systemsRouter.get("/ledger", requireCapability("CONFIGURE_RULES"), async (req, res) => {
  const cursor = z.coerce.bigint().nonnegative().optional().parse(req.query.before);
  const rows = await prisma.activityLedger.findMany({
    where: cursor ? { sequence: { lt: cursor } } : {},
    orderBy: { sequence: "desc" },
    take: 100,
  });
  res.json({ success: true, data: rows.map((r) => ({ ...r, sequence: r.sequence.toString() })) });
});
systemsRouter.get("/ledger/verify", requireCapability("CONFIGURE_RULES"), async (_req, res) => {
  res.json({ success: true, data: await verifyActivityLedger(prisma) });
});

import { analyzeDag } from "@justicegrid/rules-engine";
import { AppError } from "@justicegrid/shared";
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { loadAccessibleCase } from "../../lib/caseAccess.js";
import { lockCaseWorkflow } from "../../lib/workflowLinks.js";
import { writeAuditEntry, type AuditRequestContext } from "../../lib/audit.js";
import { evaluateAndPersistCase } from "../../lib/priorityEvaluation.js";
import type { QueueActor } from "../priority/priority.service.js";
import type { GraphInput, NodeTransition, RuleEvidence } from "./systems.schemas.js";
const include = {
  nodes: { orderBy: { key: "asc" as const } },
  edges: { orderBy: [{ fromKey: "asc" as const }, { toKey: "asc" as const }] },
};
export async function getGraph(actor: QueueActor, caseId: string) {
  await loadAccessibleCase(prisma, actor, caseId);
  const graph = await prisma.workflowGraph.findUnique({ where: { caseId }, include });
  return graph
    ? {
        ...graph,
        analysis: analyzeDag(
          graph.nodes.map((n) => n.key),
          graph.edges.map((e) => ({ from: e.fromKey, to: e.toKey })),
          new Set(graph.nodes.filter((n) => n.status === "DONE").map((n) => n.key)),
        ),
      }
    : null;
}
export async function saveGraph(
  actor: QueueActor,
  caseId: string,
  body: z.infer<typeof GraphInput>,
  request: AuditRequestContext,
) {
  analyzeDag(
    body.nodes.map((n) => n.key),
    body.edges,
  );
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId);
      const old = await tx.workflowGraph.findUnique({ where: { caseId }, include });
      if ((old?.revision ?? -1) !== body.expectedRevision)
        throw new AppError("CONFLICT", "Graph changed; reload it.");
      const completed = new Set(
        old?.nodes.filter((n) => n.status === "DONE").map((n) => n.key) ?? [],
      );
      if ([...completed].some((id) => !body.nodes.some((n) => n.key === id)))
        throw new AppError(
          "VALIDATION_ERROR",
          "Completed nodes remain historical vertices; reopen before removing.",
        );
      const analysis = analyzeDag(
        body.nodes.map((n) => n.key),
        body.edges,
        completed,
      );
      for (const id of completed)
        if (analysis.predecessors[id]!.some((p) => !completed.has(p)))
          throw new AppError(
            "VALIDATION_ERROR",
            "New dependencies cannot make a completed node invalid.",
          );
      const graph = old
        ? await tx.workflowGraph.update({
            where: { id: old.id },
            data: { revision: { increment: 1 } },
          })
        : await tx.workflowGraph.create({ data: { caseId } });
      await tx.workflowEdge.deleteMany({ where: { graphId: graph.id } });
      await tx.workflowNode.deleteMany({
        where: { graphId: graph.id, key: { notIn: body.nodes.map((n) => n.key) } },
      });
      for (const node of body.nodes)
        await tx.workflowNode.upsert({
          where: { graphId_key: { graphId: graph.id, key: node.key } },
          create: { ...node, graphId: graph.id },
          update: { title: node.title },
        });
      await tx.workflowEdge.createMany({
        data: body.edges.map((e) => ({ graphId: graph.id, fromKey: e.from, toKey: e.to })),
        skipDuplicates: true,
      });
      await refreshReadiness(tx, graph.id);
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `DAG configuration: ${body.reason}`,
        before: old,
        after: { graph, configuration: body },
      });
      await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
      return { ...graph, analysis };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
export async function transitionNode(
  actor: QueueActor,
  caseId: string,
  key: string,
  body: z.infer<typeof NodeTransition>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId),
        graph = await tx.workflowGraph.findUnique({ where: { caseId }, include });
      if (!graph) throw new AppError("NOT_FOUND", "Graph not configured.");
      if (graph.revision !== body.expectedRevision)
        throw new AppError("CONFLICT", "Graph revision changed; reload before transition.");
      const node = graph.nodes.find((n) => n.key === key);
      if (!node) throw new AppError("NOT_FOUND", "Unknown workflow node.");
      const done = new Set(graph.nodes.filter((n) => n.status === "DONE").map((n) => n.key));
      const analysis = analyzeDag(
        graph.nodes.map((n) => n.key),
        graph.edges.map((e) => ({ from: e.fromKey, to: e.toKey })),
        done,
      );
      if (body.status === "DONE" && analysis.predecessors[key]!.some((id) => !done.has(id)))
        throw new AppError(
          "DEPENDENCY_BLOCKED",
          "Every prerequisite must complete before this node.",
        );
      if (body.status === "OPEN" && graph.edges.some((e) => e.fromKey === key && done.has(e.toKey)))
        throw new AppError(
          "DEPENDENCY_BLOCKED",
          "Reopen completed dependants before their prerequisite.",
        );
      const updated = await tx.workflowNode.update({
        where: { graphId_key: { graphId: graph.id, key } },
        data: {
          status: body.status,
          completionEvidence: body.evidence,
          completedAt: body.status === "DONE" ? new Date() : null,
        },
      });
      await tx.workflowGraph.update({
        where: { id: graph.id },
        data: { revision: { increment: 1 } },
      });
      await refreshReadiness(tx, graph.id);
      await writeAuditEntry(tx, actor, request, {
        action: "STATUS_CHANGE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `${key}: ${body.status}`,
        before: node,
        after: updated,
      });
      await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
      return { node: updated, revision: graph.revision + 1 };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
export async function saveRuleEvidence(
  actor: QueueActor,
  caseId: string,
  body: z.infer<typeof RuleEvidence>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId),
        old = await tx.caseRuleEvidence.findUnique({ where: { caseId } });
      if ((old?.revision ?? -1) !== body.expectedRevision)
        throw new AppError("CONFLICT", "Rule evidence changed; reload it.");
      const { expectedRevision: _revision, ...values } = body;
      const row = await tx.caseRuleEvidence.upsert({
        where: { caseId },
        create: { caseId, ...values, verifiedById: actor.id, verifiedAt: new Date() },
        update: {
          ...values,
          verifiedById: actor.id,
          verifiedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: "Recorded human-reviewed rule inputs; no legal entitlement inferred",
        before: old,
        after: row,
      });
      await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
      return row;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

async function refreshReadiness(tx: Prisma.TransactionClient, graphId: string) {
  const graph = await tx.workflowGraph.findUniqueOrThrow({ where: { id: graphId }, include });
  const ready = new Set(
    analyzeDag(
      graph.nodes.map((n) => n.key),
      graph.edges.map((e) => ({ from: e.fromKey, to: e.toKey })),
      new Set(graph.nodes.filter((n) => n.status === "DONE").map((n) => n.key)),
    ).ready,
  );
  for (const node of graph.nodes)
    if (
      node.status !== "DONE" &&
      ((ready.has(node.key) && !node.readyAt) || (!ready.has(node.key) && !!node.readyAt))
    )
      await tx.workflowNode.update({
        where: { graphId_key: { graphId, key: node.key } },
        data: { readyAt: ready.has(node.key) ? new Date() : null },
      });
}

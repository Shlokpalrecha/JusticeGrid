import type { PrismaClient } from "@prisma/client";
import { WorkflowFactsSchema } from "@justicegrid/shared";
import { toJson } from "../../src/lib/priorityEvaluation.js";

/** Synthetic demonstrations only; never a statement of actual legal entitlement. */
export async function seedWorkflowExamples(
  db: PrismaClient,
  ids: string[],
  adminId: string,
  now: Date,
) {
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
  const profile = await db.legalProfile.create({
    data: {
      name: "SYNTHETIC DEMO ONLY: confirmed-date example",
      version: 1,
      sourceId: "S1",
      locator: "Human-confirmed demonstration; no statutory calculator",
      territory: "India-wide",
      procedure: "BNSS",
      effectiveFrom: new Date("2024-07-01T00:00:00Z"),
      verifiedAt: new Date(at(-48)),
      verifiedById: adminId,
      verificationNotes:
        "Fictional source-applicability example for testing. Not a legal verification.",
      mode: "CONFIRMED_DATES_ONLY",
    },
  });
  const examples = [
    WorkflowFactsSchema.parse({
      urgentReports: [
        {
          id: "demo-referral",
          kind: "MEDICAL",
          reportedAt: at(-1),
          details: "Synthetic urgent-care referral awaiting response; fictional training example.",
          confidence: "REPORTED",
        },
      ],
    }),
    WorkflowFactsSchema.parse({
      procedure: "BNSS",
      procedureBasis: "Synthetic profile example",
      legalProfileId: profile.id,
      confirmedReviews: [
        {
          id: "demo-review",
          type: "A06",
          dueAt: at(12),
          precision: "INSTANT",
          origin: "STATUTE",
          sourceId: "S1",
          locator: "Synthetic reviewed date, not a computed entitlement",
          basis: "Fictional counsel-confirmed review",
          confirmedBy: adminId,
          confirmedAt: at(-24),
          profileId: profile.id,
          assumptions: "Synthetic demonstration only; no automatic sentence or custody calculation",
          countingConvention: "Human-confirmed example",
          anchorAt: at(-720),
        },
      ],
    }),
    WorkflowFactsSchema.parse({
      representation: "REQUESTED",
      requestReceivedAt: at(-26),
      undecidedSince: at(-26),
    }),
    WorkflowFactsSchema.parse({
      bailGrantedAt: at(-192),
      bailOrderCommunicatedAt: at(-180),
      nonReleaseReason: "Synthetic unresolved bond arrangements",
      otherDetentionBarrier: "UNKNOWN",
    }),
    WorkflowFactsSchema.parse({
      representation: "PRIVATE",
      counselName: "Fictional demonstration counsel",
      counselAcceptedAt: at(-24),
      releaseConfirmedAt: at(-24),
      nextHearingState: "AWAITING_LISTING",
      nextPlannedReviewAt: at(336),
    }),
    WorkflowFactsSchema.parse({
      utrc: {
        categories: ["Synthetic category selected for human review"],
        verifiedBy: adminId,
        meetingAt: at(120),
      },
      scheme: { applicability: "UNKNOWN", stage: "REPORT" },
    }),
  ];
  for (let i = 0; i < examples.length; i++)
    if (ids[i])
      await db.case.update({
        where: { id: ids[i] },
        data: {
          workflowFacts: toJson(examples[i]),
          ...(i === 4 ? { custodyType: "RELEASED" as const } : {}),
        },
      });
}

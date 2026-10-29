import { z } from "zod";
import { PriorityLevelSchema, RoleSchema, TaskStatusSchema } from "../enums.js";
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from "./common.js";

/** `GET /reports/pending-by-user` (spec §7): open-task counts grouped by
 * assignee — every user with at least one open task, plus unassigned. */
export const PendingByUserRowSchema = z.object({
  userId: IdSchema.nullable(),
  userName: z.string(),
  role: RoleSchema.nullable(),
  pendingCount: z.number().int(),
  inProgressCount: z.number().int(),
  blockedCount: z.number().int(),
  totalOpen: z.number().int(),
});
export type PendingByUserRow = z.infer<typeof PendingByUserRowSchema>;

/** `GET /reports/upcoming-hearings?days=` (spec §7). */
export const UpcomingHearingsQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).default(7),
  })
  .strict();
export type UpcomingHearingsQuery = z.infer<typeof UpcomingHearingsQuerySchema>;

export const UpcomingHearingRowSchema = z.object({
  hearingId: IdSchema,
  caseId: IdSchema,
  caseRef: z.string(),
  scheduledDate: IsoDateTimeSchema,
  hearingType: z.string(),
  assignedTo: z.string().nullable(),
});
export type UpcomingHearingRow = z.infer<typeof UpcomingHearingRowSchema>;

/** `GET /reports/overdue-actions` (spec §7): open tasks past their
 * `dueDate`. */
export const OverdueActionRowSchema = z.object({
  taskId: IdSchema,
  caseId: IdSchema,
  caseRef: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  dueDate: IsoDateTimeSchema,
  daysOverdue: z.number().int(),
  assignedTo: z.string().nullable(),
});
export type OverdueActionRow = z.infer<typeof OverdueActionRowSchema>;

/** `GET /reports/completed?from=&to=` (spec §7): tasks completed in a
 * date range. */
export const CompletedReportQuerySchema = z
  .object({
    from: IsoDateSchema.optional(),
    to: IsoDateSchema.optional(),
  })
  .strict();
export type CompletedReportQuery = z.infer<typeof CompletedReportQuerySchema>;

export const CompletedTaskRowSchema = z.object({
  taskId: IdSchema,
  caseId: IdSchema,
  caseRef: z.string(),
  title: z.string(),
  completedAt: IsoDateTimeSchema,
  completedBy: z.string().nullable(),
});
export type CompletedTaskRow = z.infer<typeof CompletedTaskRowSchema>;

/** `GET /reports/case-aging` (spec §7): every open (non-archived) case's
 * time in custody, oldest first. */
export const CaseAgingRowSchema = z.object({
  caseId: IdSchema,
  caseRef: z.string(),
  custodyStartDate: IsoDateTimeSchema.nullable(),
  daysInCustody: z.number().int().nullable(),
  priorityLevel: PriorityLevelSchema.nullable(),
  assignedTo: z.string().nullable(),
});
export type CaseAgingRow = z.infer<typeof CaseAgingRowSchema>;

/** `GET /reports/action-frequency` (spec §7): how many cases'
 * CURRENT (latest) evaluation triggers each rule — an at-a-glance view
 * of which rules are actually driving today's queue, not a historical
 * tally across every past recompute. */
export const ActionFrequencyRowSchema = z.object({
  actionType: z.string(),
  actionName: z.string(),
  triggerCount: z.number().int(),
});
export type ActionFrequencyRow = z.infer<typeof ActionFrequencyRowSchema>;

export const REPORT_NAMES = [
  "pending-by-user",
  "upcoming-hearings",
  "overdue-actions",
  "priority-distribution",
  "completed",
  "case-aging",
  "action-frequency",
] as const;
export const ReportNameSchema = z.enum(REPORT_NAMES);
export type ReportName = z.infer<typeof ReportNameSchema>;

export const ReportExportParamSchema = z.object({ name: ReportNameSchema }).strict();
export type ReportExportParam = z.infer<typeof ReportExportParamSchema>;

/** `GET /reports/:name/export.csv`'s query params are the union of every
 * individual report's own query params (`days` for upcoming-hearings,
 * `from`/`to` for completed) — all optional here since which ones apply
 * depends on `:name`. */
export const ReportExportQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).optional(),
    from: IsoDateSchema.optional(),
    to: IsoDateSchema.optional(),
  })
  .strict();
export type ReportExportQuery = z.infer<typeof ReportExportQuerySchema>;

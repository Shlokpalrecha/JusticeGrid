import { z } from "zod";

/**
 * Zod mirrors of every Prisma enum in apps/api/prisma/schema.prisma
 * (spec §5). Defined independently of `@prisma/client` — packages/shared
 * is imported by apps/web too, which cannot depend on the Prisma client.
 * Keep these values in lockstep with the Prisma schema by hand; a schema
 * change that isn't mirrored here will surface as a type/validation
 * mismatch as soon as the corresponding module is wired up.
 */

export const ROLE_VALUES = ["ADMIN", "LEGAL_PROFESSIONAL", "AUDITOR"] as const;
export const RoleSchema = z.enum(ROLE_VALUES);
export type Role = z.infer<typeof RoleSchema>;

export const CASE_STATUS_VALUES = [
  "REGISTERED",
  "UNDER_INVESTIGATION",
  "CHARGES_FRAMED",
  "TRIAL_ONGOING",
  "BAIL_PENDING",
  "BAIL_GRANTED",
  "DISPOSED",
  "TRANSFERRED",
  "CLOSED",
] as const;
export const CaseStatusSchema = z.enum(CASE_STATUS_VALUES);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

/** Case statuses that are no longer active workflow — used by the
 * HEARING_DATE_MISSING rule condition (spec §6.3) to decide whether a
 * missing next-hearing date should even be flagged. */
export const INACTIVE_CASE_STATUSES: readonly CaseStatus[] = ["DISPOSED", "CLOSED", "TRANSFERRED"];

export const CUSTODY_TYPE_VALUES = [
  "JUDICIAL",
  "POLICE",
  "INTERIM_BAIL",
  "RELEASED",
  "NOT_IN_CUSTODY",
] as const;
export const CustodyTypeSchema = z.enum(CUSTODY_TYPE_VALUES);
export type CustodyType = z.infer<typeof CustodyTypeSchema>;

export const BAIL_STATUS_VALUES = [
  "NOT_APPLIED",
  "APPLICATION_PREPARED",
  "APPLICATION_FILED",
  "HEARING_SCHEDULED",
  "GRANTED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export const BailStatusSchema = z.enum(BAIL_STATUS_VALUES);
export type BailStatus = z.infer<typeof BailStatusSchema>;

export const HEARING_TYPE_VALUES = [
  "FIRST_PRODUCTION",
  "REMAND_EXTENSION",
  "CHARGE_FRAMING",
  "BAIL_HEARING",
  "EVIDENCE",
  "ARGUMENTS",
  "JUDGMENT",
  "MISCELLANEOUS",
] as const;
export const HearingTypeSchema = z.enum(HEARING_TYPE_VALUES);
export type HearingType = z.infer<typeof HearingTypeSchema>;

export const HEARING_OUTCOME_VALUES = [
  "HELD",
  "ADJOURNED",
  "NOT_PRODUCED",
  "PARTIALLY_HEARD",
  "ORDER_PASSED",
  "CANCELLED",
  "PENDING",
] as const;
export const HearingOutcomeSchema = z.enum(HEARING_OUTCOME_VALUES);
export type HearingOutcome = z.infer<typeof HearingOutcomeSchema>;

export const TASK_STATUS_VALUES = [
  "PENDING",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;
export const TaskStatusSchema = z.enum(TASK_STATUS_VALUES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Task statuses considered "open" — used throughout the rule engine's
 * task-related conditions (TASK_OVERDUE, TASK_DUE_WITHIN_DAYS, etc). */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ["PENDING", "IN_PROGRESS", "BLOCKED"];

export const TASK_CATEGORY_VALUES = [
  "DOCUMENT_PREPARATION",
  "CLIENT_CONTACT",
  "COURT_FILING",
  "ORDER_REVIEW",
  "BAIL_APPLICATION",
  "EVIDENCE_COLLECTION",
  "COORDINATION",
  "FOLLOW_UP",
  "OTHER",
] as const;
export const TaskCategorySchema = z.enum(TASK_CATEGORY_VALUES);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

export const DOCUMENT_STATUS_VALUES = [
  "MISSING",
  "REQUESTED",
  "RECEIVED",
  "VERIFIED",
  "REJECTED",
  "NOT_APPLICABLE",
] as const;
export const DocumentStatusSchema = z.enum(DOCUMENT_STATUS_VALUES);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const DOCUMENT_TYPE_VALUES = [
  "FIR_COPY",
  "CHARGE_SHEET",
  "REMAND_ORDER",
  "BAIL_APPLICATION",
  "BAIL_ORDER",
  "SURETY_DOCUMENTS",
  "IDENTITY_PROOF",
  "MEDICAL_REPORT",
  "VAKALATNAMA",
  "PREVIOUS_ORDERS",
  "WITNESS_LIST",
  "CUSTODY_CERTIFICATE",
  "OTHER",
] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPE_VALUES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/**
 * Priority band. Vocabulary guardrail (spec §1.2): this is a *workflow
 * priority*, never a "risk score" or judgment about a person. HIGH means
 * "review this case's pending follow-up work first" — nothing more.
 */
export const PRIORITY_LEVEL_VALUES = ["ROUTINE", "MEDIUM", "HIGH"] as const;
export const PriorityLevelSchema = z.enum(PRIORITY_LEVEL_VALUES);
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

export const RULE_CATEGORY_VALUES = [
  "HEARING",
  "TASK",
  "DOCUMENT",
  "DATA_QUALITY",
  "ASSIGNMENT",
  "CUSTODY",
  "ACTIVITY",
] as const;
export const RuleCategorySchema = z.enum(RULE_CATEGORY_VALUES);
export type RuleCategory = z.infer<typeof RuleCategorySchema>;

export const CONDITION_TYPE_VALUES = [
  "HEARING_WITHIN_DAYS",
  "HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE",
  "HEARING_DATE_MISSING",
  "TASK_OVERDUE",
  "TASK_DUE_WITHIN_DAYS",
  "TASK_UNASSIGNED",
  "TASK_BLOCKED_OVER_DAYS",
  "MANDATORY_DOCUMENT_MISSING",
  "DOCUMENT_UNVERIFIED_OVER_DAYS",
  "CASE_FIELD_INCOMPLETE",
  "NO_ASSIGNEE",
  "ORDER_NOT_REVIEWED_AFTER_DAYS",
  "CUSTODY_DURATION_EXCEEDS_DAYS",
  "NO_ACTIVITY_SINCE_DAYS",
  "BAIL_APPLICATION_STALLED_DAYS",
  "HEARING_ADJOURNED_CONSECUTIVELY",
] as const;
export const ConditionTypeSchema = z.enum(CONDITION_TYPE_VALUES);
export type ConditionType = z.infer<typeof ConditionTypeSchema>;

export const AUDIT_ACTION_VALUES = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "ASSIGN",
  "UNASSIGN",
  "STATUS_CHANGE",
  "RULE_TOGGLE",
  "RULE_WEIGHT_CHANGE",
  "THRESHOLD_CHANGE",
  "PRIORITY_RECOMPUTE",
  "EXPORT",
  "ACCESS_DENIED",
  "PASSWORD_CHANGE",
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTION_VALUES);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const NOTIFICATION_TYPE_VALUES = [
  "TASK_ASSIGNED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "HEARING_APPROACHING",
  "CASE_ASSIGNED",
  "PRIORITY_ESCALATED",
  "DOCUMENT_REQUESTED",
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPE_VALUES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const EVALUATION_TRIGGER_VALUES = ["SYSTEM", "USER", "SCHEDULED", "RULE_CHANGE"] as const;
export const EvaluationTriggerSchema = z.enum(EVALUATION_TRIGGER_VALUES);
export type EvaluationTrigger = z.infer<typeof EvaluationTriggerSchema>;

import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// `openapi3-ts` (the source of the generator's real return type) is only
// a transitive dependency of zod-to-openapi, not one of ours directly —
// deriving the type via `ReturnType` avoids adding a direct dependency
// on a package we never import from ourselves.
type OpenApiDocument = ReturnType<OpenApiGeneratorV31["generateDocument"]>;
import {
  ApiErrorEnvelopeSchema,
  apiSuccessSchema,
  AuditChainVerificationSchema,
  AuditLogFilterSchema,
  AuditLogSchema,
  CaseAgingRowSchema,
  CaseAggregateSchema,
  CaseArchiveInputSchema,
  CaseAssignInputSchema,
  CaseCreateInputSchema,
  CaseFilterQuerySchema,
  CaseListItemSchema,
  CaseNoteCreateInputSchema,
  CaseNoteSchema,
  CaseSchema,
  ChargeCreateInputSchema,
  ChargeSchema,
  CompletedReportQuerySchema,
  CompletedTaskRowSchema,
  DocumentCreateInputSchema,
  DocumentRequirementSchema,
  DocumentUpdateInputSchema,
  DocumentVerifyInputSchema,
  HearingCreateInputSchema,
  HearingMarkOrderReviewedInputSchema,
  HearingSchema,
  HearingUpcomingQuerySchema,
  HearingUpdateInputSchema,
  IdParamSchema,
  NotificationListQuerySchema,
  NotificationSchema,
  OverdueActionRowSchema,
  PendingByUserRowSchema,
  PersonCreateInputSchema,
  PersonSchema,
  PersonUpdateInputSchema,
  PriorityDistributionSchema,
  PriorityEvaluationSchema,
  PriorityQueueFilterSchema,
  PriorityQueueItemSchema,
  ReportExportParamSchema,
  ReportExportQuerySchema,
  RuleCreateInputSchema,
  RuleSchema,
  RuleSimulateInputSchema,
  RuleSimulateResponseSchema,
  RulesetConfigCreateInputSchema,
  RulesetConfigSchema,
  RuleToggleInputSchema,
  RuleTriggerFrequencyRowSchema,
  RuleUpdateInputSchema,
  RuleVersionSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  TaskCompleteInputSchema,
  TaskCreateInputSchema,
  TaskFilterQuerySchema,
  TaskListItemSchema,
  TaskReassignInputSchema,
  TaskSchema,
  TaskUpdateInputSchema,
  TimelineEventSchema,
  UpcomingHearingItemSchema,
  UpcomingHearingRowSchema,
  UpcomingHearingsQuerySchema,
  UserSchema,
} from "@justicegrid/shared";
import {
  AuthSessionResponseSchema,
  ChangePasswordInputSchema,
  LoginInputSchema,
} from "../modules/auth/auth.schema.js";

extendZodWithOpenApi(z);

/**
 * Generated OpenAPI 3.1 document (spec §4: "generated from Zod via
 * zod-to-openapi, served at /api/docs via Swagger UI") — every route
 * registered here is one actually mounted in app.ts; this file is kept
 * in sync by hand (there is no route-introspection magic), so a new
 * route added to a `*.routes.ts` file should get a matching entry here
 * in the same change.
 */
const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

const auth = [{ bearerAuth: [] }];

function ok(dataSchema: z.ZodTypeAny, description = "Success") {
  return { description, content: { "application/json": { schema: apiSuccessSchema(dataSchema) } } };
}

const errorResponse = {
  description: "Error",
  content: { "application/json": { schema: ApiErrorEnvelopeSchema } },
};

const commonErrors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
};

const IdPathParam = IdParamSchema;
const CaseIdPathParam = z.object({ id: z.string() }).strict();
const CaseIdParamNamed = z.object({ caseId: z.string() }).strict();
const HearingIdPathParam = z.object({ id: z.string() }).strict();
const TaskIdPathParam = z.object({ id: z.string() }).strict();
const DocumentIdPathParam = z.object({ id: z.string() }).strict();
const RuleIdPathParam = z.object({ id: z.string() }).strict();

// ── Meta ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  tags: ["Meta"],
  summary: "Liveness check",
  responses: { 200: ok(z.object({ status: z.literal("ok") })) },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/health/ready",
  tags: ["Meta"],
  summary: "Readiness check (database connectivity)",
  responses: { 200: ok(z.object({ status: z.literal("ready") })), 503: errorResponse },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/version",
  tags: ["Meta"],
  summary: "API name and version",
  responses: { 200: ok(z.object({ name: z.string(), version: z.string() })) },
});

// ── Auth ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Auth"],
  summary: "Log in with email and password",
  request: { body: { content: { "application/json": { schema: LoginInputSchema } } } },
  responses: { 200: ok(AuthSessionResponseSchema), 401: errorResponse, 423: errorResponse },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate the refresh token (httpOnly cookie) for a new access token",
  responses: { 200: ok(AuthSessionResponseSchema), 401: errorResponse },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout",
  tags: ["Auth"],
  summary: "Revoke the current refresh token family and clear the cookie",
  responses: { 200: ok(z.object({})) },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/auth/me",
  tags: ["Auth"],
  summary: "The authenticated user's own profile",
  security: auth,
  responses: { 200: ok(UserSchema), 401: errorResponse },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/auth/change-password",
  tags: ["Auth"],
  summary: "Change the authenticated user's password",
  security: auth,
  request: { body: { content: { "application/json": { schema: ChangePasswordInputSchema } } } },
  responses: { 200: ok(z.object({})), 400: errorResponse, 401: errorResponse },
});

// ── Persons ─────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/persons",
  tags: ["Persons"],
  summary: "List synthetic persons",
  security: auth,
  responses: { 200: ok(z.array(PersonSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/persons/{id}",
  tags: ["Persons"],
  summary: "Get one person",
  security: auth,
  request: { params: IdPathParam },
  responses: { 200: ok(PersonSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/persons",
  tags: ["Persons"],
  summary: "Create a synthetic person",
  security: auth,
  request: { body: { content: { "application/json": { schema: PersonCreateInputSchema } } } },
  responses: { 201: ok(PersonSchema), ...commonErrors },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/persons/{id}",
  tags: ["Persons"],
  summary: "Update a person",
  security: auth,
  request: {
    params: IdPathParam,
    body: { content: { "application/json": { schema: PersonUpdateInputSchema } } },
  },
  responses: { 200: ok(PersonSchema), ...commonErrors },
});

// ── Cases ───────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/cases",
  tags: ["Cases"],
  summary: "List cases (filtered, paginated; scoped to assignment unless ADMIN/AUDITOR)",
  security: auth,
  request: { query: CaseFilterQuerySchema },
  responses: { 200: ok(z.array(CaseListItemSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases",
  tags: ["Cases"],
  summary: "Create a case",
  security: auth,
  request: { body: { content: { "application/json": { schema: CaseCreateInputSchema } } } },
  responses: { 201: ok(CaseSchema), 409: errorResponse, ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/cases/{id}",
  tags: ["Cases"],
  summary: "Get the full case aggregate",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(CaseAggregateSchema), ...commonErrors },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/cases/{id}",
  tags: ["Cases"],
  summary: "Update case fields",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: CaseCreateInputSchema.partial() } } },
  },
  responses: { 200: ok(CaseSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/assign",
  tags: ["Cases"],
  summary: "Assign a case to a user",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: CaseAssignInputSchema } } },
  },
  responses: { 200: ok(CaseSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/unassign",
  tags: ["Cases"],
  summary: "Unassign a case",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(CaseSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/archive",
  tags: ["Cases"],
  summary: "Archive a case",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: CaseArchiveInputSchema } } },
  },
  responses: { 200: ok(CaseSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/cases/{id}/timeline",
  tags: ["Cases"],
  summary: "Merged chronological timeline of hearings, tasks, documents, and notes",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(z.array(TimelineEventSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/cases/{id}/audit",
  tags: ["Cases"],
  summary: "Audit entries for this case and its child entities",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(z.array(AuditLogSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/notes",
  tags: ["Cases"],
  summary: "Add a note to a case",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: CaseNoteCreateInputSchema } } },
  },
  responses: { 201: ok(CaseNoteSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/cases/{id}/charges",
  tags: ["Cases"],
  summary: "List charges on a case",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(z.array(ChargeSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/charges",
  tags: ["Cases"],
  summary: "Add a charge to a case",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: ChargeCreateInputSchema } } },
  },
  responses: { 201: ok(ChargeSchema), ...commonErrors },
});

// ── Hearings ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/cases/{id}/hearings",
  tags: ["Hearings"],
  summary: "List hearings for a case",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(z.array(HearingSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/hearings",
  tags: ["Hearings"],
  summary: "Record a hearing on a case",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: HearingCreateInputSchema } } },
  },
  responses: { 201: ok(HearingSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/hearings/upcoming",
  tags: ["Hearings"],
  summary: "Hearings scheduled within the next N days",
  security: auth,
  request: { query: HearingUpcomingQuerySchema },
  responses: { 200: ok(z.array(UpcomingHearingItemSchema)), ...commonErrors },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/hearings/{id}",
  tags: ["Hearings"],
  summary: "Update a hearing",
  security: auth,
  request: {
    params: HearingIdPathParam,
    body: { content: { "application/json": { schema: HearingUpdateInputSchema } } },
  },
  responses: { 200: ok(HearingSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/hearings/{id}/mark-order-reviewed",
  tags: ["Hearings"],
  summary: "Mark a hearing's order as reviewed",
  security: auth,
  request: {
    params: HearingIdPathParam,
    body: { content: { "application/json": { schema: HearingMarkOrderReviewedInputSchema } } },
  },
  responses: { 200: ok(HearingSchema), ...commonErrors },
});

// ── Tasks ───────────────────────────────────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/tasks",
  tags: ["Tasks"],
  summary: "Create a task on a case",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: TaskCreateInputSchema } } },
  },
  responses: { 201: ok(TaskSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/tasks",
  tags: ["Tasks"],
  summary: "List tasks (filtered, paginated)",
  security: auth,
  request: { query: TaskFilterQuerySchema },
  responses: { 200: ok(z.array(TaskListItemSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/my-queue",
  tags: ["Tasks"],
  summary: "The authenticated user's own open tasks",
  security: auth,
  responses: { 200: ok(z.array(TaskListItemSchema)), ...commonErrors },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/tasks/{id}",
  tags: ["Tasks"],
  summary: "Update a task",
  security: auth,
  request: {
    params: TaskIdPathParam,
    body: { content: { "application/json": { schema: TaskUpdateInputSchema } } },
  },
  responses: { 200: ok(TaskSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/tasks/{id}/complete",
  tags: ["Tasks"],
  summary: "Mark a task complete",
  security: auth,
  request: {
    params: TaskIdPathParam,
    body: { content: { "application/json": { schema: TaskCompleteInputSchema } } },
  },
  responses: { 200: ok(TaskSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/tasks/{id}/reassign",
  tags: ["Tasks"],
  summary: "Reassign a task to a different user",
  security: auth,
  request: {
    params: TaskIdPathParam,
    body: { content: { "application/json": { schema: TaskReassignInputSchema } } },
  },
  responses: { 200: ok(TaskSchema), ...commonErrors },
});

// ── Documents ───────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/cases/{id}/documents",
  tags: ["Documents"],
  summary: "List document requirements for a case",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 200: ok(z.array(DocumentRequirementSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/documents",
  tags: ["Documents"],
  summary: "Add a document requirement to a case",
  security: auth,
  request: {
    params: CaseIdPathParam,
    body: { content: { "application/json": { schema: DocumentCreateInputSchema } } },
  },
  responses: { 201: ok(DocumentRequirementSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/cases/{id}/documents/apply-checklist",
  tags: ["Documents"],
  summary: "Seed the default mandatory document checklist for a case",
  security: auth,
  request: { params: CaseIdPathParam },
  responses: { 201: ok(z.array(DocumentRequirementSchema)), ...commonErrors },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/documents/{id}",
  tags: ["Documents"],
  summary: "Update a document requirement's status",
  security: auth,
  request: {
    params: DocumentIdPathParam,
    body: { content: { "application/json": { schema: DocumentUpdateInputSchema } } },
  },
  responses: { 200: ok(DocumentRequirementSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/documents/{id}/verify",
  tags: ["Documents"],
  summary: "Verify a received document",
  security: auth,
  request: {
    params: DocumentIdPathParam,
    body: { content: { "application/json": { schema: DocumentVerifyInputSchema } } },
  },
  responses: { 200: ok(DocumentRequirementSchema), ...commonErrors },
});

// ── Rules ───────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/rules",
  tags: ["Rules"],
  summary: "List every rule in the ruleset (all roles read)",
  security: auth,
  responses: { 200: ok(z.array(RuleSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/rules",
  tags: ["Rules"],
  summary: "Create a rule (ADMIN only)",
  security: auth,
  request: { body: { content: { "application/json": { schema: RuleCreateInputSchema } } } },
  responses: { 201: ok(RuleSchema), ...commonErrors },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/rules/{id}",
  tags: ["Rules"],
  summary: "Update a rule — also triggers a full recompute (ADMIN only)",
  security: auth,
  request: {
    params: RuleIdPathParam,
    body: { content: { "application/json": { schema: RuleUpdateInputSchema } } },
  },
  responses: { 200: ok(RuleSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/rules/{id}/toggle",
  tags: ["Rules"],
  summary: "Enable/disable a rule — also triggers a full recompute (ADMIN only)",
  security: auth,
  request: {
    params: RuleIdPathParam,
    body: { content: { "application/json": { schema: RuleToggleInputSchema } } },
  },
  responses: { 200: ok(RuleSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/rules/{id}/versions",
  tags: ["Rules"],
  summary: "A rule's append-only change history",
  security: auth,
  request: { params: RuleIdPathParam },
  responses: { 200: ok(z.array(RuleVersionSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/rules/config",
  tags: ["Rules"],
  summary: "The currently active ruleset configuration (thresholds)",
  security: auth,
  responses: { 200: ok(RulesetConfigSchema), ...commonErrors },
});
registry.registerPath({
  method: "put",
  path: "/api/v1/rules/config",
  tags: ["Rules"],
  summary:
    "Activate a new ruleset configuration version — also triggers a full recompute (ADMIN only)",
  security: auth,
  request: {
    body: { content: { "application/json": { schema: RulesetConfigCreateInputSchema } } },
  },
  responses: { 200: ok(RulesetConfigSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/rules/simulate",
  tags: ["Rules"],
  summary:
    "Preview a candidate ruleset's effect on the queue, without persisting anything (ADMIN only)",
  security: auth,
  request: { body: { content: { "application/json": { schema: RuleSimulateInputSchema } } } },
  responses: { 200: ok(RuleSimulateResponseSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/rules/recompute-all",
  tags: ["Rules"],
  summary: "Recompute every case's priority under the current ruleset (ADMIN only)",
  security: auth,
  responses: { 200: ok(z.object({ recomputedCount: z.number().int() })), ...commonErrors },
});

// ── Priority ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/priority/queue",
  tags: ["Priority"],
  summary: "The explainable, ranked priority queue (scoped to assignment unless ADMIN/AUDITOR)",
  security: auth,
  request: { query: PriorityQueueFilterSchema },
  responses: { 200: ok(z.array(PriorityQueueItemSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/priority/case/{caseId}",
  tags: ["Priority"],
  summary: "A case's current priority evaluation, with full reasons",
  security: auth,
  request: { params: CaseIdParamNamed },
  responses: { 200: ok(PriorityEvaluationSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/priority/case/{caseId}/history",
  tags: ["Priority"],
  summary: "Every past priority evaluation for a case, newest first",
  security: auth,
  request: { params: CaseIdParamNamed },
  responses: { 200: ok(z.array(PriorityEvaluationSchema)), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/priority/case/{caseId}/recompute",
  tags: ["Priority"],
  summary: "Manually recompute a case's priority now",
  security: auth,
  request: { params: CaseIdParamNamed },
  responses: { 200: ok(PriorityEvaluationSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/priority/distribution",
  tags: ["Priority"],
  summary: "Case counts per priority band (scoped to assignment unless ADMIN/AUDITOR)",
  security: auth,
  responses: { 200: ok(PriorityDistributionSchema), ...commonErrors },
});

// ── Audit ───────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/audit",
  tags: ["Audit"],
  summary: "List audit entries (filtered, paginated; ADMIN/AUDITOR only)",
  security: auth,
  request: { query: AuditLogFilterSchema },
  responses: { 200: ok(z.array(AuditLogSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/audit/verify-chain",
  tags: ["Audit"],
  summary: "Walk the entire hash chain and report whether it is intact",
  security: auth,
  responses: { 200: ok(AuditChainVerificationSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/audit/export.csv",
  tags: ["Audit"],
  summary: "Export the (filtered) audit log as CSV",
  security: auth,
  request: { query: AuditLogFilterSchema },
  responses: {
    200: { description: "CSV file", content: { "text/csv": { schema: z.string() } } },
    ...commonErrors,
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/audit/{id}",
  tags: ["Audit"],
  summary: "Get one audit entry",
  security: auth,
  request: { params: IdPathParam },
  responses: { 200: ok(AuditLogSchema), ...commonErrors },
});

// ── Reports ─────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/pending-by-user",
  tags: ["Reports"],
  summary: "Open task counts grouped by assignee",
  security: auth,
  responses: { 200: ok(z.array(PendingByUserRowSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/upcoming-hearings",
  tags: ["Reports"],
  summary: "Hearings scheduled within the next N days",
  security: auth,
  request: { query: UpcomingHearingsQuerySchema },
  responses: { 200: ok(z.array(UpcomingHearingRowSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/overdue-actions",
  tags: ["Reports"],
  summary: "Open tasks past their due date",
  security: auth,
  responses: { 200: ok(z.array(OverdueActionRowSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/priority-distribution",
  tags: ["Reports"],
  summary: "Case counts per priority band",
  security: auth,
  responses: { 200: ok(PriorityDistributionSchema), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/completed",
  tags: ["Reports"],
  summary: "Tasks completed within a date range",
  security: auth,
  request: { query: CompletedReportQuerySchema },
  responses: { 200: ok(z.array(CompletedTaskRowSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/case-aging",
  tags: ["Reports"],
  summary: "Every open case's time in custody, oldest first",
  security: auth,
  responses: { 200: ok(z.array(CaseAgingRowSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/rule-trigger-frequency",
  tags: ["Reports"],
  summary: "How many cases' current evaluation triggers each rule",
  security: auth,
  responses: { 200: ok(z.array(RuleTriggerFrequencyRowSchema)), ...commonErrors },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/reports/{name}/export.csv",
  tags: ["Reports"],
  summary: "Export any named report as CSV",
  security: auth,
  request: { params: ReportExportParamSchema, query: ReportExportQuerySchema },
  responses: {
    200: { description: "CSV file", content: { "text/csv": { schema: z.string() } } },
    ...commonErrors,
  },
});

// ── Search ──────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/search",
  tags: ["Search"],
  summary: "Cross-entity search across cases, persons, and tasks (respects authorization)",
  security: auth,
  request: { query: SearchQuerySchema },
  responses: { 200: ok(SearchResponseSchema), ...commonErrors },
});

// ── Notifications ───────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/notifications",
  tags: ["Notifications"],
  summary: "The authenticated user's own notifications",
  security: auth,
  request: { query: NotificationListQuerySchema },
  responses: {
    200: ok(z.object({ items: z.array(NotificationSchema), unreadCount: z.number().int() })),
    ...commonErrors,
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/notifications/{id}/read",
  tags: ["Notifications"],
  summary: "Mark one notification read",
  security: auth,
  request: { params: IdPathParam },
  responses: { 200: ok(NotificationSchema), ...commonErrors },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/notifications/read-all",
  tags: ["Notifications"],
  summary: "Mark all of the caller's notifications read",
  security: auth,
  responses: { 200: ok(z.object({ updatedCount: z.number().int() })), ...commonErrors },
});

export function buildOpenApiDocument(): OpenApiDocument {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "JusticeGrid API",
      version: "0.1.0",
      description:
        "Prototype legal-aid workflow prioritization API. Synthetic data only. " +
        "Priority is a deterministic, explainable workflow-ordering aid — never a " +
        "legal, judicial, or bail decision. Does not integrate with or claim to be " +
        "CCTNS, eCourts, e-Prisons, NJDG, or ICJS. See JUSTICEGRID_BUILD_SPEC.md §1.",
    },
    servers: [{ url: "/", description: "This server" }],
  });
}

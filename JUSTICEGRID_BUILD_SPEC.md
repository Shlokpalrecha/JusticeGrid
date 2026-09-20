# JUSTICEGRID — MASTER BUILD SPECIFICATION & PROMPT

> **How to use this file:** save it in an empty folder as `JUSTICEGRID_BUILD_SPEC.md`, open Claude Code in that folder, and send:
>
> `Read JUSTICEGRID_BUILD_SPEC.md in full. Do not write any code yet. Confirm your understanding, list the phases, then begin Phase 0. Follow the working agreement exactly.`
>
> Alternatively paste this entire document as your first message.

---

## 0. ROLE AND MANDATE

You are a principal full-stack engineer with 20+ years of experience shipping production systems in regulated domains (government, legal-tech, healthcare, fintech). You have built case-management systems, rule/decision engines, RBAC platforms, and audit-compliant record systems. You care about correctness, determinism, testability, traceability, and defensibility far more than about cleverness.

You are building **JusticeGrid**: an academic, end-to-end, fully working prototype of a **legal-aid workflow and explainable prioritization system**. It is a Mini Project Phase I deliverable that must survive a technical viva conducted by professors who will attack the claims.

Build the **complete system** — backend, frontend, database, rule engine, seed data, tests, documentation, diagrams, Docker setup, and demo script. Nothing stubbed. Nothing mocked. Nothing "left as an exercise." Every feature listed here must actually run.

---

## 1. NON-NEGOTIABLE DOMAIN GUARDRAILS

These are the project's defensive positioning. They are the difference between passing and failing the viva. **Violating them is a build failure.**

1. **JusticeGrid does not make legal or judicial decisions.** It recommends an *order of review* for a team's own follow-up work. A human decides every action.
2. **It prioritizes workflow attention — not people, not liberty, not bail eligibility.** Never generate wording like "risk score", "bail recommendation", "release likelihood", "prisoner score", "threat level". The vocabulary is strictly: *workflow priority*, *review queue*, *triggered condition*, *pending action*, *time-sensitive*.
3. **No machine learning. No AI inference. No probabilistic scoring.** The engine is a deterministic, configurable, explainable rule engine. If the same inputs and same ruleset version are supplied, the output is byte-identical. Justification: no legally validated training dataset exists, sensitive domain, historical-bias risk, and predictions would be unexplainable.
4. **Every priority result must carry human-readable reasons.** A score with no explanation is a bug. The UI must always show *why*.
5. **Synthetic data only.** No real prisoner, accused, victim, lawyer, or case information. Generated names are obviously fictional. No Aadhaar, no real FIR numbers, no real court IDs. Person records are pseudonymous (alias codes + age bands).
6. **JusticeGrid is not, and must never claim to be:** CCTNS (police/investigation), eCourts (official court records/orders), e-Prisons (prison administration), NJDG (national analytics), ICJS (interoperability). It does not integrate with them in this prototype. The UI and docs must state this.
7. **The problem is a research hypothesis, not a proven fact.** Documentation must never claim "all legal work is manual" or "this reduces pendency" or "this releases prisoners faster." Claim only: *a prototype for organizing an authorized team's assigned follow-up work.*
8. **Persistent UI disclaimer.** A banner/footer visible on every authenticated page: *"Prototype — synthetic data only. Workflow prioritization is a review aid, not a legal or judicial decision. All actions require human review."*
9. **Rules are demonstration rules approved for testing — not official legal standards.** Say so in the rules admin screen and in the docs.

---

## 2. THE PRODUCT IN ONE PARAGRAPH

An authorized legal-aid team handles ~200 assigned undertrial cases. Official government systems hold the court, police, and prison records. The team still has to manage *its own last-mile work*: check an order, prepare a document, contact the assigned lawyer, update a hearing, complete a follow-up, and record what was done. JusticeGrid stores the permitted operational information for that workflow, applies configurable deterministic rules (e.g. *hearing approaching + preparation incomplete*), produces an explainable priority queue with reasons, lets a human assign and complete actions, and records every change in an audit trail.

### Canonical workflow (implement exactly this loop)

```
Authorized user logs in
        ↓
Selects an assigned case
        ↓
Updates hearings and tasks
        ↓
Workflow rules are evaluated
        ↓
Priority and reasons are generated
        ↓
Human reviews the queue
        ↓
Action is assigned and tracked
```

---

## 3. TECHNOLOGY STACK (use exactly this)

**Monorepo:** pnpm workspaces + Turborepo.

| Layer | Choice |
|---|---|
| Language | TypeScript 5.x, `strict: true`, everywhere |
| Runtime | Node.js 20 LTS |
| API | Express 4 + `express-async-errors` |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 (via Docker Compose) |
| Validation | Zod (shared between API and web) |
| Auth | JWT access token + rotating refresh token (httpOnly cookie), Argon2id hashing |
| Logging | Pino (structured JSON, request IDs, redaction) |
| API docs | OpenAPI 3.1 generated from Zod (`zod-to-openapi`), served at `/api/docs` via Swagger UI |
| Frontend | React 18 + Vite + TypeScript |
| Routing | React Router 6 (data router) |
| Server state | TanStack Query v5 |
| Forms | React Hook Form + Zod resolver |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| Icons | lucide-react |
| Charts | Recharts |
| Tables | TanStack Table v8 |
| Dates | date-fns (+ `date-fns-tz`, fixed to `Asia/Kolkata`) |
| Unit/Integration tests | Vitest + Supertest |
| E2E tests | Playwright |
| Seeding | `@faker-js/faker` with a **fixed seed** for reproducibility |
| Lint/format | ESLint + Prettier |
| Git hooks | Husky + lint-staged |
| CI | GitHub Actions |
| Containers | Docker + docker-compose |

**Forbidden:** any ML/AI library, any external API call at runtime, any telemetry, any paid service, any non-deterministic scoring.

---

## 4. REPOSITORY LAYOUT

```
justicegrid/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed/
│  │  │     ├─ index.ts
│  │  │     ├─ fixtures.ts          # deterministic demo cases (Case A / Case B etc.)
│  │  │     └─ generators.ts        # faker-based synthetic bulk data
│  │  └─ src/
│  │     ├─ config/                 # env parsing (Zod), constants
│  │     ├─ middleware/             # auth, rbac, audit, errors, rateLimit, requestId, validate
│  │     ├─ modules/
│  │     │  ├─ auth/  users/  cases/  persons/  hearings/  tasks/
│  │     │  ├─ documents/  rules/  priority/  audit/  reports/  search/  notifications/
│  │     │  └─ (each: *.routes.ts | *.controller.ts | *.service.ts | *.schema.ts | *.test.ts)
│  │     ├─ lib/                    # prisma client, logger, jwt, hashing, pagination, csv, errors
│  │     ├─ jobs/                   # scheduled re-evaluation
│  │     ├─ app.ts
│  │     └─ server.ts
│  └─ web/
│     └─ src/
│        ├─ app/                    # router, providers, layouts
│        ├─ components/             # ui/ (shadcn), common/, domain/
│        ├─ features/               # auth, dashboard, queue, cases, tasks, rules, audit, reports, admin
│        ├─ hooks/  lib/  types/  styles/
│        └─ main.tsx
├─ packages/
│  ├─ shared/                       # Zod schemas, TS types, enums, constants, DTOs, error codes
│  └─ rules-engine/                 # ⭐ PURE, ZERO-DEPENDENCY, FULLY TESTED
│     └─ src/
│        ├─ types.ts  conditions.ts  evaluate.ts  score.ts  explain.ts
│        ├─ ordering.ts  hash.ts  version.ts  index.ts
│        └─ __tests__/  (+ __tests__/golden/*.json)
├─ docs/
│  ├─ 00-problem-statement.md      01-srs.md                02-architecture.md
│  ├─ 03-data-model.md             04-api-reference.md      05-rule-engine.md
│  ├─ 06-security.md               07-test-plan.md          08-traceability-matrix.md
│  ├─ 09-demo-script.md            10-viva-qa.md             11-limitations-and-ethics.md
│  └─ diagrams/*.mmd               (Mermaid: ER, use-case, class, sequence, activity, DFD-0, DFD-1, component, deployment)
├─ .github/workflows/ci.yml
├─ docker-compose.yml   Dockerfile.api   Dockerfile.web
├─ .env.example         README.md        Makefile
└─ JUSTICEGRID_BUILD_SPEC.md
```

**Architectural rule:** `packages/rules-engine` must import **nothing** — not Prisma, not date libs, not the DB. It receives a plain `CaseEvaluationInput` object and a `now: Date`, and returns a plain result. This isolation is the academic centrepiece and must be defensible in the viva.

---

## 5. DATA MODEL (complete Prisma schema)

Use `cuid()` IDs, `createdAt`/`updatedAt` everywhere, soft delete via `deletedAt` where noted, and explicit indexes.

### Enums

```prisma
enum Role                { ADMIN  LEGAL_PROFESSIONAL  AUDITOR }
enum CaseStatus          { REGISTERED  UNDER_INVESTIGATION  CHARGES_FRAMED  TRIAL_ONGOING  BAIL_PENDING  BAIL_GRANTED  DISPOSED  TRANSFERRED  CLOSED }
enum CustodyType         { JUDICIAL  POLICE  INTERIM_BAIL  RELEASED  NOT_IN_CUSTODY }
enum BailStatus          { NOT_APPLIED  APPLICATION_PREPARED  APPLICATION_FILED  HEARING_SCHEDULED  GRANTED  REJECTED  WITHDRAWN }
enum HearingType         { FIRST_PRODUCTION  REMAND_EXTENSION  CHARGE_FRAMING  BAIL_HEARING  EVIDENCE  ARGUMENTS  JUDGMENT  MISCELLANEOUS }
enum HearingOutcome      { HELD  ADJOURNED  NOT_PRODUCED  PARTIALLY_HEARD  ORDER_PASSED  CANCELLED  PENDING }
enum TaskStatus          { PENDING  IN_PROGRESS  BLOCKED  COMPLETED  CANCELLED }
enum TaskCategory        { DOCUMENT_PREPARATION  CLIENT_CONTACT  COURT_FILING  ORDER_REVIEW  BAIL_APPLICATION  EVIDENCE_COLLECTION  COORDINATION  FOLLOW_UP  OTHER }
enum DocumentStatus      { MISSING  REQUESTED  RECEIVED  VERIFIED  REJECTED  NOT_APPLICABLE }
enum DocumentType        { FIR_COPY  CHARGE_SHEET  REMAND_ORDER  BAIL_APPLICATION  BAIL_ORDER  SURETY_DOCUMENTS  IDENTITY_PROOF  MEDICAL_REPORT  VAKALATNAMA  PREVIOUS_ORDERS  WITNESS_LIST  CUSTODY_CERTIFICATE  OTHER }
enum PriorityLevel       { ROUTINE  MEDIUM  HIGH }
enum RuleCategory        { HEARING  TASK  DOCUMENT  DATA_QUALITY  ASSIGNMENT  CUSTODY  ACTIVITY }
enum ConditionType       { HEARING_WITHIN_DAYS  HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE  HEARING_DATE_MISSING  TASK_OVERDUE  TASK_DUE_WITHIN_DAYS  TASK_UNASSIGNED  TASK_BLOCKED_OVER_DAYS  MANDATORY_DOCUMENT_MISSING  DOCUMENT_UNVERIFIED_OVER_DAYS  CASE_FIELD_INCOMPLETE  NO_ASSIGNEE  ORDER_NOT_REVIEWED_AFTER_DAYS  CUSTODY_DURATION_EXCEEDS_DAYS  NO_ACTIVITY_SINCE_DAYS  BAIL_APPLICATION_STALLED_DAYS  HEARING_ADJOURNED_CONSECUTIVELY }
enum AuditAction         { CREATE  UPDATE  DELETE  LOGIN  LOGIN_FAILED  LOGOUT  ASSIGN  UNASSIGN  STATUS_CHANGE  RULE_TOGGLE  RULE_WEIGHT_CHANGE  THRESHOLD_CHANGE  PRIORITY_RECOMPUTE  EXPORT  ACCESS_DENIED  PASSWORD_CHANGE }
enum NotificationType    { TASK_ASSIGNED  TASK_DUE_SOON  TASK_OVERDUE  HEARING_APPROACHING  CASE_ASSIGNED  PRIORITY_ESCALATED  DOCUMENT_REQUESTED }
```

### Core models (fields required)

**User** — `id, email @unique, passwordHash, fullName, employeeCode @unique, role, designation, phone, isActive, mustChangePassword, lastLoginAt, failedLoginAttempts, lockedUntil, createdById, createdAt, updatedAt, deletedAt`

**RefreshToken** — `id, userId, tokenHash @unique, familyId, expiresAt, revokedAt, replacedByTokenHash, userAgent, ipAddress, createdAt` (rotation + reuse detection)

**Person** (pseudonymous undertrial) — `id, aliasCode @unique (e.g. UT-0001), displayName (obviously fictional), ageBand (enum-like string: "18-25"…), gender, isSynthetic @default(true) , languagePreference, hasDisability, isFirstTimeOffender, economicallyWeakerSection, emergencyContactAlias, notes, createdAt, updatedAt`
> Add a check/validation: `isSynthetic` must be true. Reject writes otherwise.

**Case** — `id, caseRef @unique (JG-YYYY-NNNN), personId, courtName, courtType, district, state, policeStationAlias, firNumberSynthetic, firYear, caseStatus, custodyType, custodyStartDate, bailStatus, bailAppliedDate, assignedToId?, assignedAt, assignedById, createdById, lastHearingDate?, nextHearingDate?, lastActivityAt, currentPriorityLevel?, currentPriorityScore?, lastEvaluatedAt?, isArchived, archivedReason, createdAt, updatedAt, deletedAt`
> Indexes: `nextHearingDate`, `assignedToId`, `caseStatus`, `currentPriorityScore`, `(assignedToId, currentPriorityScore)`, `lastActivityAt`.

**Charge** — `id, caseId, actName (e.g. "IPC — synthetic"), sectionCode, description, isBailableFlag, severityBand, createdAt`

**Hearing** — `id, caseId, scheduledDate, actualDate?, hearingType, purpose, outcome, wasProduced, adjournmentReason?, orderSummary?, orderReviewed @default(false), orderReviewedAt?, orderReviewedById?, nextHearingDate?, recordedById, createdAt, updatedAt`
> Index `(caseId, scheduledDate)`.

**Task** — `id, caseId, title, description, category, assignedToId?, createdById, dueDate, status, blockedReason?, completedAt?, completedById?, completionNote?, cancelledReason?, isPreparationTask @default(false), createdAt, updatedAt`
> `isPreparationTask` marks a task as hearing-preparation, used by the `HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE` rule.
> Indexes: `(caseId, status)`, `(assignedToId, status, dueDate)`, `dueDate`.

**DocumentRequirement** — `id, caseId, documentType, isMandatory, status, requestedAt?, receivedAt?, verifiedAt?, verifiedById?, sourceNote, remarks, createdAt, updatedAt`

**CaseNote** — `id, caseId, authorId, body, isInternal, createdAt` (no edit; append-only)

**CaseAssignmentHistory** — `id, caseId, fromUserId?, toUserId?, changedById, reason, changedAt`

**Rule** — `id, code @unique (e.g. R-HEARING-3D), name, description, category, conditionType, params Json, weight Int, isEnabled, displayTemplate String, severityHint, version Int @default(1), createdById, updatedById, createdAt, updatedAt`
> `displayTemplate` example: `"Hearing is within {days} days ({hearingDate}) and preparation is incomplete"` — rendered with evidence values.

**RuleVersion** (append-only history — required because rules are configurable) — `id, ruleId, version, snapshotJson, changedById, changeReason, changedAt`

**RulesetConfig** (singleton-ish, versioned) — `id, version Int, highThreshold @default(7), mediumThreshold @default(3), maxScoreCap?, isActive, activatedAt, activatedById, notes`
> Only one active at a time. Changing thresholds creates a **new version** (never mutate).

**PriorityEvaluation** — `id, caseId, evaluatedAt, totalScore, rawScore, priorityLevel, rulesetVersion, engineVersion, inputHash (sha256), triggeredCount, durationMs, triggeredBy (SYSTEM|USER|SCHEDULED|RULE_CHANGE), triggeredById?`
> Index `(caseId, evaluatedAt desc)`. Keep history — do not overwrite.

**TriggeredReason** — `id, evaluationId, ruleId, ruleCode, ruleName, points, category, reasonText (already rendered), evidenceJson, orderIndex`

**AuditLog** (append-only, tamper-evident) — `id, sequence BigInt @unique (monotonic), actorId?, actorEmail, actorRole?, action, entityType, entityId?, entityLabel, summary, beforeJson?, afterJson?, changedFields String[], ipAddress, userAgent, requestId, success, failureReason?, previousHash, hash, createdAt`
> `hash = sha256(sequence | actorId | action | entityType | entityId | createdAt | canonical(beforeJson) | canonical(afterJson) | previousHash)`. Provide `GET /api/v1/audit/verify-chain` that walks the chain and reports the first break. **No update or delete routes for audit rows, ever.**

**Notification** — `id, userId, type, title, body, relatedEntityType, relatedEntityId, isRead, readAt, createdAt`

**SavedFilter** — `id, userId, name, queryJson, isShared, createdAt`

Write real Prisma migrations (not `db push`). Add `onDelete` behaviour explicitly (restrict for Case→Person, cascade for Case→Hearing/Task/Document).

---

## 6. THE RULE ENGINE (the heart of the project)

### 6.1 Contract

```ts
// packages/rules-engine/src/types.ts
export const ENGINE_VERSION = "1.0.0";

export interface CaseEvaluationInput {
  caseId: string;
  caseRef: string;
  assignedToId: string | null;
  caseStatus: string;
  custodyType: string;
  custodyStartDate: string | null;   // ISO date, no time
  nextHearingDate: string | null;
  lastHearingDate: string | null;
  lastActivityAt: string | null;
  bailStatus: string;
  bailAppliedDate: string | null;
  consecutiveAdjournments: number;
  requiredFieldsPresent: Record<string, boolean>;
  lastHearing: { id: string; scheduledDate: string; orderReviewed: boolean; orderRecordedAt: string | null } | null;
  tasks:     { id: string; status: string; dueDate: string; assignedToId: string | null;
               isPreparationTask: boolean; blockedSince: string | null }[];
  documents: { id: string; documentType: string; isMandatory: boolean;
               status: string; requestedAt: string | null }[];
}

export interface RuleDefinition {
  id: string; code: string; name: string; category: string;
  conditionType: ConditionType; params: Record<string, number | string | boolean | string[]>;
  weight: number; isEnabled: boolean; displayTemplate: string; version: number;
}

export interface RulesetConfig {
  version: number; highThreshold: number; mediumThreshold: number; maxScoreCap?: number;
}

export interface TriggeredReasonResult {
  ruleId: string; ruleCode: string; ruleName: string; category: string;
  points: number; reasonText: string; evidence: Record<string, unknown>; orderIndex: number;
}

export interface EvaluationResult {
  caseId: string;
  rawScore: number;
  totalScore: number;            // after cap
  priorityLevel: "ROUTINE" | "MEDIUM" | "HIGH";
  reasons: TriggeredReasonResult[];
  rulesetVersion: number;
  engineVersion: string;
  inputHash: string;
  evaluatedAtIso: string;
  explanation: string;           // e.g. "4 + 4 + 3 = 11 → HIGH (threshold ≥ 7)"
}

export function evaluateCase(
  input: CaseEvaluationInput,
  rules: RuleDefinition[],
  config: RulesetConfig,
  now: Date
): EvaluationResult;

export function buildQueue(results: EvaluationResult[], inputs: CaseEvaluationInput[]): EvaluationResult[];
```

### 6.2 Determinism requirements (test these explicitly)

- `now` is **always injected**. `Date.now()`, `new Date()` without an argument, `Math.random()`, and locale-dependent formatting are **banned inside the package** — enforce with an ESLint `no-restricted-globals`/`no-restricted-syntax` rule and a unit test that greps the source.
- All date maths is calendar-day based in `Asia/Kolkata`, computed by normalising to `YYYY-MM-DD` strings. "Within 3 days" means `0 <= (hearingDate - today) <= 3` in whole days, inclusive of today. Document this precisely; it is a classic viva question.
- Rules are evaluated in ascending `code` order, so reasons come out in a stable order regardless of DB row order.
- `inputHash = sha256(canonicalJson(input) + canonicalJson(enabledRulesSortedByCode) + canonicalJson(config))`, where `canonicalJson` sorts object keys recursively. Implement SHA-256 with `node:crypto` injected via a tiny adapter so the package stays dependency-free in spirit (or ship a pure-TS sha256 — your choice, but document it).
- Running `evaluateCase` twice with identical arguments must produce a deep-equal result, including `inputHash` and reason ordering.

### 6.3 Condition implementations

Implement each `ConditionType` as a pure predicate returning `{ triggered: boolean; evidence: Record<string, unknown> }`:

| ConditionType | Params | Triggers when |
|---|---|---|
| `HEARING_WITHIN_DAYS` | `{days}` | next hearing exists and is 0..`days` days away |
| `HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE` | `{days}` | above **and** ≥1 `isPreparationTask` not COMPLETED/CANCELLED |
| `HEARING_DATE_MISSING` | `{}` | case is active (not DISPOSED/CLOSED/TRANSFERRED) and `nextHearingDate` is null |
| `TASK_OVERDUE` | `{graceDays}` | ≥1 task PENDING/IN_PROGRESS/BLOCKED with `dueDate + graceDays < today` |
| `TASK_DUE_WITHIN_DAYS` | `{days}` | ≥1 open task due in 0..`days` days |
| `TASK_UNASSIGNED` | `{}` | ≥1 open task with `assignedToId === null` |
| `TASK_BLOCKED_OVER_DAYS` | `{days}` | ≥1 BLOCKED task blocked for > `days` |
| `MANDATORY_DOCUMENT_MISSING` | `{}` | ≥1 document with `isMandatory` and status MISSING/REJECTED |
| `DOCUMENT_UNVERIFIED_OVER_DAYS` | `{days}` | ≥1 mandatory doc RECEIVED but not VERIFIED for > `days` |
| `CASE_FIELD_INCOMPLETE` | `{fields: string[]}` | any listed field is false in `requiredFieldsPresent` |
| `NO_ASSIGNEE` | `{}` | `assignedToId === null` |
| `ORDER_NOT_REVIEWED_AFTER_DAYS` | `{days}` | last hearing happened > `days` ago and `orderReviewed === false` |
| `CUSTODY_DURATION_EXCEEDS_DAYS` | `{days}` | in JUDICIAL/POLICE custody for > `days` → **flag for team review only** |
| `NO_ACTIVITY_SINCE_DAYS` | `{days}` | `lastActivityAt` older than `days` |
| `BAIL_APPLICATION_STALLED_DAYS` | `{days}` | bail APPLICATION_FILED/HEARING_SCHEDULED for > `days` with no outcome |
| `HEARING_ADJOURNED_CONSECUTIVELY` | `{count}` | `consecutiveAdjournments >= count` |

> For `CUSTODY_DURATION_EXCEEDS_DAYS`, the rendered reason must read like: *"Case has been in custody status for over 180 days — flagged for team review of pending follow-up actions."* Never imply a legal entitlement or a release recommendation.

### 6.4 Scoring and banding

```
rawScore   = Σ weight of every triggered, enabled rule
totalScore = maxScoreCap ? min(rawScore, maxScoreCap) : rawScore
HIGH    if totalScore >= config.highThreshold      (default 7)
MEDIUM  if totalScore >= config.mediumThreshold    (default 3)
ROUTINE otherwise
```

`explanation` string must show the arithmetic: `"4 + 4 + 3 = 11 → HIGH (≥ 7)"`.

### 6.5 Queue ordering (deterministic tie-breakers, in order)

1. `totalScore` DESC
2. `nextHearingDate` ASC (nulls last)
3. earliest open overdue task `dueDate` ASC (nulls last)
4. `custodyStartDate` ASC (nulls last)
5. `caseRef` ASC (final, guarantees total order)

### 6.6 Default seeded ruleset (v1)

| Code | Name | Condition | Params | Weight |
|---|---|---|---|---|
| `R-HEARING-3D-PREP` | Hearing within 3 days with incomplete preparation | `HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE` | `{days:3}` | 4 |
| `R-HEARING-3D` | Hearing within 3 days | `HEARING_WITHIN_DAYS` | `{days:3}` | 4 |
| `R-HEARING-7D` | Hearing within 7 days | `HEARING_WITHIN_DAYS` | `{days:7}` | 2 |
| `R-TASK-OVERDUE` | Follow-up task is overdue | `TASK_OVERDUE` | `{graceDays:0}` | 4 |
| `R-TASK-DUE-2D` | Task due within 2 days | `TASK_DUE_WITHIN_DAYS` | `{days:2}` | 2 |
| `R-DOC-MISSING` | Mandatory document missing | `MANDATORY_DOCUMENT_MISSING` | `{}` | 3 |
| `R-CASE-INCOMPLETE` | Case information incomplete | `CASE_FIELD_INCOMPLETE` | `{fields:["custodyStartDate","courtName","caseStatus","charges"]}` | 2 |
| `R-NO-ASSIGNEE` | No user assigned to case | `NO_ASSIGNEE` | `{}` | 2 |
| `R-TASK-UNASSIGNED` | Open task has no owner | `TASK_UNASSIGNED` | `{}` | 2 |
| `R-ORDER-UNREVIEWED` | Latest order not reviewed | `ORDER_NOT_REVIEWED_AFTER_DAYS` | `{days:7}` | 3 |
| `R-NO-HEARING-DATE` | Next hearing date not recorded | `HEARING_DATE_MISSING` | `{}` | 3 |
| `R-STALE-CASE` | No activity recorded recently | `NO_ACTIVITY_SINCE_DAYS` | `{days:30}` | 1 |
| `R-BAIL-STALLED` | Bail application pending without outcome | `BAIL_APPLICATION_STALLED_DAYS` | `{days:21}` | 2 |
| `R-ADJOURN-3X` | Hearing adjourned 3+ consecutive times | `HEARING_ADJOURNED_CONSECUTIVELY` | `{count:3}` | 2 |
| `R-DOC-UNVERIFIED` | Received document not verified | `DOCUMENT_UNVERIFIED_OVER_DAYS` | `{days:10}` | 1 |
| `R-TASK-BLOCKED` | Task blocked for too long | `TASK_BLOCKED_OVER_DAYS` | `{days:7}` | 2 |
| `R-CUSTODY-LONG` | Extended custody duration — review follow-ups | `CUSTODY_DURATION_EXCEEDS_DAYS` | `{days:180}` | 1 |

### 6.7 Re-evaluation triggers

Recompute a case's priority when: the case is created/updated, a hearing is added/updated, a task is created/updated/completed, a document status changes, the case is assigned/unassigned, a rule or threshold changes (then recompute **all** cases and log a `PRIORITY_RECOMPUTE` audit entry), or the nightly scheduled job runs (default `02:00 IST`, because day-boundary crossings change "overdue" and "within N days"). Recomputation is idempotent and writes a new `PriorityEvaluation` row only if `inputHash` or `rulesetVersion` changed — otherwise update `lastEvaluatedAt` only. Document that optimisation.

---

## 7. API SPECIFICATION

Base: `/api/v1`. JSON only. Every response uses an envelope.

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "requestId": "...", "page": 1, "pageSize": 20, "total": 200, "totalPages": 10 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [{ "field": "nextHearingDate", "issue": "must be today or later" }], "requestId": "..." } }
```

Error codes: `VALIDATION_ERROR, UNAUTHENTICATED, TOKEN_EXPIRED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, ACCOUNT_LOCKED, IMMUTABLE_RECORD, INTERNAL_ERROR`.

### Endpoints

**Auth** — `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`

**Users** (ADMIN) — `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/deactivate`, `POST /users/:id/reset-password`, `GET /users/:id/workload`

**Persons** — `GET /persons`, `POST /persons`, `GET /persons/:id`, `PATCH /persons/:id`

**Cases** — `GET /cases` (filter: `q, status, priority, assignedTo, hearingFrom, hearingTo, hasOverdueTasks, missingDocuments, unassigned, custodyType, bailStatus, district, court, sort, page, pageSize`), `POST /cases`, `GET /cases/:id` (full aggregate), `PATCH /cases/:id`, `POST /cases/:id/assign`, `POST /cases/:id/unassign`, `POST /cases/:id/archive`, `GET /cases/:id/timeline` (merged hearings + tasks + documents + notes + evaluations, chronological), `GET /cases/:id/audit`, `POST /cases/:id/notes`, `GET /cases/:id/charges`, `POST /cases/:id/charges`

**Hearings** — `GET /cases/:id/hearings`, `POST /cases/:id/hearings`, `PATCH /hearings/:id`, `POST /hearings/:id/mark-order-reviewed`, `GET /hearings/upcoming?days=7`

**Tasks** — `GET /tasks` (filter: `assignedTo=me, status, category, dueBefore, overdue, caseId`), `POST /cases/:id/tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/complete`, `POST /tasks/:id/reassign`, `GET /tasks/my-queue`

**Documents** — `GET /cases/:id/documents`, `POST /cases/:id/documents`, `PATCH /documents/:id`, `POST /documents/:id/verify`, `POST /cases/:id/documents/apply-checklist` (seeds the mandatory checklist for a case type)

**Rules** (ADMIN write, all roles read) — `GET /rules`, `POST /rules`, `PATCH /rules/:id`, `POST /rules/:id/toggle`, `GET /rules/:id/versions`, `GET /rules/config`, `PUT /rules/config` (creates new ruleset version), `POST /rules/simulate` ⭐ (accepts a candidate ruleset, returns how the queue *would* change — top N before/after, band distribution delta — **without persisting**), `POST /rules/recompute-all`

**Priority** — `GET /priority/queue` (the explainable queue; scoped to assignment unless ADMIN), `GET /priority/case/:caseId` (current result + full reasons), `GET /priority/case/:caseId/history`, `POST /priority/case/:caseId/recompute`, `GET /priority/distribution`

**Audit** (ADMIN/AUDITOR) — `GET /audit` (filter: `actor, action, entityType, entityId, from, to, success`), `GET /audit/:id`, `GET /audit/verify-chain`, `GET /audit/export.csv`

**Reports** — `GET /reports/pending-by-user`, `GET /reports/upcoming-hearings?days=`, `GET /reports/overdue-actions`, `GET /reports/priority-distribution`, `GET /reports/completed?from=&to=`, `GET /reports/case-aging`, `GET /reports/rule-trigger-frequency`, `GET /reports/:name/export.csv`

**Search** — `GET /search?q=` (cross-entity: cases, persons, tasks — respects authorization)

**Notifications** — `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`

**Meta** — `GET /health`, `GET /health/ready`, `GET /version`, `GET /api/docs`

---

## 8. AUTHENTICATION, AUTHORIZATION AND SECURITY

1. **Hashing:** Argon2id (`memoryCost 19456, timeCost 2, parallelism 1`). Never bcrypt-with-default-rounds, never SHA alone.
2. **Tokens:** access JWT 15 min (in memory on the client, `Authorization: Bearer`); refresh token 7 days, opaque random 256-bit, **stored hashed**, httpOnly + SameSite=Strict + Secure cookie, **rotated on every use** with **reuse detection** (reusing a rotated token revokes the entire token family and writes an audit entry).
3. **RBAC matrix** — implement as data, not scattered `if`s:

| Capability | ADMIN | LEGAL_PROFESSIONAL | AUDITOR |
|---|---|---|---|
| View any case | ✅ | ❌ (assigned only) | ✅ read-only |
| Create/edit case | ✅ | ✅ (assigned only) | ❌ |
| Assign case | ✅ | ❌ | ❌ |
| Record hearing / task / document | ✅ | ✅ (assigned only) | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Configure rules & thresholds | ✅ | ❌ | ❌ |
| View full priority queue | ✅ | ❌ (own queue) | ✅ |
| View audit log | ✅ | ❌ (own case entries only) | ✅ |
| Export reports | ✅ | ✅ (own scope) | ✅ |

4. **Two-layer authorization.** Route-level `requireRole(...)` **plus** resource-level ownership checks inside the service (`assertCanAccessCase(user, caseId)`). The documentation is explicit: *hiding a button in React is insufficient*. Write tests proving a LEGAL_PROFESSIONAL gets `403` on another user's case via direct API call, and that the case does not appear in their list, search, queue, reports, or exports (**IDOR tests**).
5. **Validation:** Zod on every body, query, and param. Reject unknown keys (`.strict()`). Business validations: hearing `scheduledDate` not before `custodyStartDate`; task `dueDate` not in the past on creation; cannot complete a CANCELLED task; cannot assign a case to an inactive user; `caseRef` immutable after creation.
6. **Rate limiting:** global 100 req/min/IP; `/auth/login` 5 attempts per 15 min per IP+email; account lockout after 5 consecutive failures for 15 min (`ACCOUNT_LOCKED`).
7. **Headers/transport:** helmet, strict CORS allowlist from env, `X-Request-Id` on every request/response, body size limit 1 MB, compression, graceful shutdown.
8. **Logging:** Pino with redaction of `password, passwordHash, token, refreshToken, authorization, cookie`. Never log request bodies containing credentials.
9. **Audit middleware:** wraps every mutating route; computes `changedFields` by diffing before/after; writes the hash-chained entry in the **same transaction** as the mutation so an audit entry can never be lost. Also log `LOGIN_FAILED` and `ACCESS_DENIED`.
10. **Secrets:** all from env, validated by Zod at boot; the app refuses to start with missing/weak `JWT_SECRET` (< 32 chars) in production mode.

---

## 9. FRONTEND SPECIFICATION

### Design direction

Professional, calm, information-dense — think a government/enterprise case console, not a consumer SaaS landing page. Deep navy / slate neutrals, restrained accent colour, generous whitespace inside dense tables, system-serif for headings optional. Priority colours: **HIGH** = amber/red-600 (never pure alarm red everywhere), **MEDIUM** = amber-500, **ROUTINE** = slate/green-600. Colour is **never** the only signal — always pair with a text label and an icon (accessibility).

Requirements: responsive (≥1280 primary, works to 768), keyboard navigable, visible focus rings, ARIA labels on all interactive controls, WCAG AA contrast, proper loading skeletons, empty states with a suggested next action, error states with retry, optimistic updates with rollback, toasts for every mutation, confirmation dialogs for destructive/irreversible actions, light + dark mode.

### Screens

1. **Login** — email/password, inline errors, lockout messaging, demo-credentials helper box (visible only when `VITE_DEMO_MODE=true`).
2. **Dashboard** — role-aware. Stat cards (assigned cases, HIGH priority, tasks due today, overdue tasks, hearings in 7 days, unreviewed orders). Priority distribution donut. Upcoming-hearings 14-day timeline. Recent activity feed. "My top 5 attention items" with reasons inline.
3. **Priority Queue** ⭐ the flagship screen. Ranked list; each row: rank, case ref, person alias, priority badge + score, next hearing (with "in 2 days" relative), count of triggered reasons, assignee avatar. Expanding a row reveals the **full explanation panel**: every triggered rule as `[+4] Hearing is within 3 days (12 Oct 2026) and preparation is incomplete`, the arithmetic line `4 + 4 + 3 = 11 → HIGH (≥ 7)`, the ruleset version, engine version, and `evaluated at`. Filters: priority band, assignee, hearing window, reason/rule code. "Recompute" button (ADMIN). CSV export.
4. **Cases list** — TanStack Table: sortable columns, server-side pagination, faceted filters, saved filters, column visibility, bulk assign (ADMIN), CSV export.
5. **Case detail** — header (case ref, status, priority badge with "Why?" popover, assignee, quick actions) and tabs:
   - *Overview* — case fields, charges, person summary, custody info, data-completeness meter showing exactly which mandatory fields are missing.
   - *Hearings* — chronological list, add/edit hearing, record outcome & order summary, "Mark order as reviewed" button, adjournment chain visualisation.
   - *Tasks* — kanban (Pending / In Progress / Blocked / Completed) with drag-and-drop, plus list view; create, assign, due date, complete with note.
   - *Documents* — mandatory checklist with status chips, request/receive/verify transitions, missing-document warning banner.
   - *Priority* — current result, full reason breakdown, **evaluation history chart** (score over time) so a reviewer can see when and why the priority changed.
   - *Notes* — append-only notes.
   - *Audit* — the change history for this case in plain language ("23 August, 10:30 — Mithil changed Task 17 from Pending to Completed").
6. **My Tasks** — personal work queue grouped by Overdue / Today / This week / Later, with one-click complete.
7. **Rules admin** (ADMIN) — table of rules with enable/disable toggles, inline weight editing, condition parameters editor, threshold configuration, **rule simulator** (⭐ change weights → live preview of how the top 20 queue and band distribution would change, before/after, without saving), version history per rule with who changed what and when, and a prominent notice: *"These are demonstration rules approved for testing — not official legal standards."*
8. **Users admin** (ADMIN) — CRUD, role assignment, activate/deactivate, per-user workload view.
9. **Audit log viewer** (ADMIN/AUDITOR) — filters, expandable before/after diff view (green/red field diff), chain-verification indicator, CSV export.
10. **Reports** — the report set from §7 with Recharts visualisations and CSV export on each; date-range picker.
11. **Global search** (`Cmd/Ctrl+K`) — cross-entity, authorization-scoped.
12. **About / Limitations page** — states scope, guardrails, related systems (CCTNS/eCourts/e-Prisons/NJDG/ICJS) and what JusticeGrid explicitly is *not*. Link it in the footer.

---

## 10. SEED DATA (synthetic, deterministic, demo-ready)

`faker.seed(20251020)` — reproducible across runs. All dates computed **relative to the seed run date** so the demo always has live "hearing in 2 days" cases.

**Users (12):**
- `admin@justicegrid.test` / `Admin@12345` — ADMIN — "Coordinator (Demo)"
- `auditor@justicegrid.test` / `Auditor@12345` — AUDITOR
- 10 × `lawyer1..10@justicegrid.test` / `Lawyer@12345` — LEGAL_PROFESSIONAL

**Persons:** 220 pseudonymous records (`UT-0001`…), obviously fictional names, age bands, no real identifiers.

**Cases:** 200 assigned across the 10 legal professionals (uneven: 8–35 each) + **12 deliberately unassigned** to trigger `R-NO-ASSIGNEE`. Realistic spread of statuses, courts, districts, custody types, bail statuses. Hearings: 1–9 per case, including adjournment chains. Tasks: 0–7 per case, with a realistic mix of overdue / due-soon / completed / blocked / unassigned. Documents: full mandatory checklist per case with a mix of statuses. Notes and assignment history included.

**Target distribution after evaluation:** roughly 15–20 % HIGH, 30–35 % MEDIUM, ~50 % ROUTINE. Tune the generator until the seeded distribution lands in that range, and assert it in a seed test.

**Mandatory fixture cases (hard-coded, exact — these are the viva demo):**

| Ref | Setup | Expected |
|---|---|---|
| `JG-2026-0001` "Case A" | hearing in 2 days, incomplete preparation task, overdue follow-up task, mandatory FIR copy missing | Score **11** → **HIGH**, 3 reasons, `4 + 4 + 3 = 11 → HIGH (≥ 7)` |
| `JG-2026-0002` "Case B" | hearing 25 days away, all documents verified, no pending tasks | Score **0** → **ROUTINE**, reason: *"No time-sensitive workflow condition triggered"* |
| `JG-2026-0003` | unassigned, no next hearing date, incomplete case fields | triggers `R-NO-ASSIGNEE`, `R-NO-HEARING-DATE`, `R-CASE-INCOMPLETE` → **MEDIUM/HIGH** |
| `JG-2026-0004` | hearing held 14 days ago, order not reviewed | triggers `R-ORDER-UNREVIEWED` |
| `JG-2026-0005` | 3 consecutive adjournments, bail filed 40 days ago, no outcome | triggers `R-ADJOURN-3X`, `R-BAIL-STALLED` |
| `JG-2026-0006` | every single rule triggered | maximum score — used for the cap test |

Snapshot-test these six in the rules-engine golden tests **and** in an API integration test.

Scripts: `pnpm db:reset` (drop → migrate → seed), `pnpm db:seed`, `pnpm db:studio`.

---

## 11. TESTING — MAP EVERY CLAIM TO A TEST

The project document defines a Requirement → Evidence table. **Implement each row as a named, passing test** and reference the test file in `docs/08-traceability-matrix.md`.

| # | Requirement | Evidence type | Test file |
|---|---|---|---|
| T1 | Unauthorized users cannot access cases | Security | `apps/api/src/modules/cases/cases.security.test.ts` |
| T2 | A case can be created | Functional | `cases.create.test.ts` |
| T3 | Invalid hearing date is rejected | Validation | `hearings.validation.test.ts` |
| T4 | Overdue task triggers a flag | Rule-engine unit | `packages/rules-engine/__tests__/taskOverdue.test.ts` |
| T5 | Same input produces same priority | Determinism | `__tests__/determinism.test.ts` |
| T6 | Priority reasons are visible in the UI | E2E | `e2e/priority-explainability.spec.ts` |
| T7 | Only assigned/permitted cases are visible | Authorization/IDOR | `cases.authorization.test.ts` |
| T8 | Changes create audit entries | Integration | `audit.integration.test.ts` |
| T9 | Search returns correct cases | API/DB | `search.test.ts` |

**Additional required coverage:**
- One unit test **per `ConditionType`** — triggered case, not-triggered case, and boundary case (exactly 3 days, exactly 0 days, due today vs overdue yesterday, null inputs).
- Scoring band boundaries: 2/3 (ROUTINE→MEDIUM), 6/7 (MEDIUM→HIGH), cap behaviour.
- Queue ordering: identical scores resolved by each tie-breaker in turn; total-order property test (shuffle input 100× → identical output).
- Golden snapshot tests: fixture inputs → committed JSON outputs in `__tests__/golden/`.
- "No banned globals in the engine" source-scan test.
- Auth: token expiry, refresh rotation, refresh-reuse revokes family, lockout after 5 failures, password never returned in any response.
- Audit: hash chain verifies; tampering a row breaks verification; audit write happens in the same transaction (mutation failure ⇒ no orphan audit row).
- Rule change → all cases recomputed → new `PriorityEvaluation` rows + audit entry.
- Pagination, filtering, sorting correctness.
- E2E happy path: login → open queue → open top case → complete blocking task → priority recalculates and drops → verify audit entry appears.
- E2E RBAC: legal professional cannot see the Rules/Users/Audit navigation, and direct URL navigation is blocked.

**Coverage gates:** `packages/rules-engine` ≥ **95 %** statements/branches (this is the contribution; treat it as critical code). `apps/api` services ≥ 80 %. CI fails below these.

---

## 12. DOCUMENTATION DELIVERABLES (write all of them)

- `README.md` — what it is, guardrails, screenshots placeholder, prerequisites, 3-command setup, demo credentials, scripts table, troubleshooting.
- `00-problem-statement.md` — the exact defensible problem statement, what is *proven* vs what is a *hypothesis*, why this problem was chosen (honest version — no invented field observations).
- `01-srs.md` — scope, actors, functional requirements FR-01…FR-nn, non-functional NFR-01…, assumptions, constraints, out-of-scope.
- `02-architecture.md` — layered architecture, request lifecycle, why the rule engine is an isolated pure package, concurrency notes, deployment view.
- `03-data-model.md` — ER description, every entity, every field with purpose, normalisation rationale (up to 3NF, note deliberate denormalisation of `currentPriorityScore` on Case and why), indexing strategy.
- `04-api-reference.md` — every endpoint, auth requirement, request/response examples, error codes.
- `05-rule-engine.md` — the full algorithm, condition semantics, day-boundary maths, determinism guarantees, hashing, worked example of Case A arriving at 11 → HIGH, configurability rationale, and a "why not ML" section.
- `06-security.md` — threat model (STRIDE-lite), auth design, RBAC matrix, IDOR prevention, audit integrity, known limitations.
- `07-test-plan.md` — strategy, pyramid, test list, how to run.
- `08-traceability-matrix.md` — Requirement ID → design element → code module → test file → status. This is the highest-value viva document; make it complete.
- `09-demo-script.md` — a timed 7-minute walkthrough (see §14).
- `10-viva-qa.md` — 40+ anticipated questions with crisp answers: *Why rules not ML? How do you guarantee determinism? What if two cases tie? Why is the engine a separate package? How is audit tamper-evidence achieved? How is this different from eCourts/CCTNS/ICJS? Why configurable weights? What happens at midnight? How do you prevent IDOR? What are the limitations? What would production need?*
- `11-limitations-and-ethics.md` — synthetic data, unvalidated rules, no stakeholder validation yet, no integration, explicit list of claims **not** made, and what real deployment would require (DPDP Act considerations, stakeholder consultation, institutional approval, security audit, accessibility audit, data-retention policy).
- `docs/diagrams/*.mmd` — Mermaid sources **and** rendered PNGs (via `@mermaid-js/mermaid-cli`) for: ER diagram, use-case diagram, class diagram, sequence diagram (login → queue → evaluate → display), activity diagram (the 7-step workflow), DFD level 0 and level 1, component diagram, deployment diagram.

---

## 13. DEVOPS AND TOOLING

- `docker-compose.yml`: `postgres:16-alpine` (named volume, healthcheck), `api`, `web`, optional `adminer`. `docker compose up` must bring up a fully seeded, working system.
- `.env.example` with every variable documented: `DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, PORT, NODE_ENV, CORS_ORIGINS, LOG_LEVEL, RATE_LIMIT_*, TZ=Asia/Kolkata, SEED_DATE, DEMO_MODE, VITE_API_URL, VITE_DEMO_MODE`.
- `Makefile` / root scripts: `setup, dev, build, test, test:e2e, lint, typecheck, db:reset, db:seed, db:studio, diagrams, docs, ci`.
- GitHub Actions `ci.yml`: install → typecheck → lint → unit tests → Postgres service → migrate → integration tests → build → Playwright E2E → upload coverage. Must be green.
- Husky pre-commit: lint-staged + typecheck. Pre-push: unit tests.
- Conventional commits.

---

## 14. DEMO SCRIPT (must work end to end, 7 minutes)

1. `docker compose up` → open `http://localhost:5173`. Point out the prototype/synthetic-data banner.
2. Log in as **admin** → dashboard: 200 cases, priority distribution, upcoming hearings.
3. Open **Priority Queue** → `JG-2026-0001` is ranked #1. Expand it → show the three reasons, the arithmetic `4 + 4 + 3 = 11 → HIGH (≥ 7)`, ruleset version, and evaluated-at. Say the line: *"The system explains itself; a human decides."*
4. Open the case → Tasks tab → complete the overdue task → toast → return to queue → **score drops to 7, reasons reduce to two**, rank changes. Priority tab shows the score history dropping.
5. Documents tab → mark the missing FIR copy as Received + Verified → score drops to 4 → band becomes **MEDIUM**. Live explainability.
6. **Rules admin** → open the simulator → set `R-DOC-MISSING` weight from 3 to 6 → preview shows the before/after queue and distribution shift → save → all cases recomputed → rule version history records who changed what and why.
7. **Audit log** → show the diff of the task completion and the rule change, then `verify-chain` → ✅ intact.
8. Log out → log in as **lawyer3** → show only their assigned cases, no Rules/Users/Audit navigation. Open DevTools and `curl` another lawyer's case ID → **403 FORBIDDEN**. *"Authorization is enforced on the server, not by hiding buttons."*
9. Close on the **Limitations** page: synthetic data, demonstration rules, no integration, human-in-the-loop, hypothesis requiring stakeholder validation.

---

## 15. WORKING AGREEMENT FOR YOU (Claude Code)

Build in the following phases. **After each phase: run typecheck, lint, and tests; make an atomic commit; print a short status summary; then continue to the next phase without waiting for me** unless something in this spec is genuinely ambiguous — in which case ask one focused question, state your assumption, and proceed.

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Monorepo scaffold, tooling, Docker, env, CI skeleton, empty packages wired together | `pnpm dev` starts an empty API + web; `pnpm typecheck` passes |
| **1** | Prisma schema + migrations + all enums; `packages/shared` Zod schemas and types | `pnpm db:reset` succeeds; Prisma Studio shows all tables |
| **2** | ⭐ `packages/rules-engine` complete, with every condition, scoring, ordering, hashing, explanations + **full test suite ≥95 %** | All engine tests green, golden snapshots committed |
| **3** | API foundation: app, config, logger, error envelope, request IDs, auth (login/refresh/rotation/lockout), RBAC middleware, audit middleware with hash chain | Auth + audit tests green |
| **4** | Domain APIs: persons, cases, charges, hearings, tasks, documents, notes, assignment | Functional + validation + authorization tests green |
| **5** | Rules & priority APIs: CRUD, versioning, config, simulate, recompute, queue, history, scheduled job | Rule-change → recompute integration test green |
| **6** | Reports, search, notifications, CSV export, OpenAPI docs at `/api/docs` | All report endpoints return correct data against seed |
| **7** | Seed data: fixtures + generators, distribution assertions | Seeded fixtures produce exactly the expected scores in §10 |
| **8** | Frontend: shell, auth flow, layout, design system, dashboard | Login → dashboard works against the real API |
| **9** | Frontend: priority queue with full explainability, cases list, case detail (all 7 tabs), my tasks | Demo steps 3–5 work manually |
| **10** | Frontend: rules admin + simulator, users admin, audit viewer, reports, global search, limitations page | Demo steps 6–9 work manually |
| **11** | Playwright E2E suite, accessibility pass, empty/loading/error states, dark mode | All E2E specs green |
| **12** | All documentation, Mermaid diagrams + rendered PNGs, traceability matrix, viva Q&A, demo script | `docs/` complete; CI fully green |

**Rules of engagement:**

- **Do not stub anything.** If a screen is listed, build it and wire it to the real API. No `TODO`, no `coming soon`, no fake data in components.
- **Do not simplify the rule engine.** It is the graded contribution.
- **Never weaken the guardrails in §1** — not in code, not in copy, not in docs, not in commit messages.
- Read a file before editing it. Prefer small, verifiable increments.
- If a library version conflicts, pin a working version and note it in the README rather than swapping the stack.
- Run the actual commands. Never claim a test passes without running it.
- If you hit a hard blocker, document it in `docs/BLOCKERS.md` with the workaround you applied — do not silently drop a requirement.
- Keep the final `README.md` accurate to what was actually built.

### Definition of done (the whole project)

- [ ] `docker compose up` yields a working, seeded system
- [ ] `pnpm test` and `pnpm test:e2e` fully green; coverage gates met
- [ ] All 9 traceability requirements (T1–T9) mapped to passing named tests
- [ ] The six fixture cases produce exactly the specified scores and reasons
- [ ] Every priority shown anywhere in the UI is accompanied by its reasons
- [ ] RBAC enforced server-side; IDOR tests pass
- [ ] Audit chain verifies; rules versioned; thresholds versioned
- [ ] All 12 documents and 9 diagrams written and rendered
- [ ] Demo script in §14 executes start to finish without a single error

Begin with Phase 0.

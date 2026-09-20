-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEGAL_PROFESSIONAL', 'AUDITOR');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('REGISTERED', 'UNDER_INVESTIGATION', 'CHARGES_FRAMED', 'TRIAL_ONGOING', 'BAIL_PENDING', 'BAIL_GRANTED', 'DISPOSED', 'TRANSFERRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustodyType" AS ENUM ('JUDICIAL', 'POLICE', 'INTERIM_BAIL', 'RELEASED', 'NOT_IN_CUSTODY');

-- CreateEnum
CREATE TYPE "BailStatus" AS ENUM ('NOT_APPLIED', 'APPLICATION_PREPARED', 'APPLICATION_FILED', 'HEARING_SCHEDULED', 'GRANTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "HearingType" AS ENUM ('FIRST_PRODUCTION', 'REMAND_EXTENSION', 'CHARGE_FRAMING', 'BAIL_HEARING', 'EVIDENCE', 'ARGUMENTS', 'JUDGMENT', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "HearingOutcome" AS ENUM ('HELD', 'ADJOURNED', 'NOT_PRODUCED', 'PARTIALLY_HEARD', 'ORDER_PASSED', 'CANCELLED', 'PENDING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('DOCUMENT_PREPARATION', 'CLIENT_CONTACT', 'COURT_FILING', 'ORDER_REVIEW', 'BAIL_APPLICATION', 'EVIDENCE_COLLECTION', 'COORDINATION', 'FOLLOW_UP', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('MISSING', 'REQUESTED', 'RECEIVED', 'VERIFIED', 'REJECTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FIR_COPY', 'CHARGE_SHEET', 'REMAND_ORDER', 'BAIL_APPLICATION', 'BAIL_ORDER', 'SURETY_DOCUMENTS', 'IDENTITY_PROOF', 'MEDICAL_REPORT', 'VAKALATNAMA', 'PREVIOUS_ORDERS', 'WITNESS_LIST', 'CUSTODY_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('ROUTINE', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RuleCategory" AS ENUM ('HEARING', 'TASK', 'DOCUMENT', 'DATA_QUALITY', 'ASSIGNMENT', 'CUSTODY', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('HEARING_WITHIN_DAYS', 'HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE', 'HEARING_DATE_MISSING', 'TASK_OVERDUE', 'TASK_DUE_WITHIN_DAYS', 'TASK_UNASSIGNED', 'TASK_BLOCKED_OVER_DAYS', 'MANDATORY_DOCUMENT_MISSING', 'DOCUMENT_UNVERIFIED_OVER_DAYS', 'CASE_FIELD_INCOMPLETE', 'NO_ASSIGNEE', 'ORDER_NOT_REVIEWED_AFTER_DAYS', 'CUSTODY_DURATION_EXCEEDS_DAYS', 'NO_ACTIVITY_SINCE_DAYS', 'BAIL_APPLICATION_STALLED_DAYS', 'HEARING_ADJOURNED_CONSECUTIVELY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'ASSIGN', 'UNASSIGN', 'STATUS_CHANGE', 'RULE_TOGGLE', 'RULE_WEIGHT_CHANGE', 'THRESHOLD_CHANGE', 'PRIORITY_RECOMPUTE', 'EXPORT', 'ACCESS_DENIED', 'PASSWORD_CHANGE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'HEARING_APPROACHING', 'CASE_ASSIGNED', 'PRIORITY_ESCALATED', 'DOCUMENT_REQUESTED');

-- CreateEnum
CREATE TYPE "EvaluationTrigger" AS ENUM ('SYSTEM', 'USER', 'SCHEDULED', 'RULE_CHANGE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "aliasCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "ageBand" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "languagePreference" TEXT,
    "hasDisability" BOOLEAN NOT NULL DEFAULT false,
    "isFirstTimeOffender" BOOLEAN NOT NULL DEFAULT false,
    "economicallyWeakerSection" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContactAlias" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "caseRef" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "courtName" TEXT NOT NULL,
    "courtType" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "policeStationAlias" TEXT NOT NULL,
    "firNumberSynthetic" TEXT NOT NULL,
    "firYear" INTEGER NOT NULL,
    "caseStatus" "CaseStatus" NOT NULL DEFAULT 'REGISTERED',
    "custodyType" "CustodyType" NOT NULL,
    "custodyStartDate" TIMESTAMP(3),
    "bailStatus" "BailStatus" NOT NULL DEFAULT 'NOT_APPLIED',
    "bailAppliedDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "createdById" TEXT NOT NULL,
    "lastHearingDate" TIMESTAMP(3),
    "nextHearingDate" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPriorityLevel" "PriorityLevel",
    "currentPriorityScore" INTEGER,
    "lastEvaluatedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actName" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "description" TEXT,
    "isBailableFlag" BOOLEAN NOT NULL,
    "severityBand" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "hearingType" "HearingType" NOT NULL,
    "purpose" TEXT,
    "outcome" "HearingOutcome" NOT NULL DEFAULT 'PENDING',
    "wasProduced" BOOLEAN NOT NULL DEFAULT false,
    "adjournmentReason" TEXT,
    "orderSummary" TEXT,
    "orderReviewed" BOOLEAN NOT NULL DEFAULT false,
    "orderReviewedAt" TIMESTAMP(3),
    "orderReviewedById" TEXT,
    "nextHearingDate" TIMESTAMP(3),
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "blockedReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionNote" TEXT,
    "cancelledReason" TEXT,
    "isPreparationTask" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocumentStatus" NOT NULL DEFAULT 'MISSING',
    "requestedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "sourceNote" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAssignmentHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "RuleCategory" NOT NULL,
    "conditionType" "ConditionType" NOT NULL,
    "params" JSONB NOT NULL,
    "weight" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "displayTemplate" TEXT NOT NULL,
    "severityHint" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "changedById" TEXT NOT NULL,
    "changeReason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesetConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "highThreshold" INTEGER NOT NULL DEFAULT 7,
    "mediumThreshold" INTEGER NOT NULL DEFAULT 3,
    "maxScoreCap" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedById" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RulesetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityEvaluation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalScore" INTEGER NOT NULL,
    "rawScore" INTEGER NOT NULL,
    "priorityLevel" "PriorityLevel" NOT NULL,
    "rulesetVersion" INTEGER NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "triggeredCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "triggeredBy" "EvaluationTrigger" NOT NULL,
    "triggeredById" TEXT,

    CONSTRAINT "PriorityEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggeredReason" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleCode" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "category" "RuleCategory" NOT NULL,
    "reasonText" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "TriggeredReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorRole" "Role",
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "changedFields" TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queryJson" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_aliasCode_key" ON "Person"("aliasCode");

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseRef_key" ON "Case"("caseRef");

-- CreateIndex
CREATE INDEX "Case_nextHearingDate_idx" ON "Case"("nextHearingDate");

-- CreateIndex
CREATE INDEX "Case_assignedToId_idx" ON "Case"("assignedToId");

-- CreateIndex
CREATE INDEX "Case_caseStatus_idx" ON "Case"("caseStatus");

-- CreateIndex
CREATE INDEX "Case_currentPriorityScore_idx" ON "Case"("currentPriorityScore");

-- CreateIndex
CREATE INDEX "Case_assignedToId_currentPriorityScore_idx" ON "Case"("assignedToId", "currentPriorityScore");

-- CreateIndex
CREATE INDEX "Case_lastActivityAt_idx" ON "Case"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Charge_caseId_idx" ON "Charge"("caseId");

-- CreateIndex
CREATE INDEX "Hearing_caseId_scheduledDate_idx" ON "Hearing"("caseId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Task_caseId_status_idx" ON "Task"("caseId", "status");

-- CreateIndex
CREATE INDEX "Task_assignedToId_status_dueDate_idx" ON "Task"("assignedToId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "DocumentRequirement_caseId_status_idx" ON "DocumentRequirement"("caseId", "status");

-- CreateIndex
CREATE INDEX "DocumentRequirement_caseId_documentType_idx" ON "DocumentRequirement"("caseId", "documentType");

-- CreateIndex
CREATE INDEX "CaseNote_caseId_createdAt_idx" ON "CaseNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseAssignmentHistory_caseId_changedAt_idx" ON "CaseAssignmentHistory"("caseId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_code_key" ON "Rule"("code");

-- CreateIndex
CREATE INDEX "Rule_category_idx" ON "Rule"("category");

-- CreateIndex
CREATE INDEX "Rule_isEnabled_idx" ON "Rule"("isEnabled");

-- CreateIndex
CREATE INDEX "RuleVersion_ruleId_version_idx" ON "RuleVersion"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RulesetConfig_version_key" ON "RulesetConfig"("version");

-- CreateIndex
CREATE INDEX "RulesetConfig_isActive_idx" ON "RulesetConfig"("isActive");

-- CreateIndex
CREATE INDEX "PriorityEvaluation_caseId_evaluatedAt_idx" ON "PriorityEvaluation"("caseId", "evaluatedAt" DESC);

-- CreateIndex
CREATE INDEX "TriggeredReason_evaluationId_orderIndex_idx" ON "TriggeredReason"("evaluationId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "SavedFilter_userId_idx" ON "SavedFilter"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_orderReviewedById_fkey" FOREIGN KEY ("orderReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignmentHistory" ADD CONSTRAINT "CaseAssignmentHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignmentHistory" ADD CONSTRAINT "CaseAssignmentHistory_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignmentHistory" ADD CONSTRAINT "CaseAssignmentHistory_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignmentHistory" ADD CONSTRAINT "CaseAssignmentHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulesetConfig" ADD CONSTRAINT "RulesetConfig_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityEvaluation" ADD CONSTRAINT "PriorityEvaluation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityEvaluation" ADD CONSTRAINT "PriorityEvaluation_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggeredReason" ADD CONSTRAINT "TriggeredReason_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PriorityEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggeredReason" ADD CONSTRAINT "TriggeredReason_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

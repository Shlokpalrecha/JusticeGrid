-- Retire additive scoring without rewriting historical evaluations or deleting case data.
ALTER TYPE "PriorityLevel" RENAME TO "LegacyPriorityLevel";
CREATE TYPE "PriorityLevel" AS ENUM ('U0', 'U1', 'U2', 'U3');
ALTER TABLE "Case" ALTER COLUMN "currentPriorityLevel" TYPE "PriorityLevel" USING NULL::"PriorityLevel";
UPDATE "Case" SET "currentPriorityScore" = NULL, "lastEvaluatedAt" = NULL;
UPDATE "Rule" SET "isEnabled" = false;
UPDATE "RulesetConfig" SET "isActive" = false;
ALTER TABLE "Case" ADD COLUMN "workflowFacts" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "workflowRevision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "queueNextEvaluationAt" TIMESTAMP(3), ADD COLUMN "queueError" TEXT, ADD COLUMN "queueDeadline" TIMESTAMP(3);
ALTER TABLE "Hearing" ADD COLUMN "orderExpected" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "orderReceivedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "hearingId" TEXT, ADD COLUMN "actionKey" TEXT;
ALTER TABLE "DocumentRequirement" ADD COLUMN "hearingId" TEXT, ADD COLUMN "actionKey" TEXT;
CREATE TABLE "QueuePolicy" (
 "id" TEXT NOT NULL PRIMARY KEY, "version" INTEGER NOT NULL UNIQUE, "config" JSONB NOT NULL,
 "isActive" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT NOT NULL, "changeReason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "QueuePolicy_single_active" ON "QueuePolicy" ("isActive") WHERE "isActive" = true;
CREATE TABLE "LegalProfile" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "sourceId" TEXT NOT NULL, "locator" TEXT NOT NULL, "territory" TEXT NOT NULL, "procedure" TEXT NOT NULL,
 "effectiveFrom" TIMESTAMP(3) NOT NULL, "verifiedAt" TIMESTAMP(3) NOT NULL, "verifiedById" TEXT NOT NULL,
 "verificationNotes" TEXT NOT NULL, "supersedesId" TEXT, "mode" TEXT NOT NULL DEFAULT 'CONFIRMED_DATES_ONLY',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LegalProfile_name_version_key" ON "LegalProfile" ("name", "version");
CREATE TABLE "WorkflowAction" (
 "id" TEXT NOT NULL PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "key" TEXT NOT NULL, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "generated" BOOLEAN NOT NULL DEFAULT false,
 "payload" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "WorkflowAction_caseId_key_key" ON "WorkflowAction" ("caseId", "key");
CREATE INDEX "WorkflowAction_caseId_status_idx" ON "WorkflowAction" ("caseId", "status");
CREATE TABLE "QueueEvaluation" (
 "id" TEXT NOT NULL PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "policyVersion" INTEGER NOT NULL, "inputSnapshot" JSONB NOT NULL, "policySnapshot" JSONB NOT NULL,
 "result" JSONB NOT NULL, "outcomeHash" TEXT NOT NULL, "evaluatedAt" TIMESTAMP(3) NOT NULL,
 "triggeredBy" TEXT NOT NULL, "triggeredById" TEXT
);
CREATE INDEX "QueueEvaluation_caseId_evaluatedAt_idx" ON "QueueEvaluation" ("caseId", "evaluatedAt" DESC);
CREATE TABLE "ActionNotification" (
 "id" TEXT NOT NULL PRIMARY KEY, "episodeKey" TEXT NOT NULL, "userId" TEXT NOT NULL, "stage" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ActionNotification_episodeKey_userId_stage_key" ON "ActionNotification" ("episodeKey", "userId", "stage");
INSERT INTO "QueuePolicy" ("id", "version", "config", "isActive", "createdById", "changeReason") VALUES
 ('queue-policy-v2-initial', 1,
 '{"immediateHours":24,"sensitiveHours":72,"routineDays":7,"hearingNearDays":3,"hearingWeekDays":7,"agingStepDays":7,"weights":{"hearingNear":5,"hearingWeek":3,"attendance":1,"access":4,"communication":2,"blocker":4,"ordinaryBlocker":2,"criticalData":4,"ordinaryData":1,"aging":3}}',
 true, 'migration', 'Replace additive scoring with action-based workflow policy; prototype weights, confirmed legal dates only');

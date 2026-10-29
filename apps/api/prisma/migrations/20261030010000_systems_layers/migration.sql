-- CreateTable
CREATE TABLE "SystemRecord" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "eventDate" TEXT,
    "caseId" TEXT,
    "createdById" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityDecision" (
    "id" TEXT NOT NULL,
    "leftId" TEXT NOT NULL,
    "rightId" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemGeneration" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SystemGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowGraph" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkflowGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowNode" (
    "graphId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completionEvidence" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowNode_pkey" PRIMARY KEY ("graphId","key")
);

-- CreateTable
CREATE TABLE "WorkflowEdge" (
    "graphId" TEXT NOT NULL,
    "fromKey" TEXT NOT NULL,
    "toKey" TEXT NOT NULL,

    CONSTRAINT "WorkflowEdge_pkey" PRIMARY KEY ("graphId","fromKey","toKey")
);

-- CreateTable
CREATE TABLE "CaseRuleEvidence" (
    "caseId" TEXT NOT NULL,
    "offenseSeverityIndex" DOUBLE PRECISION,
    "bailEligibility" BOOLEAN,
    "basis" TEXT NOT NULL,
    "verifiedById" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CaseRuleEvidence_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "Activity_Log" (
    "sequence" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "requestId" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "Activity_Log_pkey" PRIMARY KEY ("sequence")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityDecision_leftId_rightId_key" ON "IdentityDecision"("leftId", "rightId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowGraph_caseId_key" ON "WorkflowGraph"("caseId");

-- AddForeignKey
ALTER TABLE "SystemRecord" ADD CONSTRAINT "SystemRecord_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRecord" ADD CONSTRAINT "SystemRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityDecision" ADD CONSTRAINT "IdentityDecision_leftId_fkey" FOREIGN KEY ("leftId") REFERENCES "SystemRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityDecision" ADD CONSTRAINT "IdentityDecision_rightId_fkey" FOREIGN KEY ("rightId") REFERENCES "SystemRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowGraph" ADD CONSTRAINT "WorkflowGraph_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNode" ADD CONSTRAINT "WorkflowNode_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "WorkflowGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEdge" ADD CONSTRAINT "WorkflowEdge_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "WorkflowGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEdge" ADD CONSTRAINT "WorkflowEdge_graphId_fromKey_fkey" FOREIGN KEY ("graphId", "fromKey") REFERENCES "WorkflowNode"("graphId", "key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEdge" ADD CONSTRAINT "WorkflowEdge_graphId_toKey_fkey" FOREIGN KEY ("graphId", "toKey") REFERENCES "WorkflowNode"("graphId", "key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseRuleEvidence" ADD CONSTRAINT "CaseRuleEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity_Log" ADD CONSTRAINT "Activity_Log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Normalized finite-state invariants and immutable ledger enforcement.
ALTER TABLE "SystemRecord" ADD CONSTRAINT "SystemRecord_kind_check" CHECK ("kind" IN ('FILING','PERSON','EVIDENCE'));
ALTER TABLE "IdentityDecision" ADD CONSTRAINT "IdentityDecision_state_check" CHECK ("disposition" IN ('LINK','DISTINCT','SPLIT') AND "leftId" < "rightId");
ALTER TABLE "WorkflowNode" ADD CONSTRAINT "WorkflowNode_state_check" CHECK ("status" IN ('OPEN','DONE'));
ALTER TABLE "CaseRuleEvidence" ADD CONSTRAINT "CaseRuleEvidence_severity_check" CHECK ("offenseSeverityIndex" IS NULL OR "offenseSeverityIndex" BETWEEN 0 AND 10);
CREATE FUNCTION justicegrid_immutable_activity_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Activity_Log is append-only' USING ERRCODE = '55000'; END;
$$;
CREATE TRIGGER activity_log_no_mutation BEFORE UPDATE OR DELETE ON "Activity_Log" FOR EACH ROW EXECUTE FUNCTION justicegrid_immutable_activity_log();
INSERT INTO "SystemGeneration" (id,revision) VALUES ('identity',0),('queue',0);
UPDATE "Case" SET "queueNextEvaluationAt"=NULL;

ALTER TABLE "WorkflowNode" ADD COLUMN "readyAt" TIMESTAMP(3);
ALTER TABLE "CaseRuleEvidence" ADD CONSTRAINT "CaseRuleEvidence_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "RuntimeTextRule" (
 "policyId" TEXT NOT NULL REFERENCES "QueuePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ruleId" TEXT NOT NULL, "position" INTEGER NOT NULL, "condition" TEXT NOT NULL,
 "urgency" TEXT, "component" TEXT, "value" TEXT,
 PRIMARY KEY("policyId","ruleId"),
 CHECK ("urgency" IS NULL OR "urgency" IN ('U0','U1','U2','U3')),
 CHECK ("component" IS NULL OR "component" IN ('H','A','B','D','F'))
);
CREATE TABLE "RuntimeRuleDependency" (
 "policyId" TEXT NOT NULL, "fromRuleId" TEXT NOT NULL, "toRuleId" TEXT NOT NULL,
 PRIMARY KEY ("policyId","fromRuleId","toRuleId"),
 FOREIGN KEY ("policyId","fromRuleId") REFERENCES "RuntimeTextRule"("policyId","ruleId") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("policyId","toRuleId") REFERENCES "RuntimeTextRule"("policyId","ruleId") ON DELETE RESTRICT ON UPDATE CASCADE
);

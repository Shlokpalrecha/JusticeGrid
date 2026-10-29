import { compileRules } from "./systems/rules.js";
import type { Policy } from "./workflowTypes.js";
export const ENGINE_VERSION = "3.0.0";
export const DEFAULT_POLICY: Policy = {
  immediateHours: 24,
  sensitiveHours: 72,
  routineDays: 7,
  hearingNearDays: 3,
  hearingWeekDays: 7,
  agingStepDays: 7,
  weights: {
    hearingNear: 5,
    hearingWeek: 3,
    attendance: 1,
    access: 4,
    communication: 2,
    blocker: 4,
    ordinaryBlocker: 2,
    criticalData: 4,
    ordinaryData: 1,
    aging: 3,
  },
};
export function validatePolicy(p: Policy): void {
  if (p.textRules) compileRules(p.textRules);
  const w = p.weights;
  if (Object.values(p).some((v) => typeof v === "number" && (!Number.isInteger(v) || v <= 0)))
    throw new Error("Policy windows must be positive integers");
  if (
    p.immediateHours < 24 ||
    p.immediateHours > 48 ||
    p.sensitiveHours < 72 ||
    p.sensitiveHours > 168 ||
    p.immediateHours >= p.sensitiveHours ||
    p.hearingNearDays > p.hearingWeekDays ||
    p.hearingWeekDays > 30 ||
    p.routineDays > 30 ||
    p.agingStepDays > 30
  )
    throw new Error("Policy windows exceed supported boundaries");
  if (Object.values(w).some((v) => !Number.isInteger(v) || v < 0))
    throw new Error("Weights must be non-negative integers");
  if (
    w.hearingNear > 5 ||
    w.hearingWeek > w.hearingNear ||
    w.attendance > w.hearingNear ||
    w.access > 4 ||
    w.communication > w.access ||
    w.blocker > 4 ||
    w.ordinaryBlocker > w.blocker ||
    w.criticalData > 4 ||
    w.ordinaryData > w.criticalData ||
    w.aging > 3
  )
    throw new Error("Support weights exceed their family caps");
}

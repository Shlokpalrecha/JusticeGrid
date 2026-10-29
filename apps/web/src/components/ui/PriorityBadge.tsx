import type { PriorityLevel } from "@justicegrid/shared";
import { Badge } from "./Badge";
export const URGENCY_LABELS: Record<PriorityLevel, string> = {
  U0: "Immediate attention",
  U1: "Time-sensitive review",
  U2: "Follow-up needed",
  U3: "Scheduled/routine",
};
const styles: Record<PriorityLevel, string> = {
  U0: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  U1: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  U2: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  U3: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};
export function PriorityBadge({ level }: { level: PriorityLevel | null }) {
  return (
    <Badge className={level ? styles[level] : ""}>
      {level ? level + " · " + URGENCY_LABELS[level] : "Awaiting evaluation"}
    </Badge>
  );
}

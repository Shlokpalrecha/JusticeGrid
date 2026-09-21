import type { PriorityEvaluationDto } from "@justicegrid/shared";
import { formatDateTime } from "../lib/format";
import { Badge } from "./ui/Badge";

const CATEGORY_LABEL: Record<string, string> = {
  HEARING: "Hearing",
  TASK: "Task",
  DOCUMENT: "Document",
  DATA_QUALITY: "Data quality",
  ASSIGNMENT: "Assignment",
  CUSTODY: "Custody",
  ACTIVITY: "Activity",
};

/**
 * The single most important UI element in JusticeGrid (spec §1/§9): the
 * full, human-readable justification for a priority score, matching
 * spec's exact format — `[+4] Hearing is within 3 days...`, the
 * arithmetic line, ruleset/engine version, and evaluation timestamp.
 * There is no priority anywhere in this app without this panel
 * reachable from it.
 */
export function ExplanationPanel({ evaluation }: { evaluation: PriorityEvaluationDto }) {
  if (evaluation.reasons.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">
          No time-sensitive workflow condition triggered.
        </p>
        <EvaluationMeta evaluation={evaluation} />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Why this priority
      </p>
      <ul className="space-y-2">
        {evaluation.reasons.map((reason) => (
          <li key={reason.id || reason.orderIndex} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              +{reason.points}
            </span>
            <span className="flex-1">
              <span className="text-slate-800 dark:text-slate-200">{reason.reasonText}</span>{" "}
              <Badge className="ml-1 align-middle text-[10px]">{reason.ruleCode}</Badge>
              <Badge className="ml-1 align-middle text-[10px]">
                {CATEGORY_LABEL[reason.category] ?? reason.category}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-md bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {evaluation.explanation}
      </div>
      <EvaluationMeta evaluation={evaluation} />
    </div>
  );
}

function EvaluationMeta({ evaluation }: { evaluation: PriorityEvaluationDto }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
      <span>Ruleset v{evaluation.rulesetVersion}</span>
      <span>Engine {evaluation.engineVersion}</span>
      <span>Evaluated {formatDateTime(evaluation.evaluatedAt)}</span>
      <span>Triggered by {evaluation.triggeredBy}</span>
    </div>
  );
}

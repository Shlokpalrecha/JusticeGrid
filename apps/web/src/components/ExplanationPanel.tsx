import { useQuery } from "@tanstack/react-query";
import type { PriorityEvaluationDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { PriorityBadge } from "./ui/PriorityBadge";
export function ExplanationPanel({
  evaluation: e,
  historical = false,
}: {
  evaluation: PriorityEvaluationDto;
  historical?: boolean;
}) {
  const owners = useQuery({
    queryKey: ["workflow-owners"],
    queryFn: () => api.get<{ id: string; fullName: string }[]>("/workflows/owners"),
  });
  const policy = useQuery({
    queryKey: ["queue-policy"],
    queryFn: () =>
      api.get<{ sources: Record<string, { title: string; url: string | null }> }>("/queue-policy"),
  });
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-3">
        <PriorityBadge level={e.priorityLevel} />
        <span className="text-xs text-slate-500">
          Support {e.supportScore}/20 · urgency and deadline sort first
        </span>
      </div>
      {!historical && (e.stale || e.error) && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {e.error ?? "This evaluation is stale. Refresh before acting."}
        </p>
      )}
      <p className="text-sm text-slate-700 dark:text-slate-300">{e.explanation}</p>
      {e.actions.map((a) => (
        <details
          key={a.key}
          className="rounded border border-slate-100 p-3 dark:border-slate-800"
          open={a.id === e.selectedAction?.id}
        >
          <summary className="cursor-pointer text-sm font-medium">
            {a.urgency} · {a.title}
          </summary>
          <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <p>{a.evidence}</p>
            <p>
              Due / review:{" "}
              {a.orderingDeadline ? formatDateTime(a.orderingDeadline) : "Not confirmed"} ·{" "}
              {a.origin.replaceAll("_", " ")} · {a.confidence}
            </p>
            <p>
              Owner:{" "}
              {a.ownerId
                ? (owners.data?.data.find((o) => o.id === a.ownerId)?.fullName ??
                  "Recorded owner unavailable")
                : "Unassigned"}{" "}
              · {a.status} · Active since {formatDateTime(a.activatedAt)}
            </p>
            <p>
              Hearing {a.components.H} + Access {a.components.A} + Blocker {a.components.B} +
              Verification {a.components.D} + Waiting {a.components.F} = {a.supportScore}/20
            </p>
            <p>
              {policy.data?.data.sources[a.sourceId]?.url ? (
                <a
                  className="underline"
                  href={policy.data.data.sources[a.sourceId]!.url!}
                  target="_blank"
                  rel="noreferrer"
                >
                  {policy.data.data.sources[a.sourceId]!.title}
                </a>
              ) : (
                (policy.data?.data.sources[a.sourceId]?.title ?? "Team operational policy")
              )}{" "}
              · {a.locator}
            </p>
            {a.ruleTrace && (
              <details>
                <summary className="cursor-pointer">AST rule trace</summary>
                {a.ruleTrace.map((r) => (
                  <p key={r.id}>
                    {r.id}: {r.result === null ? "UNKNOWN" : String(r.result)}
                    {r.value !== null ? " · value " + r.value : ""} · <code>{r.expression}</code>
                  </p>
                ))}
              </details>
            )}
            {a.warnings.map((w) => (
              <p key={w} className="text-amber-700">
                {w}
              </p>
            ))}
            {a.suppressedDuplicates > 0 && (
              <p>{a.suppressedDuplicates} duplicate contributions suppressed.</p>
            )}
          </div>
        </details>
      ))}
      {e.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-700">
          {w}
        </p>
      ))}
      <p className="text-[11px] text-slate-400">
        Policy v{e.policyVersion} · Engine {e.engineVersion} · Evaluated{" "}
        {formatDateTime(e.evaluatedAt)}
        {historical ? (
          " · Recorded historical snapshot"
        ) : (
          <>
            {" "}
            · Last checked {formatDateTime(e.lastCheckedAt ?? e.evaluatedAt)} · Next check{" "}
            {formatDateTime(e.nextCheckAt ?? e.nextEvaluationAt)}
          </>
        )}
      </p>
    </div>
  );
}

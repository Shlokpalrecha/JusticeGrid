import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { PriorityQueueItemDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/Card";
import { PriorityBadge, URGENCY_LABELS } from "../components/ui/PriorityBadge";
import { ExplanationPanel } from "../components/ExplanationPanel";
import { ErrorBlock, LoadingBlock } from "../components/ui/Feedback";
import { formatDateTime } from "../lib/format";
import { fieldClass } from "../components/WorkflowForm";
function UrgentLane({ lane, title }: { lane: "REFERRAL" | "LEGAL_DEADLINE"; title: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["priority-queue", "lane", lane, page],
    queryFn: () => api.get<PriorityQueueItemDto[]>("/priority/queue", { lane, page, pageSize: 20 }),
    refetchInterval: 30000,
  });
  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 font-semibold text-red-800 dark:text-red-300">{title}</h2>
        {q.isError ? (
          <ErrorBlock message="Urgent work could not be loaded. Refresh and contact the coordinator." />
        ) : q.isLoading ? (
          <LoadingBlock />
        ) : (
          <ul className="space-y-3">
            {q.data?.data.map((c) => (
              <li key={c.caseId}>
                <Link className="text-sm font-medium underline" to={"/cases/" + c.caseId}>
                  {c.caseRef}
                </Link>
                {c.evaluation.stale && (
                  <span className="ml-2 text-xs text-red-700">STALE — verify facts</span>
                )}
                {c.evaluation.actions
                  .filter(
                    (a) =>
                      a.urgency === "U0" &&
                      (lane === "REFERRAL" ? a.type === "A01" : a.type !== "A01"),
                  )
                  .map((a) => (
                    <p key={a.key} className="text-xs text-slate-600 dark:text-slate-400">
                      {a.title} ·{" "}
                      {a.orderingDeadline
                        ? formatDateTime(a.orderingDeadline)
                        : "Immediate referral"}
                      {!a.ownerId ? " · UNASSIGNED" : ""}
                    </p>
                  ))}
              </li>
            ))}
            {!q.data?.data.length && (
              <li className="text-sm text-slate-500">No recorded actions in this lane.</li>
            )}
          </ul>
        )}
        {q.data && (q.data.meta?.total ?? 0) > 20 && (
          <div className="mt-3 flex gap-3 text-xs">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              {page} / {q.data.meta?.totalPages}
            </span>
            <button
              disabled={page >= (q.data.meta?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export function PriorityQueuePage() {
  const [params] = useSearchParams();
  const [priority, setPriority] = useState(""),
    [lane, setLane] = useState(params.get("lane") === "OLDEST" ? "OLDEST" : ""),
    [actionType, setType] = useState(""),
    [page, setPage] = useState(1),
    [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["priority-queue", priority, lane, actionType, page],
    queryFn: () =>
      api.get<PriorityQueueItemDto[]>("/priority/queue", {
        page,
        pageSize: 20,
        ...(priority ? { priority } : {}),
        ...(lane ? { lane } : {}),
        ...(actionType ? { actionType } : {}),
      }),
    refetchInterval: 30000,
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Action review queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Urgency → action deadline → capped support → waiting time. Each case appears once. Weights
          are prototype team policy.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <UrgentLane lane="REFERRAL" title="Urgent referrals — response needed" />
        <UrgentLane lane="LEGAL_DEADLINE" title="Critical legal / court actions" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          Urgency
          <select
            aria-label="Filter urgency"
            className={fieldClass}
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All urgency levels</option>
            {Object.entries(URGENCY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {k + " · " + v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Work view
          <select
            className={fieldClass}
            value={lane}
            onChange={(e) => {
              setLane(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Priority order</option>
            <option value="OLDEST">Oldest unresolved U2/U3 work</option>
          </select>
        </label>
        <label className="text-xs">
          Action category
          <select
            className={fieldClass}
            value={actionType}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All action categories</option>
            {Array.from({ length: 17 }, (_, i) => "A" + String(i + 1).padStart(2, "0")).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock message="Queue unavailable. Priority is unknown until it can be loaded." />
      ) : (
        <div className="space-y-3">
          {q.data?.data.map((item) => (
            <Card key={item.caseId}>
              <CardContent>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link className="font-semibold underline" to={"/cases/" + item.caseId}>
                      #{item.rank} · {item.caseRef}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.personAlias} · {item.assignedTo?.fullName ?? "Unassigned"}
                    </p>
                  </div>
                  <PriorityBadge level={item.evaluation.priorityLevel} />
                </div>
                <p className="mt-3 text-sm">
                  {item.evaluation.selectedAction?.title ?? "Next planned review"}
                </p>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>
                    Due / review:{" "}
                    {(item.evaluation.selectedAction?.orderingDeadline ??
                    item.evaluation.plannedReviewAt)
                      ? formatDateTime(
                          item.evaluation.selectedAction?.orderingDeadline ??
                            item.evaluation.plannedReviewAt,
                        )
                      : "Not confirmed"}
                  </span>
                  <span>Support {item.evaluation.supportScore}/20</span>
                  <span>{item.evaluation.actions.length} unresolved actions</span>
                  {lane === "OLDEST" && item.evaluation.actions.length > 0 && (
                    <span>
                      Oldest unresolved work since{" "}
                      {formatDateTime(
                        new Date(
                          Math.min(
                            ...item.evaluation.actions.map((a) => Date.parse(a.activatedAt)),
                          ),
                        ).toISOString(),
                      )}
                    </span>
                  )}
                </div>
                {item.evaluation.stale && (
                  <p className="mt-2 text-sm text-red-700" role="alert">
                    Stale evaluation: verify this case before acting.
                  </p>
                )}
                {item.evaluation.error && (
                  <p className="mt-2 text-sm text-red-700" role="alert">
                    {item.evaluation.error}
                  </p>
                )}
                <button
                  className="mt-3 text-xs font-medium underline"
                  onClick={() => setExpanded(expanded === item.caseId ? null : item.caseId)}
                >
                  {expanded === item.caseId ? "Hide" : "Show"} evidence and calculation
                </button>
                {expanded === item.caseId && (
                  <div className="mt-3">
                    <ExplanationPanel evaluation={item.evaluation} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!q.data?.data.length && (
            <p className="rounded border p-8 text-center text-sm text-slate-500">
              No cases match these filters.
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-4 text-sm">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span>
          Page {page} of {q.data?.meta?.totalPages ?? 1} · {q.data?.meta?.total ?? 0} cases
        </span>
        <button
          disabled={page >= (q.data?.meta?.totalPages ?? 1)}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

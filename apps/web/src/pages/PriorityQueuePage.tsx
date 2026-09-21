import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";
import type { PriorityQueueItemDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Input";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/Feedback";
import { formatDate, formatRelative } from "../lib/format";
import { ExplanationPanel } from "../components/ExplanationPanel";

const PAGE_SIZE = 20;

export function PriorityQueuePage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [priority, setPriority] = useState("");
  const [ruleCode, setRuleCode] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["priority-queue", page, priority, ruleCode],
    queryFn: () =>
      api.get<PriorityQueueItemDto[]>("/priority/queue", {
        page,
        pageSize: PAGE_SIZE,
        priority: priority || undefined,
        ruleCode: ruleCode || undefined,
      }),
  });

  const recomputeMutation = useMutation({
    mutationFn: (caseId: string) => api.post(`/priority/case/${caseId}/recompute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["priority-queue"] }),
  });

  function exportCsv() {
    const items = data?.data ?? [];
    const header = "Rank,Case Ref,Person Alias,Priority,Score,Next Hearing,Reasons,Assigned To\n";
    const rows = items
      .map((i) =>
        [
          i.rank,
          i.caseRef,
          i.personAlias,
          i.evaluation.priorityLevel,
          i.evaluation.totalScore,
          i.nextHearingDate ?? "",
          i.evaluation.triggeredCount,
          i.assignedTo?.fullName ?? "Unassigned",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "priority-queue.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Priority Queue
          </h1>
          <p className="text-sm text-slate-500">
            Ranked, explainable workflow queue — a review aid, not a legal or judicial decision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            className="w-36"
          >
            <option value="">All priorities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="ROUTINE">Routine</option>
          </Select>
          <input
            value={ruleCode}
            onChange={(e) => {
              setRuleCode(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by rule code (e.g. R-DOC-MISSING)"
            className="h-9 w-64 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <Button variant="secondary" size="md" onClick={exportCsv} disabled={items.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading && <LoadingBlock label="Loading the priority queue..." />}
      {isError && <ErrorBlock message="Could not load the priority queue." />}

      {!isLoading && !isError && items.length === 0 && (
        <Card>
          <EmptyState
            title="No cases match these filters"
            description="Try clearing the priority band or rule code filter."
          />
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="w-10 px-4 py-2.5"></th>
                  <th className="px-2 py-2.5">Rank</th>
                  <th className="px-2 py-2.5">Case</th>
                  <th className="px-2 py-2.5">Person</th>
                  <th className="px-2 py-2.5">Priority</th>
                  <th className="px-2 py-2.5">Score</th>
                  <th className="px-2 py-2.5">Next Hearing</th>
                  <th className="px-2 py-2.5">Reasons</th>
                  <th className="px-2 py-2.5">Assigned To</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <QueueRow
                    key={item.caseId}
                    item={item}
                    isExpanded={expandedId === item.caseId}
                    onToggle={() => setExpandedId(expandedId === item.caseId ? null : item.caseId)}
                    canRecompute={can("RECORD_CASE_ACTIVITY")}
                    onRecompute={() => recomputeMutation.mutate(item.caseId)}
                    isRecomputing={
                      recomputeMutation.isPending && recomputeMutation.variables === item.caseId
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          {meta && meta.total !== undefined && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
              <span>
                {isFetching
                  ? "Refreshing..."
                  : `${meta.total} case${meta.total === 1 ? "" : "s"} total`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {meta.totalPages ?? 1}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= (meta.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function QueueRow({
  item,
  isExpanded,
  onToggle,
  canRecompute,
  onRecompute,
  isRecomputing,
}: {
  item: PriorityQueueItemDto;
  isExpanded: boolean;
  onToggle: () => void;
  canRecompute: boolean;
  onRecompute: () => void;
  isRecomputing: boolean;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-slate-400">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-2 py-3 font-mono text-xs text-slate-500">#{item.rank}</td>
        <td className="px-2 py-3">
          <Link
            to={`/cases/${item.caseId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-slate-900 hover:underline dark:text-slate-100"
          >
            {item.caseRef}
          </Link>
        </td>
        <td className="px-2 py-3 text-slate-600 dark:text-slate-400">{item.personAlias}</td>
        <td className="px-2 py-3">
          <PriorityBadge level={item.evaluation.priorityLevel} />
        </td>
        <td className="px-2 py-3 font-mono text-slate-700 dark:text-slate-300">
          {item.evaluation.totalScore}
        </td>
        <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
          {item.nextHearingDate ? (
            <span title={formatDate(item.nextHearingDate)}>
              {formatRelative(item.nextHearingDate)}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
          {item.evaluation.triggeredCount}
        </td>
        <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
          {item.assignedTo?.fullName ?? "Unassigned"}
        </td>
        <td className="px-2 py-3">
          {canRecompute && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRecompute();
              }}
              isLoading={isRecomputing}
              title="Recompute now"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/30">
          <td colSpan={10} className="px-6 py-4">
            <ExplanationPanel evaluation={item.evaluation} />
          </td>
        </tr>
      )}
    </>
  );
}

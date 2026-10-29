import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { CaseListItemDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Input";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/Feedback";
import { formatDate, titleCase } from "../lib/format";

const PAGE_SIZE = 20;

export function CasesListPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [unassigned, setUnassigned] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cases", page, q, status, priority, unassigned],
    queryFn: () =>
      api.get<CaseListItemDto[]>("/cases", {
        page,
        pageSize: PAGE_SIZE,
        q: q || undefined,
        status: status || undefined,
        priority: priority || undefined,
        unassigned: unassigned || undefined,
      }),
  });

  const items = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cases</h1>
        <p className="text-sm text-slate-500">
          Every case you're assigned to (or all cases, if you're ADMIN/AUDITOR).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search case ref or court..."
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-48"
        >
          <option value="">All statuses</option>
          {[
            "REGISTERED",
            "UNDER_INVESTIGATION",
            "CHARGES_FRAMED",
            "TRIAL_ONGOING",
            "BAIL_PENDING",
            "BAIL_GRANTED",
            "DISPOSED",
            "TRANSFERRED",
            "CLOSED",
          ].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All priorities</option>
          <option value="U0">U0 · Immediate</option>
          <option value="U1">U1 · Time-sensitive</option>
          <option value="U2">U2 · Follow-up</option>
          <option value="U3">U3 · Scheduled</option>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={unassigned}
            onChange={(e) => {
              setUnassigned(e.target.checked);
              setPage(1);
            }}
          />
          Unassigned only
        </label>
      </div>

      {isLoading && <LoadingBlock label="Loading cases..." />}
      {isError && <ErrorBlock message="Could not load cases." />}

      {!isLoading && !isError && items.length === 0 && (
        <Card>
          <EmptyState title="No cases match these filters" />
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2.5">Case Ref</th>
                  <th className="px-2 py-2.5">Person</th>
                  <th className="px-2 py-2.5">Court</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5">Priority</th>
                  <th className="px-2 py-2.5">Next Hearing</th>
                  <th className="px-2 py-2.5">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/cases/${c.id}`}
                        className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                      >
                        {c.caseRef}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
                      {c.person.aliasCode}
                    </td>
                    <td className="px-2 py-3 text-slate-600 dark:text-slate-400">{c.courtName}</td>
                    <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
                      {titleCase(c.caseStatus)}
                    </td>
                    <td className="px-2 py-3">
                      <PriorityBadge level={c.currentPriorityLevel} />
                    </td>
                    <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
                      {formatDate(c.nextHearingDate)}
                    </td>
                    <td className="px-2 py-3 text-slate-600 dark:text-slate-400">
                      {c.assignedTo?.fullName ?? "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
              <span>
                {meta.total} case{meta.total === 1 ? "" : "s"} total
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

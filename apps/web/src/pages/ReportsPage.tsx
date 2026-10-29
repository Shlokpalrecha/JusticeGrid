import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type {
  CaseAgingRow,
  CompletedTaskRow,
  OverdueActionRow,
  PendingByUserRow,
  PriorityDistribution,
  ActionFrequencyRow,
  UpcomingHearingRow,
} from "@justicegrid/shared";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { LoadingBlock, ErrorBlock, EmptyState } from "../components/ui/Feedback";
import { formatDate, titleCase } from "../lib/format";

const REPORTS = [
  { name: "pending-by-user", label: "Pending by User" },
  { name: "upcoming-hearings", label: "Upcoming Hearings" },
  { name: "overdue-actions", label: "Overdue Actions" },
  { name: "priority-distribution", label: "Priority Distribution" },
  { name: "completed", label: "Completed Tasks" },
  { name: "case-aging", label: "Case Aging" },
  { name: "action-frequency", label: "Action Category Frequency" },
] as const;

export function ReportsPage() {
  const [active, setActive] = useState<(typeof REPORTS)[number]["name"]>("pending-by-user");

  async function downloadCsv(name: string) {
    const { data: csv } = await api.getCsv(`/reports/${name}/export.csv`);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reports</h1>
        <p className="text-sm text-slate-500">
          Operational reports over the case load you can see.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.name}
            onClick={() => setActive(r.name)}
            className={
              active === r.name
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                : "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900"
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{REPORTS.find((r) => r.name === active)?.label}</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => void downloadCsv(active)}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {active === "pending-by-user" && <PendingByUserReport />}
          {active === "upcoming-hearings" && <UpcomingHearingsReport />}
          {active === "overdue-actions" && <OverdueActionsReport />}
          {active === "priority-distribution" && <PriorityDistributionReport />}
          {active === "completed" && <CompletedReport />}
          {active === "case-aging" && <CaseAgingReport />}
          {active === "action-frequency" && <ActionFrequencyReport />}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportTable<T>({
  queryKey,
  path,
  query,
  columns,
}: {
  queryKey: unknown[];
  path: string;
  query?: Record<string, string | number>;
  columns: { header: string; render: (row: T) => React.ReactNode }[];
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api.get<T[]>(path, query),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load this report." />;
  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyState title="No data for this report" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className="px-4 py-2.5">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              {columns.map((c) => (
                <td key={c.header} className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingByUserReport() {
  return (
    <ReportTable<PendingByUserRow>
      queryKey={["reports", "pending-by-user"]}
      path="/reports/pending-by-user"
      columns={[
        { header: "User", render: (r) => r.userName },
        { header: "Pending", render: (r) => r.pendingCount },
        { header: "In Progress", render: (r) => r.inProgressCount },
        { header: "Blocked", render: (r) => r.blockedCount },
        { header: "Total Open", render: (r) => <strong>{r.totalOpen}</strong> },
      ]}
    />
  );
}

function UpcomingHearingsReport() {
  return (
    <ReportTable<UpcomingHearingRow>
      queryKey={["reports", "upcoming-hearings"]}
      path="/reports/upcoming-hearings"
      query={{ days: 14 }}
      columns={[
        { header: "Case", render: (r) => r.caseRef },
        { header: "Type", render: (r) => titleCase(r.hearingType) },
        { header: "Scheduled", render: (r) => formatDate(r.scheduledDate) },
        { header: "Assigned To", render: (r) => r.assignedTo ?? "Unassigned" },
      ]}
    />
  );
}

function OverdueActionsReport() {
  return (
    <ReportTable<OverdueActionRow>
      queryKey={["reports", "overdue-actions"]}
      path="/reports/overdue-actions"
      columns={[
        { header: "Case", render: (r) => r.caseRef },
        { header: "Task", render: (r) => r.title },
        { header: "Due", render: (r) => formatDate(r.dueDate) },
        { header: "Days Overdue", render: (r) => r.daysOverdue },
        { header: "Assigned To", render: (r) => r.assignedTo ?? "Unassigned" },
      ]}
    />
  );
}

function CompletedReport() {
  return (
    <ReportTable<CompletedTaskRow>
      queryKey={["reports", "completed"]}
      path="/reports/completed"
      columns={[
        { header: "Case", render: (r) => r.caseRef },
        { header: "Task", render: (r) => r.title },
        { header: "Completed At", render: (r) => formatDate(r.completedAt) },
        { header: "Completed By", render: (r) => r.completedBy ?? "â€”" },
      ]}
    />
  );
}

function CaseAgingReport() {
  return (
    <ReportTable<CaseAgingRow>
      queryKey={["reports", "case-aging"]}
      path="/reports/case-aging"
      columns={[
        { header: "Case", render: (r) => r.caseRef },
        { header: "Custody Start", render: (r) => formatDate(r.custodyStartDate) },
        { header: "Days in Custody", render: (r) => r.daysInCustody ?? "â€”" },
        { header: "Priority", render: (r) => r.priorityLevel ?? "â€”" },
        { header: "Assigned To", render: (r) => r.assignedTo ?? "Unassigned" },
      ]}
    />
  );
}

function ActionFrequencyReport() {
  return (
    <ReportTable<ActionFrequencyRow>
      queryKey={["reports", "action-frequency"]}
      path="/reports/action-frequency"
      columns={[
        { header: "Action category", render: (r) => `${r.actionType} â€” ${r.actionName}` },
        { header: "Cases with unresolved work", render: (r) => <strong>{r.triggerCount}</strong> },
      ]}
    />
  );
}

function PriorityDistributionReport() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports", "priority-distribution"],
    queryFn: () => api.get<PriorityDistribution>("/reports/priority-distribution"),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load this report." />;
  const dist = data!.data;
  return (
    <div className="flex gap-6 p-5 text-sm">
      <span className="text-red-600">
        U0 — Immediate: <strong>{dist.U0}</strong>
      </span>
      <span className="text-amber-600">
        U1 — Time-sensitive: <strong>{dist.U1}</strong>
      </span>
      <span className="text-blue-600">
        U2 — Follow-up: <strong>{dist.U2}</strong>
      </span>
      <span className="text-green-600">
        U3 — Scheduled: <strong>{dist.U3}</strong>
      </span>
    </div>
  );
}

import { CaseActivityEditor } from "../components/CaseActivityEditor";
import { WorkflowTab } from "../components/WorkflowTab";
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type {
  AuditLogDto,
  CaseAggregateDto,
  DocumentRequirementDto,
  HearingDto,
  PriorityEvaluationDto,
  TaskListItemDto,
  TimelineEventDto,
} from "@justicegrid/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { Badge } from "../components/ui/Badge";
import { ErrorBlock, LoadingBlock, EmptyState } from "../components/ui/Feedback";
import { ExplanationPanel } from "../components/ExplanationPanel";
import { cn } from "../lib/cn";
import { formatDate, formatDateTime, titleCase } from "../lib/format";

const TABS = [
  "Overview",
  "Workflow",
  "Timeline",
  "Hearings",
  "Tasks",
  "Documents",
  "Priority",
  "Audit",
] as const;
type Tab = (typeof TABS)[number];

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");

  const caseQuery = useQuery({
    queryKey: ["case", id],
    queryFn: () => api.get<CaseAggregateDto>(`/cases/${id}`),
    enabled: !!id,
  });

  const recomputeMutation = useMutation({
    mutationFn: () => api.post(`/priority/case/${id}/recompute`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["case", id] });
      void queryClient.invalidateQueries({ queryKey: ["priority-history", id] });
    },
  });

  if (caseQuery.isLoading) return <LoadingBlock label="Loading case..." />;
  if (caseQuery.isError || !caseQuery.data)
    return <ErrorBlock message="Could not load this case." />;

  const c = caseQuery.data.data;

  return (
    <div className="space-y-4">
      <Link
        to="/cases"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to cases
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {c.caseRef}
            </h1>
            <PriorityBadge level={c.currentPriorityLevel} />
          </div>
          <p className="text-sm text-slate-500">
            {c.person.displayName} ({c.person.aliasCode}) · {c.courtName}
          </p>
        </div>
        <Link to={`/systems?caseId=${id}`} className="text-sm underline">
          Workflow dependencies and reviewed rule inputs
        </Link>
        {can("RECORD_CASE_ACTIVITY") && (
          <Button
            variant="secondary"
            onClick={() => recomputeMutation.mutate()}
            isLoading={recomputeMutation.isPending}
          >
            <RefreshCw className="h-4 w-4" /> Recompute priority
          </Button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <CaseActivityEditor caseId={c.id} />
      {tab === "Overview" && <OverviewTab caseData={c} />}
      {tab === "Workflow" && <WorkflowTab caseId={c.id} />}
      {tab === "Timeline" && <TimelineTab caseId={c.id} />}
      {tab === "Hearings" && <HearingsTab caseId={c.id} />}
      {tab === "Tasks" && <TasksTab caseId={c.id} />}
      {tab === "Documents" && <DocumentsTab caseId={c.id} />}
      {tab === "Priority" && <PriorityTab caseId={c.id} />}
      {tab === "Audit" && <AuditTab caseId={c.id} />}
    </div>
  );
}

function OverviewTab({ caseData: c }: { caseData: CaseAggregateDto }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Case status" value={titleCase(c.caseStatus)} />
          <Field label="Court" value={`${c.courtName} (${c.courtType})`} />
          <Field label="District / State" value={`${c.district}, ${c.state}`} />
          <Field label="Custody type" value={titleCase(c.custodyType)} />
          <Field label="Custody start date" value={formatDate(c.custodyStartDate)} />
          <Field label="Bail status" value={titleCase(c.bailStatus)} />
          <Field label="Next hearing" value={formatDate(c.nextHearingDate)} />
          <Field label="Last hearing" value={formatDate(c.lastHearingDate)} />
          <Field label="Assigned to" value={c.assignedTo?.fullName ?? "Unassigned"} />
          <Field label="Created by" value={c.createdBy.fullName} />
          <Field label="FIR (synthetic)" value={`${c.firNumberSynthetic} (${c.firYear})`} />
          <Field label="Police station (alias)" value={c.policeStationAlias} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Data completeness
            </p>
            <ul className="space-y-1.5 text-sm">
              {c.fieldCompleteness.checkedFields.map((field) => (
                <li key={field} className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{titleCase(field)}</span>
                  <Badge
                    className={
                      c.fieldCompleteness.missingFields.includes(field)
                        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                        : "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                    }
                  >
                    {c.fieldCompleteness.missingFields.includes(field) ? "Missing" : "Present"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Charges ({c.charges.length})
            </p>
            {c.charges.length === 0 ? (
              <p className="text-sm text-slate-400">No charges recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.charges.map((charge) => (
                  <li key={charge.id}>
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {charge.actName} §{charge.sectionCode}
                    </p>
                    <p className="text-xs text-slate-500">
                      {charge.description} · {titleCase(charge.severityBand)} ·{" "}
                      {charge.isBailableFlag ? "Bailable" : "Non-bailable"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function TimelineTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["case-timeline", caseId],
    queryFn: () => api.get<TimelineEventDto[]>(`/cases/${caseId}/timeline`),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load the timeline." />;
  const events = data?.data ?? [];
  if (events.length === 0)
    return (
      <Card>
        <EmptyState title="No activity recorded yet" />
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {events.map((e) => (
            <li key={`${e.type}-${e.id}`} className="flex items-start gap-3 px-5 py-3 text-sm">
              <Badge className="mt-0.5 shrink-0">{e.type}</Badge>
              <div>
                <p className="text-slate-800 dark:text-slate-200">{e.summary}</p>
                <p className="text-xs text-slate-500">{formatDateTime(e.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function HearingsTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["case-hearings", caseId],
    queryFn: () => api.get<HearingDto[]>(`/cases/${caseId}/hearings`),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load hearings." />;
  const hearings = [...(data?.data ?? [])].sort(
    (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
  );
  if (hearings.length === 0)
    return (
      <Card>
        <EmptyState title="No hearings recorded" />
      </Card>
    );

  return (
    <div className="space-y-3">
      {hearings.map((h) => (
        <Card key={h.id}>
          <CardContent className="flex items-start justify-between gap-4 text-sm">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {titleCase(h.hearingType)}
              </p>
              <p className="text-xs text-slate-500">{formatDate(h.scheduledDate)}</p>
              {h.orderSummary && (
                <p className="mt-1 text-slate-600 dark:text-slate-400">{h.orderSummary}</p>
              )}
              {h.adjournmentReason && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Adjourned: {h.adjournmentReason}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge>{titleCase(h.outcome)}</Badge>
              {h.outcome === "ORDER_PASSED" && (
                <Badge
                  className={
                    h.orderReviewed
                      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                      : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                  }
                >
                  {h.orderReviewed ? "Order reviewed" : "Order not reviewed"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TasksTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["case-tasks", caseId],
    queryFn: () => api.get<TaskListItemDto[]>("/tasks", { caseId, pageSize: 100 }),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load tasks." />;
  const tasks = data?.data ?? [];
  if (tasks.length === 0)
    return (
      <Card>
        <EmptyState title="No tasks on this case" />
      </Card>
    );

  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <Card key={t.id}>
          <CardContent className="flex items-start justify-between gap-4 text-sm">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{t.title}</p>
              <p className="text-xs text-slate-500">
                {titleCase(t.category)} · Due {formatDate(t.dueDate)}
                {t.isPreparationTask && " · Preparation task"}
              </p>
            </div>
            <Badge
              className={
                t.status === "COMPLETED"
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                  : t.status === "BLOCKED"
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                    : undefined
              }
            >
              {titleCase(t.status)}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DocumentsTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["case-documents", caseId],
    queryFn: () => api.get<DocumentRequirementDto[]>(`/cases/${caseId}/documents`),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load documents." />;
  const docs = data?.data ?? [];
  if (docs.length === 0)
    return (
      <Card>
        <EmptyState title="No document checklist applied yet" />
      </Card>
    );

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
          <tr>
            <th className="px-4 py-2.5">Document</th>
            <th className="px-2 py-2.5">Mandatory</th>
            <th className="px-2 py-2.5">Status</th>
            <th className="px-2 py-2.5">Received</th>
            <th className="px-2 py-2.5">Verified</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr
              key={d.id}
              className="border-b border-slate-100 last:border-0 dark:border-slate-800"
            >
              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                {titleCase(d.documentType)}
              </td>
              <td className="px-2 py-3 text-slate-500">{d.isMandatory ? "Yes" : "No"}</td>
              <td className="px-2 py-3">
                <Badge
                  className={
                    d.status === "MISSING"
                      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                      : d.status === "VERIFIED"
                        ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                        : undefined
                  }
                >
                  {titleCase(d.status)}
                </Badge>
              </td>
              <td className="px-2 py-3 text-slate-500">{formatDate(d.receivedAt)}</td>
              <td className="px-2 py-3 text-slate-500">{formatDate(d.verifiedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PriorityTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["priority-history", caseId],
    queryFn: () => api.get<PriorityEvaluationDto[]>(`/priority/case/${caseId}/history`),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load priority history." />;
  const history = data?.data ?? [];
  if (history.length === 0)
    return (
      <Card>
        <EmptyState title="This case has not been evaluated yet" />
      </Card>
    );

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Current evaluation
        </p>
        <ExplanationPanel evaluation={history[0]!} />
      </div>
      {history.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            History ({history.length - 1} earlier)
          </p>
          <div className="space-y-2">
            {history.slice(1).map((e) => (
              <details
                key={e.id}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <summary className="cursor-pointer text-sm">
                  {formatDateTime(e.evaluatedAt)} · {e.priorityLevel} · {e.supportScore}/20 support
                  · Engine {e.engineVersion}
                </summary>
                <div className="mt-3">
                  <ExplanationPanel evaluation={e} historical />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["case-audit", caseId],
    queryFn: () => api.get<AuditLogDto[]>(`/cases/${caseId}/audit`),
  });
  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message="Could not load the audit trail." />;
  const entries = data?.data ?? [];
  if (entries.length === 0)
    return (
      <Card>
        <EmptyState title="No audit entries for this case" />
      </Card>
    );

  return (
    <Card className="p-0">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {entries.map((e) => (
          <li key={e.id} className="px-5 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800 dark:text-slate-200">{e.summary}</span>
              <Badge>{e.action}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {e.actorEmail} · {formatDateTime(e.createdAt)} · seq #{e.sequence}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

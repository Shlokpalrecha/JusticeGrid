import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, ShieldAlert, XCircle } from "lucide-react";
import type { AuditChainVerification, AuditLogDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Input";
import { LoadingBlock, ErrorBlock, EmptyState } from "../components/ui/Feedback";
import { formatDateTime } from "../lib/format";

const ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "ASSIGN",
  "UNASSIGN",
  "STATUS_CHANGE",
  "RULE_TOGGLE",
  "RULE_WEIGHT_CHANGE",
  "THRESHOLD_CHANGE",
  "PRIORITY_RECOMPUTE",
  "EXPORT",
  "ACCESS_DENIED",
  "PASSWORD_CHANGE",
];

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit", page, action],
    queryFn: () =>
      api.get<AuditLogDto[]>("/audit", { page, pageSize: 25, action: action || undefined }),
  });

  const chainQuery = useQuery({
    queryKey: ["audit-verify-chain"],
    queryFn: () => api.get<AuditChainVerification>("/audit/verify-chain"),
  });

  async function downloadCsv() {
    const { data: csv } = await api.getCsv("/audit/export.csv", { action: action || undefined });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = data?.data ?? [];
  const meta = data?.meta;
  const chain = chainQuery.data?.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Audit Log</h1>
          <p className="text-sm text-slate-500">Hash-chained, tamper-evident, append-only.</p>
        </div>
        <div className="flex items-center gap-2">
          {chain && (
            <span
              className={
                chain.intact
                  ? "flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                  : "flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              }
            >
              {chain.intact ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Chain {chain.intact ? "intact" : "BROKEN"} ({chain.entriesChecked} entries)
            </span>
          )}
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="w-48"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" onClick={() => void downloadCsv()}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {!chain?.intact && chain && (
        <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <ShieldAlert className="h-4 w-4" />
          Hash chain integrity check failed at sequence #{chain.firstBreakAtSequence}. Investigate
          immediately.
        </div>
      )}

      {isLoading && <LoadingBlock label="Loading audit log..." />}
      {isError && <ErrorBlock message="Could not load the audit log." />}

      {!isLoading && !isError && items.length === 0 && (
        <Card>
          <EmptyState title="No audit entries match this filter" />
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((e) => (
              <div key={e.id}>
                <button
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900/40"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        e.success
                          ? undefined
                          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                      }
                    >
                      {e.action}
                    </Badge>
                    <span className="text-slate-800 dark:text-slate-200">{e.summary}</span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDateTime(e.createdAt)}
                  </span>
                </button>
                {expanded === e.id && (
                  <div className="space-y-2 bg-slate-50 px-5 py-3 text-xs dark:bg-slate-900/40">
                    <p>
                      <strong>Actor:</strong> {e.actorEmail} ({e.actorRole ?? "system"})
                    </p>
                    <p>
                      <strong>Entity:</strong> {e.entityType} {e.entityId}
                    </p>
                    <p>
                      <strong>Sequence:</strong> #{e.sequence} · <strong>Hash:</strong>{" "}
                      <span className="font-mono">{e.hash.slice(0, 16)}...</span>
                    </p>
                    {e.changedFields.length > 0 && (
                      <p>
                        <strong>Changed fields:</strong> {e.changedFields.join(", ")}
                      </p>
                    )}
                    {e.beforeJson != null && (
                      <details>
                        <summary className="cursor-pointer text-slate-500">Before</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-red-50 p-2 text-[10px] dark:bg-red-950/50">
                          {JSON.stringify(e.beforeJson, null, 2)}
                        </pre>
                      </details>
                    )}
                    {e.afterJson != null && (
                      <details>
                        <summary className="cursor-pointer text-slate-500">After</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-green-50 p-2 text-[10px] dark:bg-green-950/50">
                          {JSON.stringify(e.afterJson, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {meta && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
              <span>{meta.total} entries total</span>
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

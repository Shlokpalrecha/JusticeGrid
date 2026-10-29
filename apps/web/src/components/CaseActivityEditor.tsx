import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  HearingCreateInputSchema,
  HearingUpdateInputSchema,
  TaskCreateInputSchema,
  TaskUpdateInputSchema,
  DocumentCreateInputSchema,
  DocumentUpdateInputSchema,
  CaseUpdateInputSchema,
  type HearingDto,
  type TaskListItemDto,
  type DocumentRequirementDto,
} from "@justicegrid/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { SchemaFields, emptyForm, fieldClass } from "./WorkflowForm";
import { Button } from "./ui/Button";

const updateSchemas = {
  Hearing: HearingUpdateInputSchema,
  Task: TaskUpdateInputSchema,
  Document: DocumentUpdateInputSchema,
};
const kinds = ["Hearing", "Task", "Document", "Case"] as const;
type Kind = (typeof kinds)[number];
const schemas: Record<Kind, z.ZodTypeAny> = {
  Hearing: HearingCreateInputSchema,
  Task: TaskCreateInputSchema,
  Document: DocumentCreateInputSchema,
  Case: CaseUpdateInputSchema,
};
export function CaseActivityEditor({ caseId }: { caseId: string }) {
  const { can } = useAuth();
  const client = useQueryClient();
  const [kind, setKind] = useState<Kind>("Hearing"),
    [value, setValue] = useState<unknown>(() => emptyForm(schemas.Hearing));
  const [target, setTarget] = useState(""),
    [editing, setEditing] = useState(false);
  const selectedSchema = editing && kind !== "Case" ? updateSchemas[kind] : schemas[kind];
  const hearings = useQuery({
    queryKey: ["case-hearings", caseId],
    queryFn: () => api.get<HearingDto[]>(`/cases/${caseId}/hearings`),
  });
  const tasks = useQuery({
    queryKey: ["case-tasks", caseId],
    queryFn: () => api.get<TaskListItemDto[]>("/tasks", { caseId, pageSize: 100 }),
  });
  const docs = useQuery({
    queryKey: ["case-documents", caseId],
    queryFn: () => api.get<DocumentRequirementDto[]>(`/cases/${caseId}/documents`),
  });
  const persons = useQuery({
    queryKey: ["workflow-persons"],
    queryFn: () => api.get<{ id: string; aliasCode: string; displayName: string }[]>("/persons"),
    enabled: kind === "Case" && can("CREATE_EDIT_CASE"),
  });
  const owners = useQuery({
    queryKey: ["workflow-owners"],
    queryFn: () => api.get<{ id: string; fullName: string }[]>("/workflows/owners"),
  });
  const actions = useQuery({
    queryKey: ["workflow", caseId],
    queryFn: () =>
      api.get<{ actions: { key: string; title: string }[] }>(`/workflows/case/${caseId}`),
  });
  const save = useMutation({
    mutationFn: async () => {
      const data = selectedSchema.parse(value) as Record<string, unknown>;
      if (editing)
        return api.patch(
          `/${kind === "Hearing" ? "hearings" : kind === "Task" ? "tasks" : "documents"}/${target}`,
          data,
        );
      if (kind === "Case") return api.patch(`/cases/${caseId}`, data);
      return api.post(
        `/cases/${caseId}/${kind === "Hearing" ? "hearings" : kind === "Task" ? "tasks" : "documents"}`,
        data,
      );
    },
    onSuccess: () => {
      void client.invalidateQueries();
      setValue(emptyForm(schemas[kind]));
      setEditing(false);
    },
  });
  const update = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const endpoint = kind === "Hearing" ? "hearings" : kind === "Task" ? "tasks" : "documents";
      return api.patch(`/${endpoint}/${target}`, body);
    },
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
  const complete = useMutation({
    mutationFn: async () =>
      api.post(
        `/${kind === "Task" ? "tasks" : kind === "Document" ? "documents" : "hearings"}/${target}/${kind === "Task" ? "complete" : kind === "Document" ? "verify" : "mark-order-reviewed"}`,
        {},
      ),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
  const assign = useMutation({
    mutationFn: (owner: string) =>
      api.post(`/cases/${caseId}/assign`, {
        userId: owner,
        reason: "Coordinator assignment from case workflow",
      }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
  if (!can("RECORD_CASE_ACTIVITY")) return null;
  const rows =
    kind === "Hearing"
      ? (hearings.data?.data ?? []).map((h) => ({
          id: h.id,
          title: h.hearingType + " · " + h.scheduledDate,
        }))
      : kind === "Task"
        ? (tasks.data?.data ?? []).map((t) => ({ id: t.id, title: t.title }))
        : (docs.data?.data ?? []).map((d) => ({ id: d.id, title: d.documentType }));
  return (
    <details className="rounded border bg-white p-4 dark:bg-slate-950">
      <summary className="cursor-pointer text-sm font-semibold">
        Record case activity and link preparation
      </summary>
      <div className="mt-4 space-y-4">
        <label className="block text-xs">
          Record type
          <select
            className={fieldClass}
            value={kind}
            onChange={(e) => {
              const k = e.target.value as Kind;
              setKind(k);
              setValue(emptyForm(schemas[k]));
              setTarget("");
              setEditing(false);
            }}
          >
            {kinds
              .filter((k) => k !== "Case" || can("CREATE_EDIT_CASE"))
              .map((k) => (
                <option key={k}>{k}</option>
              ))}
          </select>
        </label>
        <SchemaFields
          schema={selectedSchema}
          value={value}
          onChange={setValue}
          choices={{
            personId: (persons.data?.data ?? []).map((p) => ({
              value: p.id,
              label: p.aliasCode + " · " + p.displayName,
            })),
            assignedToId: (owners.data?.data ?? []).map((o) => ({
              value: o.id,
              label: o.fullName,
            })),
            hearingId: (hearings.data?.data ?? []).map((h) => ({
              value: h.id,
              label: h.hearingType + " · " + h.scheduledDate,
            })),
            actionKey: (actions.data?.data.actions ?? []).map((a) => ({
              value: a.key,
              label: a.title,
            })),
          }}
        />
        <Button onClick={() => save.mutate()} isLoading={save.isPending}>
          Save {editing ? "changes to " : ""}
          {kind.toLowerCase()} record
        </Button>
        {kind !== "Case" && (
          <div className="space-y-3 border-t pt-3">
            <label className="block text-xs">
              Existing record
              <select
                className={fieldClass}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose a record</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            {target && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const row =
                      kind === "Hearing"
                        ? hearings.data?.data.find((h) => h.id === target)
                        : kind === "Task"
                          ? tasks.data?.data.find((t) => t.id === target)
                          : docs.data?.data.find((d) => d.id === target);
                    if (!row) return;
                    const keys = Object.keys(updateSchemas[kind].shape);
                    setValue(
                      Object.fromEntries(
                        Object.entries(row).filter(([k, v]) => keys.includes(k) && v !== null),
                      ),
                    );
                    setEditing(true);
                  }}
                >
                  Edit record details above
                </Button>
                <label className="block text-xs">
                  Status / outcome
                  <select
                    className={fieldClass}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        update.mutate({
                          [kind === "Hearing" ? "outcome" : "status"]: e.target.value,
                        });
                    }}
                  >
                    <option value="">Choose update</option>
                    {(kind === "Hearing"
                      ? ["HELD", "ADJOURNED", "NOT_PRODUCED", "ORDER_PASSED", "CANCELLED"]
                      : kind === "Task"
                        ? ["PENDING", "IN_PROGRESS", "BLOCKED", "CANCELLED"]
                        : ["REQUESTED", "RECEIVED", "REJECTED", "NOT_APPLICABLE"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  onClick={() => complete.mutate()}
                  isLoading={complete.isPending}
                >
                  {kind === "Task"
                    ? "Complete task"
                    : kind === "Document"
                      ? "Verify received document"
                      : "Mark order reviewed"}
                </Button>
                {kind === "Hearing" && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      update.mutate({
                        orderExpected: true,
                        orderReceivedAt: new Date().toISOString(),
                      })
                    }
                  >
                    Record order received now
                  </Button>
                )}
                {kind === "Task" && (
                  <label className="block text-xs">
                    Link hearing preparation
                    <select
                      className={fieldClass}
                      defaultValue=""
                      onChange={(e) =>
                        update.mutate({
                          hearingId: e.target.value || null,
                          isPreparationTask: !!e.target.value,
                        })
                      }
                    >
                      <option value="">No linked hearing</option>
                      {(hearings.data?.data ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.hearingType} · {h.scheduledDate}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}
        {can("ASSIGN_CASE") && (
          <label className="block text-xs">
            Assign case owner
            <select
              className={fieldClass}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) assign.mutate(e.target.value);
              }}
            >
              <option value="">Select owner</option>
              {(owners.data?.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        {[save.error, update.error, complete.error, assign.error].filter(Boolean).map((e, i) => (
          <p key={i} role="alert" className="text-sm text-red-700">
            {e?.message}
          </p>
        ))}
      </div>
    </details>
  );
}

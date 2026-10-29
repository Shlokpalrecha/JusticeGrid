import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WorkflowFactsSchema,
  ActionCreateSchema,
  type WorkflowFacts,
  type ActionResultDto,
  type HearingDto,
  type PriorityLevel,
} from "@justicegrid/shared";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import {
  SchemaFields,
  emptyForm,
  fieldClass,
  fromLocalInput,
  type Choices,
  type Choice,
} from "./WorkflowForm";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { LoadingBlock, ErrorBlock } from "./ui/Feedback";
interface ActionRow
  extends Omit<
    ActionResultDto,
    | "urgency"
    | "originalUrgency"
    | "orderingDeadline"
    | "supportScore"
    | "components"
    | "explanation"
    | "warnings"
    | "suppressedDuplicates"
  > {
  revision: number;
  generated: boolean;
}
interface WorkflowResponse {
  caseOwnerId: string | null;
  facts: WorkflowFacts;
  revision: number;
  actions: ActionRow[];
  error: string | null;
}
interface PolicyInfo {
  profiles: { id: string; name: string; version: number }[];
  sources: Record<string, { title: string }>;
}
const groups: [string, string[]][] = [
  [
    "Representation and communication",
    [
      "representation",
      "counselName",
      "counselAcceptedAt",
      "counselCommunicatedAt",
      "requestReceivedAt",
      "dlsaReceivedAt",
      "lawyerAppointedAt",
      "undecidedSince",
      "lastAidFollowupAt",
      "lastStatusCommunicatedAt",
      "interpreterNeeded",
      "communicationBlocked",
      "lastMeaningfulContactAt",
    ],
  ],
  ["Urgent referrals", ["urgentReports"]],
  [
    "Procedure and custody evidence",
    [
      "procedure",
      "procedureBasis",
      "specialLaw",
      "legalProfileId",
      "arrestAt",
      "firstRemandAt",
      "prisonAdmissionAt",
      "custodyIntervals",
      "excludedIntervals",
      "priorConvictions",
      "otherPendingCases",
      "multipleOffences",
      "currentChargesVerifiedAt",
      "punishmentBasis",
      "investigationEvents",
    ],
  ],
  [
    "Confirmed legal review dates",
    [
      "confirmedReviews",
      "firstEvidenceDate",
      "custodyThroughoutEvidence",
      "recordedCourtException",
    ],
  ],
  [
    "Bail and actual release",
    [
      "bailGrantedAt",
      "bailOrderCommunicatedAt",
      "bondsFurnishedAt",
      "releaseConfirmedAt",
      "nonReleaseReason",
      "dlsaInformedAt",
      "otherDetentionBarrier",
      "bailApplications",
    ],
  ],
  ["Financial-support procedure", ["scheme"]],
  ["UTRC follow-up", ["utrc"]],
  [
    "Planned review",
    ["nextHearingState", "nextPlannedReviewAt", "attendanceUnconfirmedHearingIds"],
  ],
];
export function WorkflowTab({ caseId }: { caseId: string }) {
  const q = useQuery({
    queryKey: ["workflow", caseId],
    queryFn: () => api.get<WorkflowResponse>("/workflows/case/" + caseId),
  });
  const p = useQuery({
    queryKey: ["queue-policy"],
    queryFn: () => api.get<PolicyInfo>("/queue-policy"),
  });
  const owners = useQuery({
    queryKey: ["workflow-owners"],
    queryFn: () => api.get<{ id: string; fullName: string; role: string }[]>("/workflows/owners"),
  });
  const hearings = useQuery({
    queryKey: ["case-hearings", caseId],
    queryFn: () => api.get<HearingDto[]>("/cases/" + caseId + "/hearings"),
  });
  if (q.isLoading) return <LoadingBlock />;
  if (!q.data) return <ErrorBlock message="Could not load workflow evidence." />;
  const choices: Choices = {
    profileId: (p.data?.data.profiles ?? []).map((x) => ({
      value: x.id,
      label: x.name + " v" + x.version,
    })),
    legalProfileId: (p.data?.data.profiles ?? []).map((x) => ({
      value: x.id,
      label: x.name + " v" + x.version,
    })),
    sourceId: Object.entries(p.data?.data.sources ?? {}).map(([value, x]) => ({
      value,
      label: x.title,
    })),
    ownerId: (owners.data?.data ?? [])
      .filter((x) => x.role === "ADMIN" || x.id === q.data.data.caseOwnerId)
      .map((x) => ({ value: x.id, label: x.fullName })),
    hearingId: (hearings.data?.data ?? []).map((x) => ({
      value: x.id,
      label:
        x.hearingType +
        " · " +
        new Date(x.scheduledDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
    })),
    attendanceUnconfirmedHearingIds: (hearings.data?.data ?? []).map((x) => ({
      value: x.id,
      label:
        x.hearingType +
        " · " +
        new Date(x.scheduledDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
    })),
    parentKey: q.data.data.actions
      .filter((x) => !["RESOLVED", "CANCELLED"].includes(x.status))
      .map((x) => ({ value: x.key, label: x.title })),
  };
  return (
    <WorkflowEditor
      key={q.data.data.revision}
      caseId={caseId}
      initial={q.data.data}
      choices={choices}
    />
  );
}
function newActionForm(): unknown {
  return {
    ...(emptyForm(ActionCreateSchema) as object),
    type: "A16",
    anchorReference: "follow-up",
    origin: "TEAM_TARGET",
    confidence: "REPORTED",
    sourceId: "TEAM",
    retainedAfterClosure: false,
  };
}
function WorkflowEditor({
  caseId,
  initial,
  choices,
}: {
  caseId: string;
  initial: WorkflowResponse;
  choices: Choices;
}) {
  const { can } = useAuth(),
    client = useQueryClient();
  const editable = can("RECORD_CASE_ACTIVITY");
  const [facts, setFacts] = useState(initial.facts),
    [reason, setReason] = useState(""),
    [create, setCreate] = useState(false);
  const [action, setAction] = useState<unknown>(newActionForm);
  const refresh = () => {
    void client.invalidateQueries();
  };
  const save = useMutation({
    mutationFn: () =>
      api.put("/workflows/case/" + caseId, {
        expectedRevision: initial.revision,
        facts: WorkflowFactsSchema.parse(facts),
        changeReason: reason,
      }),
    onSuccess: refresh,
  });
  const add = useMutation({
    mutationFn: () =>
      api.post("/workflows/case/" + caseId + "/actions", ActionCreateSchema.parse(action)),
    onSuccess: () => {
      setCreate(false);
      setAction(newActionForm());
      refresh();
    },
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <h2 className="font-semibold">Workflow evidence</h2>
          <p className="mt-1 text-xs text-slate-500">
            Record actual events separately. Unknown facts stay unknown. Legal review dates require
            a reviewed source profile and human confirmation; automatic entitlement calculations are
            disabled.
          </p>
          {initial.error && (
            <p role="alert" className="text-red-700">
              {initial.error}
            </p>
          )}
        </CardContent>
      </Card>
      {groups.map(([title, only]) => (
        <details
          key={title}
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
          open={title === "Representation and communication"}
        >
          <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
          <div className="mt-4">
            <SchemaFields
              schema={WorkflowFactsSchema}
              value={facts}
              onChange={(v) => setFacts(v as WorkflowFacts)}
              choices={choices}
              only={only}
              disabled={!editable}
            />
          </div>
        </details>
      ))}
      {editable && (
        <Card>
          <CardContent className="space-y-3">
            <label className="block text-xs">
              Reason for recording / correcting facts
              <input
                aria-label="Workflow change reason"
                className={fieldClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {save.isError && (
              <p role="alert" className="text-sm text-red-700">
                {save.error.message}
              </p>
            )}
            <Button
              onClick={() => save.mutate()}
              isLoading={save.isPending}
              disabled={!reason.trim()}
            >
              Save evidence and update queue
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Action episodes</h2>
            {editable && (
              <Button variant="secondary" onClick={() => setCreate(!create)}>
                Record additional action
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Generated work resolves when its source evidence changes. Acknowledgement keeps the
            action open. Closed episodes are retained below.
          </p>
          {create && (
            <div className="space-y-3 rounded border p-4">
              <SchemaFields
                schema={ActionCreateSchema}
                value={action}
                onChange={setAction}
                choices={choices}
              />
              {add.isError && (
                <p role="alert" className="text-sm text-red-700">
                  {add.error.message}
                </p>
              )}
              <Button onClick={() => add.mutate()} isLoading={add.isPending}>
                Create action
              </Button>
            </div>
          )}
          {initial.actions.map((a) => (
            <details
              key={a.id}
              className="rounded border border-slate-100 p-3 dark:border-slate-800"
            >
              <summary className="cursor-pointer text-sm">
                {a.type} · {a.title} · {a.status}
              </summary>
              <p className="my-2 text-xs text-slate-500">{a.evidence}</p>
              <p className="text-xs text-slate-500">
                Owner:{" "}
                {a.ownerId
                  ? (choices.ownerId?.find((o) => o.value === a.ownerId)?.label ??
                    "Recorded owner unavailable")
                  : "Unallocated"}
              </p>
              {a.resolutionEvidence && (
                <p className="mt-1 text-xs">Latest status evidence: {a.resolutionEvidence}</p>
              )}
              {a.resolvedAt && (
                <p className="mt-1 text-xs text-slate-500">Closed {formatDateTime(a.resolvedAt)}</p>
              )}
              {a.nextReviewAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Next response review {formatDateTime(a.nextReviewAt)}
                </p>
              )}
              {editable && !["RESOLVED", "CANCELLED"].includes(a.status) && (
                <ActionControls
                  caseId={caseId}
                  action={a}
                  refresh={refresh}
                  owners={choices.ownerId ?? []}
                />
              )}
            </details>
          ))}
          {!initial.actions.length && (
            <p className="text-sm text-slate-500">
              No action episodes recorded yet. Re-evaluate the case to derive work.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function ActionControls({
  caseId,
  action: a,
  refresh,
  owners,
}: {
  caseId: string;
  action: ActionRow;
  refresh: () => void;
  owners: Choice[];
}) {
  const { can } = useAuth();
  const [status, setStatus] = useState("ACKNOWLEDGED"),
    [evidence, setEvidence] = useState(""),
    [next, setNext] = useState(""),
    [urgency, setUrgency] = useState<PriorityLevel>("U1"),
    [expiry, setExpiry] = useState("");
  const [owner, setOwner] = useState(a.ownerId ?? "");
  const assign = useMutation({
    mutationFn: () =>
      api.post("/workflows/case/" + caseId + "/actions/" + a.id + "/assign", {
        expectedRevision: a.revision,
        ownerId: owner || null,
        reason: evidence,
      }),
    onSuccess: refresh,
  });
  const change = useMutation({
    mutationFn: () =>
      api.patch("/workflows/case/" + caseId + "/actions/" + a.id, {
        expectedRevision: a.revision,
        status,
        evidence,
        nextReviewAt: fromLocalInput(next),
      }),
    onSuccess: refresh,
  });
  const override = useMutation({
    mutationFn: () =>
      api.post("/workflows/case/" + caseId + "/actions/" + a.id + "/override", {
        expectedRevision: a.revision,
        urgency,
        reason: evidence,
        expiresAt: fromLocalInput(expiry),
      }),
    onSuccess: refresh,
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          Action status
          <select
            aria-label="Action status"
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {(a.generated && (a.type !== "A11" || !(a.sourceKey ?? a.key).startsWith("production:"))
              ? ["OPEN", "ACKNOWLEDGED", "BLOCKED"]
              : ["OPEN", "ACKNOWLEDGED", "BLOCKED", "RESOLVED", "CANCELLED"]
            ).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-2">
          Evidence / reason
          <input
            className={fieldClass}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Next review (India time)
          <input
            type="datetime-local"
            className={fieldClass}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
      </div>
      <Button
        size="sm"
        disabled={!evidence.trim()}
        isLoading={change.isPending}
        onClick={() => change.mutate()}
      >
        Record status
      </Button>
      {change.isError && (
        <p role="alert" className="text-xs text-red-700">
          {change.error.message}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="text-xs">
          Accountable action owner
          <select
            aria-label="Action owner"
            className={fieldClass}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Unallocated</option>
            {owners.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={!evidence.trim()}
          isLoading={assign.isPending}
          onClick={() => assign.mutate()}
        >
          Assign owner
        </Button>
      </div>
      {assign.isError && (
        <p role="alert" className="text-xs text-red-700">
          {assign.error.message}
        </p>
      )}
      {can("CONFIGURE_RULES") && (
        <details>
          <summary className="cursor-pointer text-xs">Coordinator ordering override</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select
              aria-label="Override urgency"
              className={fieldClass}
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as PriorityLevel)}
            >
              {["U0", "U1", "U2", "U3"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <input
              aria-label="Override expiry India time"
              type="datetime-local"
              className={fieldClass}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!evidence.trim() || !expiry}
              isLoading={override.isPending}
              onClick={() => override.mutate()}
            >
              Record override
            </Button>
          </div>
          {override.isError && (
            <p role="alert" className="text-xs text-red-700">
              {override.error.message}
            </p>
          )}
        </details>
      )}
    </div>
  );
}

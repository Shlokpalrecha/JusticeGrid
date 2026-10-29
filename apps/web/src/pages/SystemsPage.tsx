import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { fieldClass } from "../components/WorkflowForm";
interface RecordRow {
  id: string;
  kind: string;
  name: string;
  jurisdiction: string;
  reference: string;
  eventDate: string | null;
  caseId: string | null;
  revision: number;
  outgoing: { leftId: string; rightId: string; disposition: string; revision: number }[];
  incoming: { leftId: string; rightId: string; disposition: string; revision: number }[];
}
interface Candidate {
  id: string;
  distance: number;
  sameReference: boolean;
  record: RecordRow;
}
interface Match {
  status: string;
  examined: number;
  overflow: boolean;
  matches: Candidate[];
  index?: { records: number; blocks: number; postings: number };
}
interface Graph {
  id: string;
  revision: number;
  nodes: { key: string; title: string; status: string; completionEvidence: string | null }[];
  edges: { fromKey: string; toKey: string }[];
  analysis: {
    order: string[];
    layers: string[][];
    ready: string[];
    blocked: string[];
    predecessors: Record<string, string[]>;
  };
}
const DEFAULT_GRAPH = {
  nodes: [
    { key: "Evidence_Discovery", title: "Evidence discovery" },
    { key: "Pre_Trial_Motion_Hearing", title: "Pre-trial motion hearing" },
    { key: "Trial_Docketing", title: "Trial docketing" },
  ],
  edges: [
    { from: "Evidence_Discovery", to: "Trial_Docketing" },
    { from: "Pre_Trial_Motion_Hearing", to: "Trial_Docketing" },
  ],
};
function JsonResult({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-3 text-xs dark:bg-slate-900">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-700">
      {error.message}
    </p>
  ) : null;
}
export function SystemsPage() {
  const { can } = useAuth(),
    [params] = useSearchParams(),
    [view, setView] = useState(params.get("caseId") ? "workflow" : "identity");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Systems workbench</h1>
        <p className="mt-1 text-sm text-slate-500">
          Deterministic identity resolution, runtime expression compilation and
          dependency-controlled case work. Synthetic records only.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["identity", "rules", "workflow", ...(can("CONFIGURE_RULES") ? ["ledger"] : [])].map(
          (v) => (
            <Button
              key={v}
              variant={v === view ? "primary" : "secondary"}
              onClick={() => setView(v)}
            >
              {v[0]!.toUpperCase() + v.slice(1)}
            </Button>
          ),
        )}
      </div>
      {view === "identity" ? (
        <IdentityPanel />
      ) : view === "rules" ? (
        <ParserPanel />
      ) : view === "workflow" ? (
        <GraphPanel initialCaseId={params.get("caseId") ?? ""} />
      ) : (
        <LedgerPanel />
      )}
    </div>
  );
}
function IdentityPanel() {
  const { can } = useAuth(),
    client = useQueryClient(),
    [kind, setKind] = useState("FILING"),
    [name, setName] = useState(""),
    [jurisdiction, setJurisdiction] = useState(""),
    [reference, setReference] = useState(""),
    [linkedCaseId, setLinkedCaseId] = useState(""),
    [date, setDate] = useState(""),
    [reason, setReason] = useState(""),
    [selected, setSelected] = useState<RecordRow | null>(null),
    [other, setOther] = useState(""),
    [disposition, setDisposition] = useState("LINK"),
    [result, setResult] = useState<Match | null>(null);
  const records = useQuery({
    queryKey: ["systems-records"],
    queryFn: () => api.get<RecordRow[]>("/systems/records"),
  });
  const body = () => ({
    kind,
    name,
    jurisdiction,
    reference,
    eventDate: date || null,
    caseId: linkedCaseId || null,
  });
  const match = useMutation({
    mutationFn: () => api.post<Match>("/systems/identity/match", body()),
    onSuccess: (r) => setResult(r.data),
  });
  const save = useMutation({
    mutationFn: () =>
      selected
        ? api.put("/systems/records/" + selected.id, {
            expectedRevision: selected.revision,
            record: body(),
            reason,
          })
        : api.post<{ results: { record: RecordRow; candidates: Match }[] }>(
            "/systems/identity/ingest",
            { records: [body()], reason },
          ),
    onSuccess: () => {
      setSelected(null);
      void client.invalidateQueries({ queryKey: ["systems-records"] });
      setResult(null);
    },
  });
  const relation = selected
    ? [...selected.outgoing, ...selected.incoming].find(
        (r) => r.leftId === other || r.rightId === other,
      )
    : undefined;
  const decide = useMutation({
    mutationFn: () =>
      api.post("/systems/identity/decisions", {
        leftId: selected?.id,
        rightId: other,
        expectedRevision: relation?.revision ?? -1,
        disposition,
        reason,
      }),
    onSuccess: () => {
      setSelected(null);
      void client.invalidateQueries({ queryKey: ["systems-records"] });
    },
  });
  const choose = (r: RecordRow) => {
    setSelected(r);
    setKind(r.kind);
    setName(r.name);
    setJurisdiction(r.jurisdiction);
    setReference(r.reference);
    setDate(r.eventDate ?? "");
    setLinkedCaseId(r.caseId ?? "");
    setOther("");
    setReason("");
    setResult(null);
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">
            {selected ? "Review or correct record" : "Stream a synthetic record"}
          </h2>
          <p className="text-xs text-slate-500">
            Names are routed through Soundex inverted blocks and bounded edit distance. Similarity
            produces review candidates and never automatically merges identities. Overflow means
            unresolved ambiguity.
          </p>
          <label className="block text-xs">
            Record kind
            <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {["FILING", "PERSON", "EVIDENCE"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {[
            ["Name / filing label", name, setName],
            ["Jurisdiction", jurisdiction, setJurisdiction],
            ["Evidence / filing reference", reference, setReference],
            ["Linked case ID (optional)", linkedCaseId, setLinkedCaseId],
          ].map(([label, value, set]) => (
            <label key={String(label)} className="block text-xs">
              {String(label)}
              <input
                className={fieldClass}
                maxLength={160}
                value={String(value)}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
            </label>
          ))}
          <label className="block text-xs">
            Event date
            <input
              className={fieldClass}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            Review / correction reason
            <input
              className={fieldClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => match.mutate()}
              disabled={!name || !jurisdiction}
              isLoading={match.isPending}
            >
              Find candidates
            </Button>
            {can("RECORD_CASE_ACTIVITY") && (
              <Button
                onClick={() => save.mutate()}
                disabled={!name || !jurisdiction || !reason}
                isLoading={save.isPending}
              >
                {selected ? "Save correction" : "Ingest record"}
              </Button>
            )}
            {selected && (
              <Button variant="secondary" onClick={() => setSelected(null)}>
                New record
              </Button>
            )}
          </div>
          <ErrorMessage error={match.error} />
          <ErrorMessage error={save.error} />
          {result && (
            <>
              <p className="text-sm">
                {result.status} · {result.examined} candidates examined
              </p>
              {result.overflow && (
                <p role="alert" className="text-amber-700">
                  Candidate cap reached. Narrow the identity evidence before deciding uniqueness.
                </p>
              )}
              {result.matches.map((m) => (
                <p className="text-sm" key={m.id}>
                  {m.record.name} · {m.record.reference} · bounded edit distance{" "}
                  {m.distance > 3 ? ">3" : m.distance}
                  {m.sameReference ? " · exact reference" : ""}
                </p>
              ))}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Recent records</h2>
          <ErrorMessage error={records.error} />
          {records.data?.data.map((r) => (
            <button
              className="block w-full rounded border p-2 text-left text-sm"
              key={r.id}
              onClick={() => choose(r)}
            >
              {r.name} · {r.kind}
              <span className="block text-xs text-slate-500">
                {r.jurisdiction} · {r.reference} · revision {r.revision}
              </span>
            </button>
          ))}
          {selected && can("RECORD_CASE_ACTIVITY") && (
            <div className="space-y-3 border-t pt-3">
              <h3 className="font-medium">Reviewed identity relationship</h3>
              <select
                aria-label="Related identity record"
                className={fieldClass}
                value={other}
                onChange={(e) => setOther(e.target.value)}
              >
                <option value="">Choose another record</option>
                {records.data?.data
                  .filter((r) => r.id !== selected.id && r.kind === selected.kind)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.reference}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Identity decision"
                className={fieldClass}
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
              >
                {["LINK", "DISTINCT", "SPLIT"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <p className="text-xs">
                Current relationship: {relation?.disposition ?? "Not reviewed"}. Splitting removes a
                reviewed link; both source records and history remain.
              </p>
              <Button
                onClick={() => decide.mutate()}
                disabled={!other || !reason}
                isLoading={decide.isPending}
              >
                Record decision
              </Button>
              <ErrorMessage error={decide.error} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function ParserPanel() {
  const { can } = useAuth(),
    [expression, setExpression] = useState("Statutory_Deadline_Days <= 3 AND NOT Bail_Eligibility"),
    [context, setContext] = useState('{"Statutory_Deadline_Days":2,"Bail_Eligibility":null}');
  const compile = useMutation({
    mutationFn: () =>
      api.post("/systems/rules/compile", { expression, context: JSON.parse(context) as unknown }),
  });
  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="font-semibold">Expression compiler</h2>
        <p className="text-sm text-slate-500">
          AND, OR, NOT, comparisons, arithmetic, MIN/MAX/FLOOR/ABS and parentheses. Unknown evidence
          stays unknown. Track 4's Bail_Eligibility field is a recorded human input, never an
          automated legal finding. Publish queue rules in Queue Policy.
        </p>
        <label className="block text-xs">
          Raw expression
          <textarea
            className={fieldClass}
            rows={3}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
          />
        </label>
        <label className="block text-xs">
          Typed input facts (JSON)
          <textarea
            className={fieldClass}
            rows={5}
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </label>
        {can("CONFIGURE_RULES") && (
          <Button onClick={() => compile.mutate()} isLoading={compile.isPending}>
            Compile and explain AST
          </Button>
        )}
        <ErrorMessage error={compile.error} />
        {compile.data && <JsonResult value={compile.data.data} />}
      </CardContent>
    </Card>
  );
}
function GraphPanel({ initialCaseId }: { initialCaseId: string }) {
  const { can } = useAuth(),
    client = useQueryClient(),
    [caseId, setCaseId] = useState(initialCaseId),
    [configuration, setConfiguration] = useState(JSON.stringify(DEFAULT_GRAPH, null, 2)),
    [reason, setReason] = useState("");
  const cases = useQuery({
    queryKey: ["systems-cases"],
    queryFn: () => api.get<{ id: string; caseRef: string }[]>("/cases", { pageSize: 100 }),
  });
  const graph = useQuery({
    queryKey: ["systems-graph", caseId],
    queryFn: () => api.get<Graph | null>("/systems/graphs/case/" + caseId),
    enabled: !!caseId,
  });
  const evidence = useQuery({
    queryKey: ["systems-rule-evidence", caseId],
    queryFn: () =>
      api.get<{
        revision: number;
        offenseSeverityIndex: number | null;
        bailEligibility: boolean | null;
        basis: string;
      } | null>("/systems/rule-evidence/case/" + caseId),
    enabled: !!caseId,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["systems-graph", caseId] });
    void client.invalidateQueries({ queryKey: ["priority-queue"] });
  };
  const save = useMutation({
    mutationFn: () =>
      api.put("/systems/graphs/case/" + caseId, {
        ...(JSON.parse(configuration) as object),
        expectedRevision: graph.data?.data?.revision ?? -1,
        reason,
      }),
    onSuccess: refresh,
  });
  const transition = useMutation({
    mutationFn: ({ key, status }: { key: string; status: string }) =>
      api.patch("/systems/graphs/case/" + caseId + "/nodes/" + key, {
        expectedRevision: graph.data?.data?.revision,
        status,
        evidence: reason,
      }),
    onSuccess: refresh,
  });
  const [severity, setSeverity] = useState(""),
    [bail, setBail] = useState("UNKNOWN");
  const saveEvidence = useMutation({
    mutationFn: () =>
      api.put("/systems/rule-evidence/case/" + caseId, {
        expectedRevision: evidence.data?.data?.revision ?? -1,
        offenseSeverityIndex: severity === "" ? null : Number(severity),
        bailEligibility: bail === "UNKNOWN" ? null : bail === "TRUE",
        basis: reason,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["systems-rule-evidence", caseId] });
    },
  });
  const current = graph.data?.data;
  return (
    <div className="space-y-4">
      <label className="block text-xs">
        Case
        <select
          className={fieldClass}
          value={caseId}
          onChange={(e) => {
            setCaseId(e.target.value);
            setSeverity("");
            setBail("UNKNOWN");
            setReason("");
            setConfiguration(JSON.stringify(DEFAULT_GRAPH, null, 2));
          }}
        >
          <option value="">Select a case</option>
          {cases.data?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseRef}
            </option>
          ))}
        </select>
      </label>
      {caseId && (
        <>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-semibold">Workflow dependency graph</h2>
              <p className="text-sm text-slate-500">
                An edge goes from prerequisite to dependant. Every prerequisite must complete. DFS
                rejects cycles; topological layers identify parallel work.
              </p>
              <label className="block text-xs">
                Transition evidence / configuration reason
                <input
                  className={fieldClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {current && (
                <>
                  <p className="text-xs">
                    Graph revision {current.revision} · Topological order:{" "}
                    {current.analysis.order.join(" → ")}
                  </p>
                  {current.analysis.layers.map((layer, i) => (
                    <div key={i} className="flex flex-wrap gap-2 rounded border p-3">
                      <span className="text-xs text-slate-500">Layer {i + 1}</span>
                      {layer.map((key) => {
                        const node = current.nodes.find((n) => n.key === key)!;
                        const ready = current.analysis.ready.includes(key);
                        return (
                          <div
                            key={key}
                            className="rounded bg-slate-100 p-3 text-sm dark:bg-slate-900"
                          >
                            <strong>{node.title}</strong>
                            <p className="text-xs">
                              {node.status === "DONE"
                                ? "Completed"
                                : ready
                                  ? "Ready"
                                  : "Blocked by prerequisites"}
                            </p>
                            {node.completionEvidence && (
                              <p className="text-xs">{node.completionEvidence}</p>
                            )}
                            {can("RECORD_CASE_ACTIVITY") && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={
                                  !reason ||
                                  transition.isPending ||
                                  (node.status !== "DONE" && !ready)
                                }
                                onClick={() =>
                                  transition.mutate({
                                    key,
                                    status: node.status === "DONE" ? "OPEN" : "DONE",
                                  })
                                }
                              >
                                {node.status === "DONE" ? "Reopen" : "Complete"}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
              {can("RECORD_CASE_ACTIVITY") && (
                <details>
                  <summary className="cursor-pointer text-sm">
                    Configure nodes and dependencies
                  </summary>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setConfiguration(
                        JSON.stringify(
                          current
                            ? {
                                nodes: current.nodes.map((n) => ({ key: n.key, title: n.title })),
                                edges: current.edges.map((e) => ({ from: e.fromKey, to: e.toKey })),
                              }
                            : DEFAULT_GRAPH,
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    Load current configuration
                  </Button>
                  <textarea
                    aria-label="Workflow DAG configuration"
                    className={fieldClass + " mt-3 font-mono"}
                    rows={15}
                    value={configuration}
                    onChange={(e) => setConfiguration(e.target.value)}
                  />
                  <Button
                    disabled={!reason}
                    onClick={() => save.mutate()}
                    isLoading={save.isPending}
                  >
                    Validate and save graph
                  </Button>
                </details>
              )}
              <ErrorMessage error={graph.error} />
              <ErrorMessage error={save.error} />
              <ErrorMessage error={transition.error} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-semibold">Human-reviewed Track 4 rule inputs</h2>
              <p className="text-xs">Current recorded evidence</p>
              <JsonResult value={evidence.data?.data ?? "Not confirmed"} />
              {can("RECORD_CASE_ACTIVITY") && (
                <>
                  <label className="block text-xs">
                    Offense severity index (0–10; blank means unknown)
                    <input
                      className={fieldClass}
                      type="number"
                      min={0}
                      max={10}
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs">
                    Recorded bail eligibility input
                    <select
                      className={fieldClass}
                      value={bail}
                      onChange={(e) => setBail(e.target.value)}
                    >
                      {["UNKNOWN", "TRUE", "FALSE"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={!reason}
                    onClick={() => saveEvidence.mutate()}
                    isLoading={saveEvidence.isPending}
                  >
                    Record with review basis
                  </Button>
                </>
              )}
              <ErrorMessage error={saveEvidence.error} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
function LedgerPanel() {
  const ledger = useQuery({
      queryKey: ["systems-ledger"],
      queryFn: () => api.get<unknown[]>("/systems/ledger"),
    }),
    verify = useMutation({ mutationFn: () => api.get("/systems/ledger/verify") }),
    status = useQuery({ queryKey: ["systems-status"], queryFn: () => api.get("/systems/status") });
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Append-only Activity_Log</h2>
          <p className="text-xs text-slate-500">
            User, timestamp, action, old/new snapshots and a serialized hash chain. Database
            triggers reject updates and deletes. Conflicts and rejected cycles are recorded
            separately from rolled-back writes.
          </p>
          <Button onClick={() => verify.mutate()} isLoading={verify.isPending}>
            Verify ledger integrity
          </Button>
          <ErrorMessage error={verify.error} />
          {verify.data && <JsonResult value={verify.data.data} />}
          <JsonResult value={ledger.data?.data ?? []} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="font-semibold">Runtime structures</h2>
          <JsonResult value={status.data?.data ?? "Loading"} />
        </CardContent>
      </Card>
    </div>
  );
}

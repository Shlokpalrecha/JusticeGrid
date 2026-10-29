import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PolicySchema, ProfileCreateSchema } from "@justicegrid/shared";
import type { z } from "zod";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { LoadingBlock, ErrorBlock } from "../components/ui/Feedback";
import { SchemaFields, emptyForm, fieldClass } from "../components/WorkflowForm";
import { formatDateTime } from "../lib/format";
type Policy = z.infer<typeof PolicySchema>;
interface PolicyInfo {
  active: { version: number; config: Policy };
  history: { id: string; version: number; changeReason: string; createdAt: string }[];
  profiles: { id: string; name: string; version: number; verificationNotes: string }[];
  sources: Record<string, { title: string; url: string | null }>;
  catalog: [string, string, string][];
  calculatorMode: string;
}
interface Simulation {
  before: { caseId: string; priorityLevel: string }[];
  after: { caseId: string; priorityLevel: string }[];
  changed: {
    caseId: string;
    caseRef: string;
    beforeRank: number;
    afterRank: number;
    beforeUrgency: string;
    afterUrgency: string;
    beforeSupport: number;
    afterSupport: number;
  }[];
}
export function QueuePolicyPage() {
  const q = useQuery({
    queryKey: ["queue-policy"],
    queryFn: () => api.get<PolicyInfo>("/queue-policy"),
  });
  if (q.isLoading) return <LoadingBlock />;
  if (!q.data) return <ErrorBlock message="Could not load queue policy." />;
  return <PolicyEditor key={q.data.data.active.version} info={q.data.data} />;
}
function PolicyEditor({ info }: { info: PolicyInfo }) {
  const { can } = useAuth(),
    client = useQueryClient(),
    editable = can("CONFIGURE_RULES");
  const [config, setConfig] = useState<unknown>(info.active.config),
    [reason, setReason] = useState(""),
    [simulated, setSimulated] = useState("");
  const [ruleText, setRuleText] = useState(
    JSON.stringify(info.active.config.textRules ?? [], null, 2),
  );
  const [appliedRuleText, setAppliedRuleText] = useState(ruleText);
  const rulesDirty = ruleText !== appliedRuleText;
  const [ruleError, setRuleError] = useState("");
  const [profile, setProfile] = useState<unknown>(() => emptyForm(ProfileCreateSchema));
  const refresh = () => {
    void client.invalidateQueries();
  };
  const simulation = useMutation({
    mutationFn: (candidate: unknown) =>
      api.post<Simulation>("/queue-policy/simulate", { config: PolicySchema.parse(candidate) }),
    onSuccess: (_data, candidate) => setSimulated(JSON.stringify(candidate)),
  });
  const publish = useMutation({
    mutationFn: () =>
      api.post("/queue-policy/publish", {
        expectedVersion: info.active.version,
        config: PolicySchema.parse(config),
        changeReason: reason,
      }),
    onSuccess: refresh,
  });
  const rollback = useMutation({
    mutationFn: (version: number) =>
      api.post("/queue-policy/rollback/" + version, {
        expectedVersion: info.active.version,
        changeReason: reason,
      }),
    onSuccess: refresh,
  });
  const addProfile = useMutation({
    mutationFn: () => api.post("/queue-policy/profiles", ProfileCreateSchema.parse(profile)),
    onSuccess: refresh,
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Queue policy and sources</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active policy v{info.active.version}. Urgency and deadlines precede support weights. All
          weights and look-ahead windows are prototype team policy.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-semibold">Ranking configuration</h2>
          <SchemaFields
            schema={PolicySchema}
            only={[
              "immediateHours",
              "sensitiveHours",
              "routineDays",
              "hearingNearDays",
              "hearingWeekDays",
              "agingStepDays",
              "weights",
            ]}
            value={config}
            onChange={(v) => {
              setConfig(v);
              setSimulated("");
            }}
            disabled={!editable}
          />
          <details>
            <summary className="cursor-pointer font-medium">
              Runtime text rules (custom lexer → typed AST)
            </summary>
            <p className="my-2 text-xs text-slate-500">
              Each rule has an id, raw when expression, urgency or component/value, and optional
              dependsOn rule IDs. Apply this text, simulate, then publish. Cyclic rule dependencies
              and invalid types are rejected. Protected legal/referral safeguards remain enforced.
            </p>
            <textarea
              aria-label="Runtime rule definitions"
              className={fieldClass + " font-mono"}
              rows={18}
              value={ruleText}
              disabled={!editable}
              onChange={(e) => {
                setRuleText(e.target.value);
                setSimulated("");
              }}
            />
            {editable && (
              <Button
                variant="secondary"
                onClick={() => {
                  try {
                    const next = PolicySchema.parse({
                      ...(config as object),
                      textRules: JSON.parse(ruleText) as unknown,
                    });
                    setConfig(next);
                    setAppliedRuleText(ruleText);
                    setSimulated("");
                    setRuleError("");
                  } catch (error) {
                    setRuleError(error instanceof Error ? error.message : "Invalid program");
                  }
                }}
              >
                Apply rule text to candidate
              </Button>
            )}
            {ruleError && (
              <p role="alert" className="text-red-700">
                {ruleError}
              </p>
            )}
            {rulesDirty && (
              <p role="status" className="text-sm text-amber-700">
                Apply the edited rule text before simulating or publishing.
              </p>
            )}
          </details>
          {editable && (
            <>
              <label className="block text-xs">
                Publication / rollback reason
                <input
                  aria-label="Policy change reason"
                  className={fieldClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  disabled={rulesDirty}
                  onClick={() => simulation.mutate(config)}
                  isLoading={simulation.isPending}
                >
                  Simulate all cases
                </Button>
                <Button
                  disabled={rulesDirty || !reason.trim() || simulated !== JSON.stringify(config)}
                  onClick={() => publish.mutate()}
                  isLoading={publish.isPending}
                >
                  Publish complete policy snapshot
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Publishing re-evaluates every case in one transaction. Any failure leaves the
                previous version active.
              </p>
            </>
          )}
          {[simulation.error, publish.error, rollback.error].filter(Boolean).map((e, i) => (
            <p key={i} role="alert" className="text-sm text-red-700">
              {e?.message}
            </p>
          ))}
        </CardContent>
      </Card>
      {simulation.data && (
        <Card>
          <CardContent>
            <h2 className="mb-2 font-semibold">Simulation result</h2>
            <p className="text-sm">
              {simulation.data.data.before.length} current cases;{" "}
              {simulation.data.data.after.length} candidate cases;{" "}
              {simulation.data.data.changed.length} rank, urgency or support changes.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Current rank / urgency / support</th>
                    <th>Candidate rank / urgency / support</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.data.data.changed.map((c) => (
                    <tr key={c.caseId}>
                      <td className="py-2">{c.caseRef}</td>
                      <td>
                        {c.beforeRank} / {c.beforeUrgency} / {c.beforeSupport}
                      </td>
                      <td>
                        {c.afterRank} / {c.afterUrgency} / {c.afterSupport}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Policy history</h2>
          {info.history.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"
            >
              <div>
                v{p.version} · {p.changeReason}
                <p className="text-xs text-slate-400">{formatDateTime(p.createdAt)}</p>
              </div>
              {editable && p.version !== info.active.version && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!reason.trim()}
                  onClick={() => rollback.mutate(p.version)}
                >
                  Restore as a new version
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Reviewed applicability profiles</h2>
          <p className="text-xs text-slate-500">
            Confirmed review dates only. Profile records document a human source/applicability
            check; they do not activate automatic bail or release calculations.
          </p>
          {info.profiles.map((p) => (
            <p key={p.id} className="text-sm">
              {p.name} v{p.version} — {p.verificationNotes}
            </p>
          ))}
          {editable && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Record a new source profile version
              </summary>
              <div className="mt-3 space-y-3">
                <SchemaFields
                  schema={ProfileCreateSchema}
                  value={profile}
                  onChange={setProfile}
                  choices={{
                    sourceId: Object.entries(info.sources)
                      .filter(([id]) => id !== "TEAM")
                      .map(([value, s]) => ({ value, label: s.title })),
                    supersedesId: info.profiles.map((p) => ({
                      value: p.id,
                      label: p.name + " v" + p.version,
                    })),
                  }}
                />
                <Button onClick={() => addProfile.mutate()} isLoading={addProfile.isPending}>
                  Record source review
                </Button>
                {addProfile.isError && (
                  <p role="alert" className="text-sm text-red-700">
                    {addProfile.error.message}
                  </p>
                )}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-3 font-semibold">Action catalog and source register</h2>
          <ul className="space-y-2 text-sm">
            {info.catalog.map(([id, title, source]) => (
              <li key={id}>
                <strong>{id}</strong> · {title} ·{" "}
                {info.sources[source]?.url ? (
                  <a
                    className="text-xs underline"
                    href={info.sources[source].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {info.sources[source].title}
                  </a>
                ) : (
                  <span className="text-xs text-slate-500">Team target</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

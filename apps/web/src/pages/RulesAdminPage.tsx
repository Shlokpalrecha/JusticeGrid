import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, Save } from "lucide-react";
import type { RuleDto, RuleSimulateResponse, RulesetConfigDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { LoadingBlock, ErrorBlock } from "../components/ui/Feedback";
import { titleCase } from "../lib/format";

export function RulesAdminPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = can("CONFIGURE_RULES");

  const rulesQuery = useQuery({ queryKey: ["rules"], queryFn: () => api.get<RuleDto[]>("/rules") });
  const configQuery = useQuery({
    queryKey: ["rules-config"],
    queryFn: () => api.get<RulesetConfigDto>("/rules/config"),
  });

  const [overrides, setOverrides] = useState<
    Record<string, { weight?: number; isEnabled?: boolean }>
  >({});
  const [simResult, setSimResult] = useState<RuleSimulateResponse | null>(null);

  const simulateMutation = useMutation({
    mutationFn: () =>
      api.post<RuleSimulateResponse>("/rules/simulate", {
        ruleOverrides: Object.entries(overrides).map(([ruleId, o]) => ({ ruleId, ...o })),
        topN: 10,
      }),
    onSuccess: (res) => setSimResult(res.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.post(`/rules/${id}/toggle`, { isEnabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const saveWeightMutation = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      api.patch(`/rules/${id}`, { weight, changeReason: "Adjusted via Rules Admin UI" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const recomputeAllMutation = useMutation({
    mutationFn: () => api.post<{ recomputedCount: number }>("/rules/recompute-all"),
  });

  function setOverride(ruleId: string, patch: { weight?: number; isEnabled?: boolean }) {
    setOverrides((prev) => ({ ...prev, [ruleId]: { ...prev[ruleId], ...patch } }));
  }

  if (rulesQuery.isLoading || configQuery.isLoading)
    return <LoadingBlock label="Loading ruleset..." />;
  if (rulesQuery.isError || configQuery.isError)
    return <ErrorBlock message="Could not load the ruleset." />;

  const rules = rulesQuery.data?.data ?? [];
  const config = configQuery.data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rules Admin</h1>
          <p className="text-sm text-slate-500">
            The deterministic ruleset — v{config?.version}, thresholds {config?.mediumThreshold}/
            {config?.highThreshold} (MEDIUM/HIGH). {!isAdmin && "Read-only for your role."}
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="secondary"
            onClick={() => recomputeAllMutation.mutate()}
            isLoading={recomputeAllMutation.isPending}
          >
            <RefreshCw className="h-4 w-4" /> Recompute all cases
          </Button>
        )}
      </div>
      {recomputeAllMutation.data && (
        <p className="text-xs text-green-700 dark:text-green-400">
          Recomputed {recomputeAllMutation.data.data.recomputedCount} case(s).
        </p>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-2.5">Code</th>
              <th className="px-2 py-2.5">Name</th>
              <th className="px-2 py-2.5">Category</th>
              <th className="px-2 py-2.5">Weight</th>
              <th className="px-2 py-2.5">Enabled</th>
              {isAdmin && <th className="px-2 py-2.5">Simulate override</th>}
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {rule.code}
                </td>
                <td className="px-2 py-2.5 text-slate-800 dark:text-slate-200">{rule.name}</td>
                <td className="px-2 py-2.5">
                  <Badge>{titleCase(rule.category)}</Badge>
                </td>
                <td className="px-2 py-2.5">
                  {isAdmin ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        defaultValue={rule.weight}
                        className="h-7 w-14 rounded border border-slate-300 px-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        onBlur={(e) => {
                          const w = Number(e.target.value);
                          if (w !== rule.weight)
                            saveWeightMutation.mutate({ id: rule.id, weight: w });
                        }}
                      />
                    </div>
                  ) : (
                    <span className="font-mono">{rule.weight}</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  {isAdmin ? (
                    <button
                      onClick={() =>
                        toggleMutation.mutate({ id: rule.id, isEnabled: !rule.isEnabled })
                      }
                      className={
                        rule.isEnabled
                          ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800"
                      }
                    >
                      {rule.isEnabled ? "On" : "Off"}
                    </button>
                  ) : (
                    <Badge>{rule.isEnabled ? "On" : "Off"}</Badge>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder={String(rule.weight)}
                        className="h-7 w-16 rounded border border-slate-300 px-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        onChange={(e) =>
                          setOverride(rule.id, {
                            weight: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          defaultChecked={rule.isEnabled}
                          onChange={(e) => setOverride(rule.id, { isEnabled: e.target.checked })}
                        />
                        On
                      </label>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Simulate a candidate ruleset — preview only, nothing is persisted</CardTitle>
            <Button
              onClick={() => simulateMutation.mutate()}
              isLoading={simulateMutation.isPending}
            >
              <Play className="h-4 w-4" /> Run simulation
            </Button>
          </CardHeader>
          <CardContent>
            {!simResult && (
              <p className="text-sm text-slate-500">
                Adjust weights/enabled above, then run the simulation to preview the effect before
                saving.
              </p>
            )}
            {simResult && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SimSnapshot title="Before" snapshot={simResult.before} />
                <SimSnapshot title="After" snapshot={simResult.after} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1 text-xs text-slate-400">
        <Save className="h-3 w-3" /> Weight changes and toggles save immediately and trigger a full
        recompute (spec §6.7).
      </p>
    </div>
  );
}

function SimSnapshot({
  title,
  snapshot,
}: {
  title: string;
  snapshot: RuleSimulateResponse["before"];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mb-3 flex gap-3 text-xs">
        <span className="text-red-600">HIGH: {snapshot.distribution.HIGH}</span>
        <span className="text-amber-600">MEDIUM: {snapshot.distribution.MEDIUM}</span>
        <span className="text-green-600">ROUTINE: {snapshot.distribution.ROUTINE}</span>
      </div>
      <ul className="space-y-1 text-sm">
        {snapshot.topCases.map((c) => (
          <li key={c.caseId} className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300">{c.caseRef}</span>
            <span className="font-mono text-slate-500">{c.totalScore}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

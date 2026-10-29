import {
  compileExpression,
  evaluateExpression,
  type Context,
  type Fields,
  type Ast,
  type Value,
} from "./expression.js";
import { analyzeDag } from "./graph.js";
import type { Urgency } from "../workflowTypes.js";
export interface TextRule {
  id: string;
  when: string;
  urgency?: Urgency;
  component?: "H" | "A" | "B" | "D" | "F";
  value?: string;
  dependsOn?: string[];
}
export const RULE_FIELDS: Fields = Object.freeze(
  Object.fromEntries([
    ...["Type", "Origin", "Confidence", "Blocker", "Representation", "Status"].map((k) => [
      k,
      "string",
    ]),
    ...[
      "Immediate",
      "Critical",
      "Forthwith",
      "Critical_Data_Missing",
      "Ordinary_Data_Missing",
      "Has_Owner",
      "Counsel_Accepted",
      "Communication_Blocked",
      "Interpreter_Needed",
      "Attendance_Unconfirmed",
      "Nonproduction",
    ].map((k) => [k, "boolean"]),
    ...[
      "Hours_To_Deadline",
      "Hearing_Days",
      "Waiting_Days",
      "Immediate_Hours",
      "Sensitive_Hours",
      "Routine_Days",
      "Hearing_Near_Days",
      "Hearing_Week_Days",
      "Aging_Step_Days",
      "Weight_Hearing_Near",
      "Weight_Hearing_Week",
      "Weight_Attendance",
      "Weight_Access",
      "Weight_Communication",
      "Weight_Blocker",
      "Weight_Ordinary_Blocker",
      "Weight_Critical_Data",
      "Weight_Ordinary_Data",
      "Weight_Aging",
      "Statutory_Deadline_Days",
      "Offense_Severity_Index",
    ].map((k) => [k, "number"]),
    ["Bail_Eligibility", "boolean"],
  ]) as Record<string, "string" | "number" | "boolean">,
);
/** These are data, not executable language snippets. Administrators publish replacements. */
export const DEFAULT_TEXT_RULES: readonly TextRule[] = Object.freeze([
  {
    id: "immediate",
    when: "Immediate OR (Critical AND (Hours_To_Deadline <= Immediate_Hours OR Forthwith))",
    urgency: "U0",
  },
  {
    id: "sensitive",
    when: '(Critical AND Hours_To_Deadline <= Sensitive_Hours) OR Type = "A01" OR Type = "A04" OR Critical_Data_Missing OR (Origin = "NATIONAL_PROCEDURE" AND Hours_To_Deadline <= Sensitive_Hours) OR Nonproduction OR (Type = "A10" AND Hours_To_Deadline <= Sensitive_Hours)',
    urgency: "U1",
  },
  {
    id: "followup",
    when: 'Hours_To_Deadline <= Routine_Days * 24 OR Blocker != "NONE" OR Status = "BLOCKED" OR Ordinary_Data_Missing OR Type = "A15"',
    urgency: "U2",
  },
  {
    id: "near_hearing",
    when: 'Type = "A10" AND Hearing_Days >= 0 AND Hearing_Days <= Hearing_Near_Days',
    component: "H",
    value: "Weight_Hearing_Near",
  },
  {
    id: "week_hearing",
    when: 'Type = "A10" AND Hearing_Days >= 0 AND Hearing_Days <= Hearing_Week_Days',
    component: "H",
    value: "Weight_Hearing_Week",
  },
  {
    id: "attendance",
    when: 'Type = "A10" AND Hearing_Days >= 0 AND Attendance_Unconfirmed',
    component: "H",
    value: "Weight_Attendance",
  },
  {
    id: "access",
    when: '(Type = "A03" OR Type = "A04" OR Type = "A10") AND (Representation = "UNKNOWN" OR Representation = "NONE" OR Representation = "REQUESTED" OR NOT Counsel_Accepted)',
    component: "A",
    value: "Weight_Access",
  },
  {
    id: "communication",
    when: '(Type = "A03" OR Type = "A04" OR Type = "A10") AND (Communication_Blocked OR Interpreter_Needed)',
    component: "A",
    value: "Weight_Communication",
  },
  {
    id: "necessary_blocker",
    when: 'Blocker = "NECESSARY" OR NOT Has_Owner',
    component: "B",
    value: "Weight_Blocker",
  },
  {
    id: "ordinary_blocker",
    when: 'Blocker = "ORDINARY" OR Status = "BLOCKED"',
    component: "B",
    value: "Weight_Ordinary_Blocker",
  },
  {
    id: "critical_data",
    when: "Critical_Data_Missing",
    component: "D",
    value: "Weight_Critical_Data",
  },
  {
    id: "ordinary_data",
    when: "Ordinary_Data_Missing",
    component: "D",
    value: "Weight_Ordinary_Data",
  },
  {
    id: "waiting",
    when: "TRUE",
    component: "F",
    value: "MIN(Weight_Aging, MAX(0, FLOOR(Waiting_Days / Aging_Step_Days)))",
  },
]);
export interface CompiledRule {
  definition: TextRule;
  condition: Ast;
  value: Ast | null;
}
const programs = new Map<string, readonly CompiledRule[]>();
export function compileRules(definitions: readonly TextRule[]): readonly CompiledRule[] {
  const key = JSON.stringify(definitions),
    cached = programs.get(key);
  if (cached) return cached;
  const program = compileUncached(definitions);
  if (programs.size >= 32) programs.delete(programs.keys().next().value!);
  programs.set(key, program);
  return program;
}
function compileUncached(definitions: readonly TextRule[]): readonly CompiledRule[] {
  if (!definitions.length || definitions.length > 128)
    throw new Error("A program needs 1–128 rules");
  const ids = definitions.map((r) => r.id);
  if (ids.some((id) => !/^[a-z][a-z0-9_]{0,63}$/.test(id)))
    throw new Error("Rule IDs must be lowercase identifiers");
  const fields: Fields = {
    ...RULE_FIELDS,
    ...Object.fromEntries(ids.map((id) => ["rule_" + id, "boolean" as const])),
  };
  const graph = analyzeDag(
    ids,
    definitions.flatMap((r) => (r.dependsOn ?? []).map((from) => ({ from, to: r.id }))),
  );
  const compiled = new Map(
    definitions.map((r) => {
      if ((r.component && !r.value) || (!r.component && r.value) || (!r.urgency && !r.component))
        throw new Error(`Rule ${r.id} needs urgency or a component/value`);
      const condition = compileExpression(r.when, fields),
        value = r.value ? compileExpression(r.value, fields, "number") : null;
      const visit = (a: Ast): void => {
        if (
          a.kind === "field" &&
          a.name.startsWith("rule_") &&
          !(r.dependsOn ?? []).includes(a.name.slice(5))
        )
          throw new Error(`Rule ${r.id} must declare dependency ${a.name.slice(5)}`);
        if (a.kind === "binary") {
          visit(a.left);
          visit(a.right);
        }
        if (a.kind === "unary") visit(a.child);
        if (a.kind === "call") a.args.forEach(visit);
      };
      visit(condition);
      if (value) visit(value);
      return [
        r.id,
        Object.freeze({
          definition: Object.freeze({
            ...r,
            dependsOn: Object.freeze([...(r.dependsOn ?? [])]),
          }) as TextRule,
          condition,
          value,
        }),
      ] as const;
    }),
  );
  return Object.freeze(graph.order.map((id) => compiled.get(id)!));
}
const CAPS = { H: 5, A: 4, B: 4, D: 4, F: 3 },
  RANK: Record<Urgency, number> = { U0: 0, U1: 1, U2: 2, U3: 3 };
export function runRules(program: readonly CompiledRule[], facts: Context) {
  const context: Record<string, Value> = { ...facts },
    components = { H: 0, A: 0, B: 0, D: 0, F: 0 },
    trace: { id: string; expression: string; result: boolean | null; value: number | null }[] = [];
  let urgency: Urgency = "U3";
  for (const rule of program) {
    const dependency = (rule.definition.dependsOn ?? []).every(
        (id) => context["rule_" + id] === true,
      ),
      result = dependency ? evaluateExpression(rule.condition, context) : false,
      matched = result === true;
    context["rule_" + rule.definition.id] = result === null ? null : matched;
    const numeric = matched && rule.value ? evaluateExpression(rule.value, context) : null,
      value = typeof numeric === "number" ? numeric : null;
    if (matched && rule.definition.urgency && RANK[rule.definition.urgency] < RANK[urgency])
      urgency = rule.definition.urgency;
    const family = rule.definition.component;
    if (family && value !== null)
      components[family] = Math.max(
        components[family],
        Math.min(CAPS[family], Math.max(0, Math.floor(value))),
      );
    trace.push({
      id: rule.definition.id,
      expression: rule.definition.when,
      result: result === null ? null : matched,
      value,
    });
  }
  return { urgency, components, trace };
}

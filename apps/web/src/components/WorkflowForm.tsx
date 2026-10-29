import { z } from "zod";
import type { ReactNode } from "react";
export type Choice = { value: string; label: string };
export type Choices = Record<string, Choice[]>;
export const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
export const fieldLabel = (name: string) =>
  ({
    sourceId: "Source document",
    ownerId: "Responsible owner",
    profileId: "Applicability profile",
    legalProfileId: "Applicable procedure profile",
    parentKey: "Parent action",
    hearingId: "Related hearing",
    personId: "Person",
    assignedToId: "Assigned owner",
    activatedAt: "Work first became actionable",
    ordinaryDataMissing: "Other fact needs verification",
    locator: "Source section or paragraph",
    forthwith: "Confirmed instruction to act forthwith",
    blocker: "Dependency importance",
    anchorReference: "Event reference",
    occurrenceId: "Occurrence reference",
    critical: "Confirmed critical legal/court action",
    confirmedBy: "Confirming reviewer",
    dueAt: "Review / action due time",
    precision: "Legal date precision",
    priorConvictions: "Verified prior convictions",
    otherPendingCases: "Verified other pending cases",
    multipleOffences: "Verified multiple offences",
    origin: "Deadline or target source",
    criticalDataMissing: "Critical fact needs verification",
    retainedAfterClosure: "Retain unresolved work after case closure",
  })[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
function unwrap(input: z.ZodTypeAny): z.ZodTypeAny {
  let s = input;
  while (
    s instanceof z.ZodDefault ||
    s instanceof z.ZodNullable ||
    s instanceof z.ZodOptional ||
    s instanceof z.ZodEffects
  ) {
    s = (
      s instanceof z.ZodDefault
        ? s.removeDefault()
        : s instanceof z.ZodEffects
          ? s.innerType()
          : s.unwrap()
    ) as z.ZodTypeAny;
  }
  return s;
}
export function emptyForm(schema: z.ZodTypeAny, key = ""): unknown {
  const parsed = schema.safeParse(undefined);
  if (parsed.success) return parsed.data as unknown;
  const s = unwrap(schema);
  if (s instanceof z.ZodObject)
    return Object.fromEntries(
      Object.entries(s.shape as Record<string, z.ZodTypeAny>).map(([k, v]) => [k, emptyForm(v, k)]),
    );
  if (s instanceof z.ZodArray) return [];
  if (s instanceof z.ZodEnum) return (s.options as string[])[0];
  if (s instanceof z.ZodBoolean) return false;
  if (s instanceof z.ZodNumber) return 1;
  if (
    s instanceof z.ZodString &&
    s._def.checks.some((c) => c.kind === "datetime") &&
    ["activatedAt", "confirmedAt", "verifiedAt"].includes(key)
  )
    return new Date().toISOString();
  return key === "id" || key === "occurrenceId"
    ? crypto.randomUUID()
    : key === "confirmedBy"
      ? "Recorded on save"
      : "";
}
export function toLocalInput(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 19800000).toISOString().slice(0, 16) : "";
}
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value + ":00+05:30").toISOString() : null;
}
export function SchemaFields({
  schema,
  value,
  onChange,
  choices = {},
  field = "",
  disabled = false,
  only,
}: {
  schema: z.ZodTypeAny;
  value: unknown;
  onChange: (value: unknown) => void;
  choices?: Choices;
  field?: string;
  disabled?: boolean;
  only?: string[];
}): ReactNode {
  const s = unwrap(schema);
  if (s instanceof z.ZodObject) {
    const v = (value ?? {}) as Record<string, unknown>;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(s.shape as Record<string, z.ZodTypeAny>)
          .filter(
            ([k]) =>
              !["id", "occurrenceId", "confirmedBy", "invalidatedReason"].includes(k) &&
              (!only || only.includes(k)),
          )
          .map(([k, child]) => (
            <div
              key={k}
              className={
                unwrap(child) instanceof z.ZodObject || unwrap(child) instanceof z.ZodArray
                  ? "sm:col-span-2"
                  : ""
              }
            >
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                {fieldLabel(k)}
              </label>
              <SchemaFields
                schema={child}
                value={v[k]}
                onChange={(next) => onChange({ ...v, [k]: next })}
                choices={choices}
                field={k}
                disabled={disabled}
              />
            </div>
          ))}
      </div>
    );
  }
  if (s instanceof z.ZodArray) {
    const rows: unknown[] = Array.isArray(value) ? (value as unknown[]) : [];
    return (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={typeof row === "object" && row && "id" in row ? String(row.id) : index}
            className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800"
          >
            <SchemaFields
              schema={s.element as z.ZodTypeAny}
              value={row}
              onChange={(next) => onChange(rows.map((v, i) => (i === index ? next : v)))}
              choices={choices}
              field={field}
              disabled={disabled}
            />
            {!disabled && (
              <button
                type="button"
                className="text-xs text-red-700"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                Remove this record
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-xs"
            onClick={() => onChange([...rows, emptyForm(s.element as z.ZodTypeAny)])}
          >
            Add {fieldLabel(field).toLowerCase()} record
          </button>
        )}
        {!rows.length && <p className="text-xs text-slate-400">No records entered.</p>}
      </div>
    );
  }
  if (s instanceof z.ZodBoolean)
    return (
      <input
        aria-label={fieldLabel(field)}
        type="checkbox"
        checked={value === true}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    );
  const opts: Choice[] | null =
    choices[field] ??
    (s instanceof z.ZodEnum
      ? (s.options as string[]).map((v: string) => ({ value: v, label: v.replaceAll("_", " ") }))
      : null);
  if (opts)
    return (
      <select
        aria-label={fieldLabel(field)}
        className={fieldClass}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Select / unknown</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  const datetime = s instanceof z.ZodString && s._def.checks.some((c) => c.kind === "datetime");
  if (datetime)
    return (
      <div>
        <input
          aria-label={fieldLabel(field)}
          type="datetime-local"
          className={fieldClass}
          disabled={disabled}
          value={toLocalInput(value)}
          onChange={(e) => onChange(fromLocalInput(e.target.value))}
        />
        <span className="text-[10px] text-slate-400">India time (UTC+05:30)</span>
      </div>
    );
  if (s instanceof z.ZodNumber)
    return (
      <input
        aria-label={fieldLabel(field)}
        type="number"
        className={fieldClass}
        disabled={disabled}
        value={typeof value === "number" ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  return (
    <input
      aria-label={fieldLabel(field)}
      className={fieldClass}
      disabled={disabled}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || (schema.isNullable() ? null : ""))}
    />
  );
}

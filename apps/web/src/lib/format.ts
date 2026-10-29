import { formatDistanceToNow, isPast } from "date-fns";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** "in 2 days" / "3 days ago" — spec §9's priority queue relative
 * hearing display. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return isPast(date) ? `${formatDistanceToNow(date)} ago` : `in ${formatDistanceToNow(date)}`;
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const PRIORITY_LABEL: Record<string, string> = {
  U0: "Immediate attention",
  U1: "Time-sensitive review",
  U2: "Follow-up needed",
  U3: "Scheduled/routine",
};
export function priorityLabel(level: string | null | undefined): string {
  return level ? (PRIORITY_LABEL[level] ?? level) : "Not evaluated";
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

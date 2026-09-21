import { AlertTriangle, CircleDot, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/cn";
import { priorityLabel } from "../../lib/format";

const STYLES: Record<string, { className: string; Icon: typeof AlertTriangle }> = {
  HIGH: {
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
    Icon: AlertTriangle,
  },
  MEDIUM: {
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    Icon: CircleDot,
  },
  ROUTINE: {
    className:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900",
    Icon: ShieldCheck,
  },
};

export function PriorityBadge({
  level,
  className,
}: {
  level: string | null | undefined;
  className?: string;
}) {
  const style = level ? STYLES[level] : undefined;
  if (!style) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
          className,
        )}
      >
        Not evaluated
      </span>
    );
  }
  const { className: colorClass, Icon } = style;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        colorClass,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {priorityLabel(level)}
    </span>
  );
}

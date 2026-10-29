import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, Briefcase, CalendarClock, ListChecks } from "lucide-react";
import type {
  PriorityDistribution,
  PriorityQueueItemDto,
  TaskListItemDto,
  UpcomingHearingRow,
} from "@justicegrid/shared";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { LoadingBlock } from "../components/ui/Feedback";
import { formatRelative } from "../lib/format";

const COLORS = { U2: "#2563eb", U0: "#dc2626", U1: "#d97706", U3: "#16a34a" };

export function DashboardPage() {
  const { user, can } = useAuth();

  const distributionQuery = useQuery({
    queryKey: ["priority-distribution"],
    queryFn: () => api.get<PriorityDistribution>("/priority/distribution"),
    enabled: can("VIEW_FULL_PRIORITY_QUEUE"),
  });

  const queueQuery = useQuery({
    queryKey: ["priority-queue", "top5"],
    queryFn: () =>
      api.get<PriorityQueueItemDto[]>("/priority/queue", {
        page: 1,
        pageSize: 5,
      }),
    enabled: can("VIEW_FULL_PRIORITY_QUEUE"),
  });

  const myTasksQuery = useQuery({
    queryKey: ["tasks", "my-queue"],
    queryFn: () => api.get<TaskListItemDto[]>("/tasks/my-queue"),
  });

  const hearingsQuery = useQuery({
    queryKey: ["reports", "upcoming-hearings", 7],
    queryFn: () => api.get<UpcomingHearingRow[]>("/reports/upcoming-hearings", { days: 7 }),
    enabled: can("EXPORT_REPORTS"),
  });

  const dist = distributionQuery.data?.data;
  const total = dist ? dist.U0 + dist.U1 + dist.U2 + dist.U3 : 0;
  const openTasks = (myTasksQuery.data?.data ?? []).filter(
    (t) => t.status !== "COMPLETED" && t.status !== "CANCELLED",
  );
  const overdueTasks = openTasks.filter((t) => new Date(t.dueDate) < new Date());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Welcome, {user?.fullName}
        </h1>
        <p className="text-sm text-slate-500">
          {user?.role.replace("_", " ")} · JusticeGrid workflow overview
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Briefcase} label="Cases in view" value={total || "—"} />
        <StatCard
          icon={AlertTriangle}
          label="Immediate attention"
          value={dist?.U0 ?? "—"}
          accent="text-red-600"
        />
        <StatCard
          icon={ListChecks}
          label="My open tasks"
          value={openTasks.length}
          accent={overdueTasks.length > 0 ? "text-red-600" : undefined}
        />
        <StatCard
          icon={CalendarClock}
          label="Hearings in 7 days"
          value={hearingsQuery.data?.data.length ?? "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {can("VIEW_FULL_PRIORITY_QUEUE") && (
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Priority distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {distributionQuery.isLoading ? (
                <LoadingBlock />
              ) : dist ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Immediate", value: dist.U0, key: "U0" },
                          { name: "Time-sensitive", value: dist.U1, key: "U1" },
                          { name: "Follow-up", value: dist.U2, key: "U2" },
                          { name: "Scheduled", value: dist.U3, key: "U3" },
                        ]}
                        dataKey="value"
                        innerRadius={35}
                        outerRadius={65}
                        paddingAngle={2}
                      >
                        {["U0", "U1", "U2", "U3"].map((key) => (
                          <Cell key={key} fill={COLORS[key as keyof typeof COLORS]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 text-sm">
                    <LegendRow color={COLORS.U0} label="Immediate" value={dist.U0} />
                    <LegendRow color={COLORS.U1} label="Time-sensitive" value={dist.U1} />
                    <LegendRow color={COLORS.U2} label="Follow-up" value={dist.U2} />
                    <LegendRow color={COLORS.U3} label="Scheduled" value={dist.U3} />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {can("VIEW_FULL_PRIORITY_QUEUE") && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Next cases to review</CardTitle>
              <Link
                to="/priority"
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                View full queue →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {queueQuery.isLoading ? (
                <LoadingBlock />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(queueQuery.data?.data ?? []).map((item) => (
                    <li
                      key={item.caseId}
                      className="flex items-center justify-between px-5 py-3 text-sm"
                    >
                      <div>
                        <Link
                          to={`/cases/${item.caseId}`}
                          className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                        >
                          {item.caseRef}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {item.personAlias} · {item.evaluation.actions.length} reason(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.nextHearingDate && (
                          <span className="text-xs text-slate-500">
                            {formatRelative(item.nextHearingDate)}
                          </span>
                        )}
                        <PriorityBadge level={item.evaluation.priorityLevel} />
                      </div>
                    </li>
                  ))}
                  {(queueQuery.data?.data ?? []).length === 0 && (
                    <li className="px-5 py-8 text-center text-sm text-slate-400">
                      No cases requiring review.
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My open tasks</CardTitle>
          <Link
            to="/tasks"
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            View all →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {myTasksQuery.isLoading ? (
            <LoadingBlock />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {openTasks.slice(0, 6).map((task) => (
                <li key={task.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <Link
                      to={`/cases/${task.caseId}`}
                      className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-slate-500">{task.caseRef}</p>
                  </div>
                  <span
                    className={
                      new Date(task.dueDate) < new Date()
                        ? "text-xs font-medium text-red-600"
                        : "text-xs text-slate-500"
                    }
                  >
                    {formatRelative(task.dueDate)}
                  </span>
                </li>
              ))}
              {openTasks.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-slate-400">No open tasks. 🎉</li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Briefcase;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Icon className={"h-5 w-5 " + (accent ?? "text-slate-600 dark:text-slate-400")} />
        </div>
        <div>
          <p
            className={"text-xl font-semibold " + (accent ?? "text-slate-900 dark:text-slate-100")}
          >
            {value}
          </p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="ml-auto font-mono font-medium text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

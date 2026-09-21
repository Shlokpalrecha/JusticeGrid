import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import type { TaskListItemDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/Feedback";
import { cn } from "../lib/cn";
import { formatRelative, titleCase } from "../lib/format";

export function MyTasksPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tasks", "my-queue"],
    queryFn: () => api.get<TaskListItemDto[]>("/tasks/my-queue"),
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/complete`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  if (isLoading) return <LoadingBlock label="Loading your tasks..." />;
  if (isError) return <ErrorBlock message="Could not load your tasks." />;

  const tasks = data?.data ?? [];
  const open = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const done = tasks.filter((t) => t.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">My Tasks</h1>
        <p className="text-sm text-slate-500">Every task assigned to you, across every case.</p>
      </div>

      {open.length === 0 ? (
        <Card>
          <EmptyState title="No open tasks" description="You're all caught up." />
        </Card>
      ) : (
        <div className="space-y-2">
          {open
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
            .map((task) => {
              const overdue = new Date(task.dueDate) < new Date();
              return (
                <Card key={task.id}>
                  <CardContent className="flex items-center justify-between gap-4">
                    <div>
                      <Link
                        to={`/cases/${task.caseId}`}
                        className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                      >
                        {task.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {task.caseRef} · {titleCase(task.category)}
                        {task.isPreparationTask && " · Preparation task"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "text-xs",
                          overdue ? "font-medium text-red-600" : "text-slate-500",
                        )}
                      >
                        Due {formatRelative(task.dueDate)}
                      </span>
                      <Badge
                        className={
                          task.status === "BLOCKED"
                            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                            : undefined
                        }
                      >
                        {titleCase(task.status)}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => completeMutation.mutate(task.id)}
                        isLoading={
                          completeMutation.isPending && completeMutation.variables === task.id
                        }
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Completed ({done.length})
          </p>
          <div className="space-y-2 opacity-70">
            {done.map((task) => (
              <Card key={task.id}>
                <CardContent className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 line-through dark:text-slate-400">
                    {task.title}
                  </span>
                  <span className="text-xs text-slate-500">{task.caseRef}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

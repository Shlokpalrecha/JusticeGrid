import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import type { NotificationDto } from "@justicegrid/shared";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDistanceStrict } from "date-fns";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () =>
      api.get<{ items: NotificationDto[]; unreadCount: number }>("/notifications", { pageSize: 8 }),
    refetchInterval: 30_000,
  });

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markAllRead() {
    await api.post("/notifications/read-all");
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const items = data?.data.items ?? [];
  const unreadCount = data?.data.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-400">
                  No notifications yet.
                </p>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && void markRead(n.id)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-slate-50 px-3 py-2.5 text-left text-xs last:border-0 dark:border-slate-800/50",
                    n.isRead ? "opacity-60" : "bg-slate-50 dark:bg-slate-800/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      n.isRead ? "bg-transparent" : "bg-blue-500",
                    )}
                  />
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800 dark:text-slate-200">
                      {n.title}
                    </span>
                    <span className="block text-slate-500">{n.body}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {formatDistanceStrict(new Date(n.createdAt), new Date(), { addSuffix: true })}
                    </span>
                  </span>
                  {n.isRead && <Check className="mt-0.5 h-3 w-3 shrink-0 text-slate-300" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

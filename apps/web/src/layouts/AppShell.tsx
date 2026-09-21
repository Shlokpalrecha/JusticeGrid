import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  FileText,
  Gauge,
  Info,
  ListChecks,
  LogOut,
  Menu,
  Scale,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/cn";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import { NotificationsBell } from "../components/NotificationsBell";
import { initials } from "../lib/format";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  show: boolean;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, can, canUnscoped } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  if (!user) return null;

  const navItems: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: Gauge, show: true },
    {
      to: "/priority",
      label: "Priority Queue",
      icon: BarChart3,
      show: can("VIEW_FULL_PRIORITY_QUEUE"),
    },
    { to: "/cases", label: "Cases", icon: Briefcase, show: can("VIEW_ANY_CASE") },
    { to: "/tasks", label: "My Tasks", icon: ListChecks, show: true },
    { to: "/rules", label: "Rules", icon: Scale, show: true },
    { to: "/reports", label: "Reports", icon: FileText, show: can("EXPORT_REPORTS") },
    { to: "/audit", label: "Audit Log", icon: ScrollText, show: canUnscoped("VIEW_AUDIT_LOG") },
    { to: "/limitations", label: "Limitations", icon: Info, show: true },
  ];

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBanner />
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-60 -translate-x-full border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-950 lg:static lg:translate-x-0",
            mobileOpen && "translate-x-0",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">JusticeGrid</span>
            </div>
            <button
              className="lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5 p-3">
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900",
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </aside>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main column */}
        <div className="flex flex-1 flex-col lg:pl-0">
          <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
            <button
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <form onSubmit={handleSearchSubmit} className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cases, persons, tasks..."
                className="h-9 w-full rounded-md border border-slate-300 bg-slate-50 pl-8 pr-3 text-sm focus:border-slate-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:bg-slate-900"
              />
            </form>
            <div className="ml-auto flex items-center gap-3">
              <NotificationsBell />
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {initials(user.fullName)}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    {user.fullName}
                  </p>
                  <p className="text-[10px] text-slate-500">{user.role.replace("_", " ")}</p>
                </div>
              </div>
              <button
                onClick={() => void logout()}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 bg-slate-50 p-6 dark:bg-slate-950">{children}</main>
        </div>
      </div>
    </div>
  );
}

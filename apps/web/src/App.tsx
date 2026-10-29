import {SystemsPage} from "./pages/SystemsPage";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { queryClient } from "./lib/queryClient";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PriorityQueuePage } from "./pages/PriorityQueuePage";
import { CasesListPage } from "./pages/CasesListPage";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { MyTasksPage } from "./pages/MyTasksPage";
import { QueuePolicyPage } from "./pages/QueuePolicyPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { SearchResultsPage } from "./pages/SearchResultsPage";
import { LimitationsPage } from "./pages/LimitationsPage";

/**
 * JusticeGrid — explainable legal-aid workflow prioritization prototype.
 * Synthetic data only; a review aid, never a legal or judicial decision.
 * See the persistent DisclaimerBanner (rendered in AppShell on every
 * authenticated route, and standalone on /login) and /limitations for
 * the full guardrail framing (spec §1).
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/priority" element={<PriorityQueuePage />} />
              <Route path="/cases" element={<CasesListPage />} />
              <Route path="/cases/:id" element={<CaseDetailPage />} />
              <Route path="/tasks" element={<MyTasksPage />} />
              <Route path="/systems" element={<SystemsPage/>}/>
              <Route path="/queue-policy" element={<QueuePolicyPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/audit" element={<AuditLogPage />} />
              <Route path="/search" element={<SearchResultsPage />} />
              <Route path="/limitations" element={<LimitationsPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

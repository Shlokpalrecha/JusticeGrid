import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Scale } from "lucide-react";
import { useAuth, isApiError } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { DisclaimerBanner } from "../components/DisclaimerBanner";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(isApiError(err) ? err.message : "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBanner />
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-100">
              <Scale className="h-6 w-6 text-white dark:text-slate-900" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              JusticeGrid
            </h1>
            <p className="text-sm text-slate-500">Legal-aid workflow prioritization — prototype</p>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@justicegrid.test"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Sign in
            </Button>
          </form>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-1 font-medium text-slate-600 dark:text-slate-400">
              Demo accounts (synthetic):
            </p>
            <p>admin@justicegrid.test / Admin@12345</p>
            <p>auditor@justicegrid.test / Auditor@12345</p>
            <p>lawyer1@justicegrid.test / Lawyer@12345</p>
          </div>
        </div>
      </div>
    </div>
  );
}

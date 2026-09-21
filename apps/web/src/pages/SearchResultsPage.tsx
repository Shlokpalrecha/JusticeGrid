import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SearchResponse } from "@justicegrid/shared";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { Badge } from "../components/ui/Badge";
import { LoadingBlock, ErrorBlock, EmptyState } from "../components/ui/Feedback";
import { formatDate, titleCase } from "../lib/format";

export function SearchResultsPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<SearchResponse>("/search", { q }),
    enabled: q.length > 0,
  });

  if (!q)
    return (
      <Card>
        <EmptyState title="Type something into the search bar" />
      </Card>
    );
  if (isLoading) return <LoadingBlock label={`Searching for "${q}"...`} />;
  if (isError) return <ErrorBlock message="Search failed." />;

  const result = data!.data;
  const totalResults = result.cases.length + result.persons.length + result.tasks.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Search results for "{q}"
        </h1>
        <p className="text-sm text-slate-500">
          {totalResults} result(s) across cases, persons, and tasks.
        </p>
      </div>

      {totalResults === 0 && (
        <Card>
          <EmptyState title="No results found" description="Try a different search term." />
        </Card>
      )}

      {result.cases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cases ({result.cases.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <Link
                      to={`/cases/${c.id}`}
                      className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                    >
                      {c.caseRef}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {c.personAlias} · {c.courtName} · {titleCase(c.caseStatus)}
                    </p>
                  </div>
                  <PriorityBadge level={c.priorityLevel} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.persons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Persons ({result.persons.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.persons.map((p) => (
                <li key={p.id} className="px-5 py-3 text-sm">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{p.displayName}</p>
                  <p className="text-xs text-slate-500">{p.aliasCode}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {result.tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tasks ({result.tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <Link
                      to={`/cases/${t.caseId}`}
                      className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                    >
                      {t.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {t.caseRef} · Due {formatDate(t.dueDate)}
                    </p>
                  </div>
                  <Badge>{titleCase(t.status)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

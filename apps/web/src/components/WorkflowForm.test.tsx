import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ActionCreateSchema, WorkflowFactsSchema } from "@justicegrid/shared";
import { SchemaFields, fromLocalInput, toLocalInput } from "./WorkflowForm";
import { WorkflowTab } from "./WorkflowTab";
import { api } from "../lib/api";

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("India-time evidence entry", () => {
  it("round-trips the selected local minute without depending on the host timezone", () => {
    expect(fromLocalInput("2026-10-30T10:00")).toBe("2026-10-30T04:30:00.000Z");
    expect(toLocalInput("2026-10-30T04:30:00Z")).toBe("2026-10-30T10:00");
    expect(fromLocalInput("")).toBeNull();
  });
  it("keeps controlled datetime entry and clearing in the form state", () => {
    function Form() {
      const [value, setValue] = useState<unknown>({ dueAt: null });
      return (
        <>
          <SchemaFields
            schema={z.object({ dueAt: z.string().datetime().nullable() })}
            value={value}
            onChange={setValue}
          />
          <output>{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Form />);
    fireEvent.change(screen.getByLabelText("Review / action due time"), {
      target: { value: "2026-10-30T10:00" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("2026-10-30T04:30:00.000Z");
    fireEvent.change(screen.getByLabelText("Review / action due time"), { target: { value: "" } });
    expect(screen.getByRole("status")).toHaveTextContent('"dueAt":null');
  });
  it("preserves UNKNOWN separately from a verified FALSE value", () => {
    function Form() {
      const [value, setValue] = useState<unknown>({ priorConvictions: "UNKNOWN" });
      return (
        <>
          <SchemaFields
            schema={z.object({ priorConvictions: z.enum(["TRUE", "FALSE", "UNKNOWN"]) })}
            value={value}
            onChange={setValue}
          />
          <output>{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Form />);
    expect(screen.getByLabelText("Verified prior convictions")).toHaveValue("UNKNOWN");
    fireEvent.change(screen.getByLabelText("Verified prior convictions"), {
      target: { value: "FALSE" },
    });
    expect(screen.getByRole("status")).toHaveTextContent('"priorConvictions":"FALSE"');
  });
});

describe("workflow action creation", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(<T,>(path: string) =>
      Promise.resolve({
        data: (path.includes("/workflows/case/")
          ? { facts: WorkflowFactsSchema.parse({}), revision: 0, error: null, actions: [] }
          : path === "/queue-policy"
            ? { profiles: [], sources: { TEAM: { title: "Team target" } } }
            : []) as T,
      }),
    );
    vi.mocked(api.post).mockResolvedValue({ data: { id: "synthetic-action" } });
  });
  it("uses a fresh occurrence for successive actions and sends entered deadline evidence", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkflowTab caseId="case" />
      </QueryClientProvider>,
    );
    for (const title of ["First synthetic action", "Second synthetic action"]) {
      fireEvent.click(await screen.findByRole("button", { name: "Record additional action" }));
      fireEvent.change(screen.getByLabelText("Title", { exact: true }), {
        target: { value: title },
      });
      fireEvent.change(screen.getByLabelText("Source section or paragraph", { exact: true }), {
        target: { value: "Team target" },
      });
      fireEvent.change(screen.getByLabelText("Evidence", { exact: true }), {
        target: { value: "Synthetic evidence" },
      });
      fireEvent.change(screen.getByLabelText("Review / action due time", { exact: true }), {
        target: { value: "2026-10-30T10:00" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create action" }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Create action" })).not.toBeInTheDocument(),
      );
    }
    const calls = vi.mocked(api.post).mock.calls;
    expect(calls).toHaveLength(2);
    const first = ActionCreateSchema.parse(calls[0]![1]),
      second = ActionCreateSchema.parse(calls[1]![1]);
    expect(first.occurrenceId).not.toBe(second.occurrenceId);
    expect(first.dueAt).toBe("2026-10-30T04:30:00.000Z");
    expect(second.title).toBe("Second synthetic action");
    client.clear();
  });
});

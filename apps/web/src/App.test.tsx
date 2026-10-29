import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App.js";

describe("App shell", () => {
  beforeEach(() => {
    // No session cookie in the test environment — the silent
    // refresh-on-load check (AuthContext) should fail closed and land
    // an unauthenticated visitor on /login, never hang on a loading
    // spinner or throw.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ success: false }) }),
    );
  });

  it("makes one initial refresh during StrictMode effect replay", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renders the login page (with its persistent disclaimer) for an unauthenticated visitor", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("JusticeGrid")).toBeInTheDocument());
    expect(screen.getByText(/Prototype — synthetic data only/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});

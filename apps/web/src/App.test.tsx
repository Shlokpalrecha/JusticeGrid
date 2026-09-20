import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App.js";

describe("App shell (Phase 0 wiring smoke test)", () => {
  it("renders the JusticeGrid title and prototype disclaimer", () => {
    render(<App />);
    expect(screen.getByText("JusticeGrid")).toBeInTheDocument();
    expect(screen.getByText(/Prototype — synthetic data only/)).toBeInTheDocument();
  });
});

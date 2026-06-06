/**
 * Tests for features/runs/RunSourceBadge (RH-3 — display API-key trigger source).
 *
 * `api_key` runs render "Triggered via API key · <prefix>" (or the safe
 * "Triggered via API key" when the prefix is null), with the prefix being the ONLY
 * key material shown — never the raw key or hash. Every other source keeps its
 * existing short uppercase pill unchanged.
 */
import { render, screen } from "@testing-library/react";
import { RunSourceBadge } from "@/features/runs/RunSourceBadge";

describe("RunSourceBadge — api_key", () => {
  it("renders 'Triggered via API key · <prefix>' when a prefix is present", () => {
    render(<RunSourceBadge triggeredBy="api_key" apiKeyPrefix="crk_live_ab12…wxyz" />);
    expect(screen.getByTestId("run-source-badge-api_key")).toHaveTextContent(
      "Triggered via API key · crk_live_ab12…wxyz",
    );
  });

  it("falls back to 'Triggered via API key' when the prefix is null", () => {
    render(<RunSourceBadge triggeredBy="api_key" apiKeyPrefix={null} />);
    const badge = screen.getByTestId("run-source-badge-api_key");
    expect(badge).toHaveTextContent("Triggered via API key");
    expect(badge.textContent).not.toContain("·");
  });

  it("falls back to 'Triggered via API key' when the prefix is omitted or blank", () => {
    render(<RunSourceBadge triggeredBy="api_key" apiKeyPrefix="   " />);
    expect(screen.getByTestId("run-source-badge-api_key")).toHaveTextContent(
      "Triggered via API key",
    );
  });

  it("never renders a raw key or key_hash", () => {
    render(<RunSourceBadge triggeredBy="api_key" apiKeyPrefix="crk_live_ab12…wxyz" />);
    const text = screen.getByTestId("run-source-badge-api_key").textContent ?? "";
    expect(text).not.toMatch(/key_?hash/i);
    // Only the non-secret prefix (which is itself a truncated display value).
    expect(text).not.toMatch(/crk_live_[A-Za-z0-9_-]{20,}/);
  });
});

describe("RunSourceBadge — other sources unchanged", () => {
  it.each([
    ["manual", "Manual"],
    ["test", "Test"],
    ["webhook", "Webhook"],
    ["scheduled", "Scheduled"],
    ["retry", "Retry"],
  ] as const)("renders the short pill for %s", (source, label) => {
    render(<RunSourceBadge triggeredBy={source} />);
    expect(screen.getByTestId(`run-source-badge-${source}`)).toHaveTextContent(label);
  });

  it("renders unknown as an em dash", () => {
    render(<RunSourceBadge triggeredBy="unknown" />);
    expect(screen.getByTestId("run-source-badge-unknown")).toHaveTextContent("—");
  });

  it("ignores apiKeyPrefix for non-api_key sources", () => {
    render(<RunSourceBadge triggeredBy="manual" apiKeyPrefix="crk_live_ab12…wxyz" />);
    const badge = screen.getByTestId("run-source-badge-manual");
    expect(badge).toHaveTextContent("Manual");
    expect(badge.textContent).not.toContain("crk_");
  });
});

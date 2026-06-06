/**
 * Tests for features/account/ApiDocsPanel (Slice 4.API-KEYS-DOCS-1) — the static
 * developer reference for the public API-key workflow trigger.
 *
 * Documentation only: it must show the real endpoint/header/curl/response/errors/
 * rate-limit/run-history/flag info WITHOUT exposing any real or fake key, key_hash,
 * or OAuth token, and without a per-key generated URL.
 */
import { render, screen, within } from "@testing-library/react";
import { ApiDocsPanel } from "@/features/account/ApiDocsPanel";

describe("ApiDocsPanel — content", () => {
  beforeEach(() => render(<ApiDocsPanel />));

  it("shows the endpoint path with a {workflowId} placeholder", () => {
    expect(screen.getByTestId("api-docs-endpoint")).toHaveTextContent(
      "POST /api/v1/workflows/{workflowId}/trigger",
    );
  });

  it("shows the Authorization bearer header format", () => {
    expect(screen.getByTestId("api-docs-auth")).toHaveTextContent(
      /Authorization:\s*Bearer\s+crk_live_\.\.\./i,
    );
  });

  it("shows a curl example that uses a placeholder key (no real key)", () => {
    const curl = screen.getByTestId("api-docs-curl");
    expect(curl).toHaveTextContent(/curl -X POST/i);
    expect(curl).toHaveTextContent("/api/v1/workflows/{workflowId}/trigger");
    expect(curl).toHaveTextContent("Bearer crk_live_...");
  });

  it("shows the 202 success response shape", () => {
    const res = screen.getByTestId("api-docs-response");
    expect(res).toHaveTextContent("202");
    expect(res).toHaveTextContent(/"ok":\s*true/);
    expect(res).toHaveTextContent(/runId/);
  });

  it("documents the supported scope workflows:trigger", () => {
    expect(screen.getByTestId("api-docs-panel")).toHaveTextContent("workflows:trigger");
  });

  it("mentions the one-time key reveal", () => {
    expect(screen.getByTestId("api-docs-reveal")).toHaveTextContent(/shown only once/i);
  });

  it("lists the common error statuses", () => {
    const errors = screen.getByTestId("api-docs-errors");
    for (const status of ["401", "403", "404", "409", "422", "429"]) {
      expect(within(errors).getByText(status)).toBeInTheDocument();
    }
  });

  it("explains rate limiting and the Retry-After header", () => {
    const rl = screen.getByTestId("api-docs-ratelimit");
    expect(rl).toHaveTextContent(/429/);
    expect(rl).toHaveTextContent(/Retry-After/i);
  });

  it("documents the run-history 'Triggered via API key' label", () => {
    expect(screen.getByTestId("api-docs-runlabel")).toHaveTextContent(/Triggered via API key/i);
  });

  it("includes the security note (no connected-app / OAuth token exposure)", () => {
    expect(screen.getByTestId("api-docs-security")).toHaveTextContent(
      /never expose your connected app or OAuth tokens/i,
    );
  });

  it("explains the public API is gated by the ENABLE_PUBLIC_API_KEYS server flag", () => {
    const flag = screen.getByTestId("api-docs-flag");
    expect(flag).toHaveTextContent("ENABLE_PUBLIC_API_KEYS");
    expect(flag).toHaveTextContent(/admin still needs to enable/i);
  });
});

describe("ApiDocsPanel — no-leak", () => {
  it("renders no real key, key_hash, OAuth token, or fake per-key URL", () => {
    render(<ApiDocsPanel />);
    const text = screen.getByTestId("api-docs-panel").textContent ?? "";
    // Only placeholder key material — never a full secret or hash.
    expect(text).not.toMatch(/crk_live_[A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/key_?hash/i);
    expect(text).not.toMatch(/sk_live|sk_test|access_token|refresh_token/i);
    // The endpoint stays a {workflowId} template — no concrete uuid baked in.
    expect(text).not.toMatch(/workflows\/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

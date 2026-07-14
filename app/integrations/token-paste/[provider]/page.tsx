"use client";

import { useState, use, type FormEvent } from "react";

/**
 * Client-side token-PASTE page (EDEN-3 — the `token_paste` auth variant).
 *
 * Unlike the token-INGEST page (which reads a token the provider put in the URL
 * fragment), providers using `token_paste` have no authorize redirect: the user
 * copies a personal access token from the provider's settings and PASTES it here.
 * The dispatcher's connect step minted a single-use `state` and redirected the
 * browser to:
 *     /integrations/token-paste/<provider>?state=<state>
 *
 * Lifecycle:
 *   1. Read `state` from the URL search params.
 *   2. User pastes the token into the form and submits.
 *   3. POST { state, token } to /api/integrations/oauth/<provider>/ingest
 *      (the SAME shared ingest endpoint the fragment flow uses).
 *   4. On 200 → navigate to `data.redirect`. On error → show the reason.
 *
 * Boundary rules (identical to the ingest page — enforced by
 * tests/structure/client-server-boundary.test.ts):
 *   - "use client"; NO imports from @/services, @/repositories, or any server-only module.
 *   - NO telemetry/analytics.
 *   - NEVER log the pasted token (no console, no error reporter). The token lives only
 *     in component state and the single POST body.
 */

interface PageProps {
  params: Promise<{ provider: string }>;
}

function readState(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("state");
}

function navigateTo(path: string): void {
  if (typeof window === "undefined") return;
  window.location.replace(path);
}

export default function TokenPastePage({ params }: PageProps) {
  const { provider } = use(params);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const state = readState();
    if (!state) {
      setError("This connection link is incomplete. Please start again from the Apps page.");
      return;
    }
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Paste your access token to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/integrations/oauth/${encodeURIComponent(provider)}/ingest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ state, token: trimmed }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { redirect?: string };
        // Clear the token from state before navigating away.
        setToken("");
        navigateTo(data.redirect ?? "/apps?integration=connected");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `Connection failed (${res.status}). Please try again.`);
      setSubmitting(false);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.25rem" }}>Connect your account</h1>
      <p style={{ color: "#555" }}>
        Paste the personal access token you created in the provider&apos;s settings. It is sent once
        to finish connecting and is stored encrypted — it is never shown again.
      </p>
      <form onSubmit={onSubmit} style={{ marginTop: "1rem" }}>
        <label htmlFor="token" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
          Access token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your token"
          disabled={submitting}
          style={{ width: "100%", padding: "0.5rem", fontFamily: "monospace" }}
        />
        {error ? (
          <p role="alert" style={{ color: "#b00020", marginTop: 8 }}>
            {error}
          </p>
        ) : null}
        <div style={{ marginTop: "1rem", display: "flex", gap: 8 }}>
          <button type="submit" disabled={submitting} style={{ padding: "0.5rem 1rem" }}>
            {submitting ? "Connecting…" : "Connect"}
          </button>
          <a href="/apps" style={{ padding: "0.5rem 1rem" }}>
            Cancel
          </a>
        </div>
      </form>
    </main>
  );
}

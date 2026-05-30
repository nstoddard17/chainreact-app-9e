"use client";

import { useEffect, useState, use } from "react";

/**
 * Client-side token-ingest page (Slice 17+).
 *
 * Lifecycle:
 *   1. Provider redirects browser here with token in URL fragment and
 *      state in the URL search params:
 *        /integrations/token-ingest/<provider>?state=<state>#token=<value>
 *   2. On mount, parse fragment into a key/value map.
 *   3. Immediately call history.replaceState to strip the fragment.
 *      Token removed from URL bar before any UI render or navigation.
 *   4. POST { state, token } to /api/integrations/oauth/<provider>/ingest.
 *   5. On 200, navigate to `data.redirect`.
 *   6. On error, navigate to /?integration_error=<reason>.
 *
 * Boundary rules:
 *   - "use client" — reads window.location, no SSR.
 *   - NO imports from @/services, @/repositories, or any server-only
 *     module. Enforced by tests/structure/client-server-boundary.test.ts.
 *   - NO telemetry / analytics — those capture window.location.href and
 *     would leak the fragment token if loaded before scrub.
 *   - NO logging of the captured token.
 */

interface PageProps {
  params: Promise<{ provider: string }>;
}

interface FragmentParts {
  token: string | null;
  raw: Record<string, string>;
}

function parseFragment(hash: string): FragmentParts {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const raw: Record<string, string> = {};
  if (!trimmed) return { token: null, raw };
  for (const piece of trimmed.split("&")) {
    if (!piece) continue;
    const idx = piece.indexOf("=");
    const key = idx === -1 ? piece : piece.slice(0, idx);
    const value = idx === -1 ? "" : piece.slice(idx + 1);
    try {
      raw[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      raw[key] = value;
    }
  }
  return { token: raw.token ?? null, raw };
}

function readState(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("state");
}

function scrubFragmentFromUrl(): void {
  if (typeof window === "undefined") return;
  const cleaned = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", cleaned);
}

function navigateTo(path: string): void {
  if (typeof window === "undefined") return;
  window.location.replace(path);
}

export default function TokenIngestPage({ params }: PageProps) {
  const { provider } = use(params);
  const [status, setStatus] = useState<"connecting" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (typeof window === "undefined") return;
      const fragment = parseFragment(window.location.hash);
      const state = readState();
      // Scrub fragment AFTER parsing but BEFORE the network call.
      scrubFragmentFromUrl();

      if (!state) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Connection link is incomplete. Try connecting again.");
          navigateTo(
            "/?integration_error=" + encodeURIComponent("missing_state"),
          );
        }
        return;
      }
      if (!fragment.token) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("No token returned from provider.");
          navigateTo(
            "/?integration_error=" + encodeURIComponent("missing_token"),
          );
        }
        return;
      }

      try {
        const res = await fetch(
          `/api/integrations/oauth/${encodeURIComponent(provider)}/ingest`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ state, token: fragment.token }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as { redirect?: string };
          navigateTo(data.redirect ?? "/?integration=connected");
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const reason = body.error ?? `ingest_failed_${res.status}`;
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(reason);
          navigateTo("/?integration_error=" + encodeURIComponent(reason));
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("network error");
          navigateTo(
            "/?integration_error=" + encodeURIComponent("network_error"),
          );
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  if (status === "error") {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>Connection failed</h1>
        <p>{errorMessage}</p>
        <p>
          <a href="/apps">Return to Apps</a>
        </p>
      </main>
    );
  }
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Connecting…</h1>
      <p>Finishing the connection. This should only take a moment.</p>
    </main>
  );
}

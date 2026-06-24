"use client";

import { useState } from "react";
import Link from "next/link";
import { anonSignupHref } from "./AnonymousLocalChrome";

/**
 * ANON-BUILDER-1/3 — left-rail React Agent surface for the LOCAL-ONLY builder
 * (`/start`, logged-out visitors).
 *
 * This deliberately does NOT mount the live {@link BuilderGuidanceRail}: AI
 * guidance is account-scoped + credit-billed (paid), so it requires an
 * authenticated account. Instead we:
 *   - show the visitor's homepage prompt in a read-only composer so it's clearly
 *     carried over (and not lost),
 *   - offer a "Copy prompt" backup (ANON-BUILDER-3 Scope B) so a visitor who'll
 *     finish sign-up on another browser/device can keep their idea — it copies
 *     ONLY the safe prompt string (no skeleton JSON, no secrets), and
 *   - offer a single contextual sign-up CTA to build it with AI.
 *
 * Purely presentational — no network, no endpoint, no store writes. The only
 * outbound effects are the sign-up Link and a clipboard write of the prompt text.
 */
export function AnonymousAgentRail({ prompt }: { prompt?: string }) {
  const trimmed = (prompt ?? "").trim();
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable / denied — non-fatal; the visible prompt is the fallback.
    }
  }

  return (
    <section
      aria-label="AI assistant"
      data-testid="anonymous-agent-rail"
      className="flex h-full min-h-0 flex-col gap-3 p-2"
      style={{ color: "var(--builder-text)" }}
    >
      <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
        Here&apos;s what you asked to automate. Create a free account to build it
        with the React Agent.
      </p>
      <textarea
        data-testid="anonymous-agent-rail-prompt"
        readOnly
        rows={4}
        value={trimmed}
        placeholder="Describe what you want to automate, then create an account to build it with AI."
        aria-label="Your automation idea"
        className="w-full resize-none rounded-md p-2.5 text-[13px] leading-relaxed"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-text)",
        }}
      />
      {trimmed ? (
        <button
          type="button"
          onClick={copyPrompt}
          data-testid="anonymous-agent-rail-copy"
          className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: "var(--builder-panel-2)",
            color: "var(--builder-text-2)",
            border: "1px solid var(--builder-border)",
          }}
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
      ) : null}
      <Link
        href={anonSignupHref("ai")}
        data-testid="anonymous-agent-rail-signup"
        className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium"
        style={{
          background: "var(--builder-text)",
          color: "var(--builder-panel)",
          border: "1px solid var(--builder-text)",
        }}
      >
        Create a free account to build with AI <span aria-hidden>→</span>
      </Link>
      <p className="text-[11px]" style={{ color: "var(--builder-muted-2)" }}>
        Building locally? Finish sign-up in this same browser to keep your draft,
        or use Copy prompt as a backup.
      </p>
    </section>
  );
}

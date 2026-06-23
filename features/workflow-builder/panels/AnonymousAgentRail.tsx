"use client";

import Link from "next/link";

/**
 * ANON-BUILDER-1 — left-rail React Agent surface for the LOCAL-ONLY builder
 * (`/build`, logged-out visitors).
 *
 * This deliberately does NOT mount the live {@link BuilderGuidanceRail}: AI
 * guidance is account-scoped + credit-billed (paid), so it requires an
 * authenticated account. Instead we:
 *   - show the visitor's homepage prompt in a read-only composer so it's clearly
 *     carried over (and not lost), and
 *   - offer a single contextual sign-up CTA to build it with AI.
 *
 * Purely presentational — no network, no endpoint, no store writes. The only
 * navigation is the sign-up Link. (Mirrors the "no old endpoint" rail guarantee.)
 */
export function AnonymousAgentRail({ prompt }: { prompt?: string }) {
  const trimmed = (prompt ?? "").trim();
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
      <Link
        href="/auth/sign-up"
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
        You can keep laying out steps on the canvas without an account.
      </p>
    </section>
  );
}

"use client";

import Link from "next/link";

/**
 * ANON-BUILDER — presentational chrome for the LOCAL-ONLY builder (`/start`,
 * logged-out visitors). Purely visual + sign-up Links; no network, no store
 * writes.
 *
 * Every gate routes to sign-up with `returnTo=/start/continue` (the controlled
 * restore route) + a contextual `reason` so the auth page shows the right copy
 * and the anonymous draft is restored after auth (ANON-BUILDER-2).
 */

/** Controlled post-auth restore route. */
const RESTORE_RETURN_TO = "/start/continue";

export type AnonGateReason = "save" | "activate" | "run" | "connect" | "ai";

/** Build the contextual sign-up href for a gate. */
export function anonSignupHref(reason: AnonGateReason): string {
  return `/auth/sign-up?returnTo=${encodeURIComponent(RESTORE_RETURN_TO)}&reason=${encodeURIComponent(reason)}`;
}

/**
 * Persistent banner above the canvas making the local-only contract explicit:
 * building is free; saving / connecting / running need an account.
 */
export function LocalBuildBanner() {
  return (
    <div
      data-testid="local-build-banner"
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
      style={{
        background: "var(--builder-panel-2)",
        borderBottom: "1px solid var(--builder-border)",
        color: "var(--builder-text-2)",
      }}
    >
      <span>
        You&apos;re building locally — nothing is saved yet. Create a free account
        to save, connect apps, or run it.
      </span>
      <Link
        href={anonSignupHref("save")}
        data-testid="local-build-banner-signup"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium"
        style={{
          background: "var(--builder-text)",
          color: "var(--builder-panel)",
          border: "1px solid var(--builder-text)",
        }}
      >
        Create a free account <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

/**
 * Header right cluster for the LOCAL-ONLY (logged-out) builder. Save / Run /
 * Activate require an account + server calls, so none of the real controls mount
 * — each is a contextual sign-up Link (distinct reason) instead. (Not mounting
 * the real controls is the guarantee that no anonymous click can hit the server.)
 */
export function HeaderRightLocalOnly() {
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className="hidden text-[11px] sm:inline"
        style={{ color: "var(--builder-muted)" }}
      >
        Building locally
      </span>
      <GateLink reason="run" testId="builder-header-local-test" label="Test" variant="ghost" />
      <GateLink reason="save" testId="builder-header-local-save" label="Save" variant="solid" />
      <GateLink
        reason="activate"
        testId="builder-header-local-activate"
        label="Activate"
        variant="ghost"
      />
    </div>
  );
}

function GateLink({
  reason,
  testId,
  label,
  variant,
}: {
  reason: AnonGateReason;
  testId: string;
  label: string;
  variant: "solid" | "ghost";
}) {
  const solid = variant === "solid";
  return (
    <Link
      href={anonSignupHref(reason)}
      data-testid={testId}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium"
      style={
        solid
          ? {
              background: "var(--builder-text)",
              color: "var(--builder-panel)",
              border: "1px solid var(--builder-text)",
            }
          : {
              background: "var(--builder-panel-2)",
              color: "var(--builder-text-2)",
              border: "1px solid var(--builder-border)",
            }
      }
      title={`Create a free account to ${reason === "run" ? "run" : reason} this workflow`}
    >
      {label}
    </Link>
  );
}

/**
 * Right-drawer body shown when a node is selected in local-only mode. Configuring
 * a step (and connecting its provider) needs account + provider credentials, so
 * instead of mounting the real config form (which would fetch `/api/options` and
 * start OAuth) we show a contextual sign-up prompt. No fake provider dropdowns.
 */
export function LocalConfigNote() {
  return (
    <div
      data-testid="local-config-note"
      className="flex h-full flex-col items-start gap-3 p-4 text-[13px]"
      style={{ color: "var(--builder-text-2)" }}
    >
      <p style={{ color: "var(--builder-text)" }} className="font-medium">
        Create a free account to configure this step
      </p>
      <p style={{ color: "var(--builder-muted)" }}>
        Setting up a step and connecting its app (Slack, Gmail, Notion, …) needs a
        ChainReact account. Your layout so far stays right here.
      </p>
      <Link
        href={anonSignupHref("connect")}
        data-testid="local-config-note-signup"
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium"
        style={{
          background: "var(--builder-text)",
          color: "var(--builder-panel)",
          border: "1px solid var(--builder-text)",
        }}
      >
        Create a free account to connect apps <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { signOut } from "@/app/auth/actions";
import { postOnboardingPresentation } from "@/lib/api/onboarding";

/**
 * Authenticated-user menu (Slice 4.APP-SHELL-1; rail-style refit in
 * 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Trigger: a circular initials avatar that sits at the bottom of the
 * left rail (mirrors design `sb-avatar` — `workflows-page.jsx:107-116`).
 * Popover content: full email + an "Account settings" link (the real
 * `/account` route, Slice 4.ACCOUNT-SETTINGS-1) + a Sign out form bound
 * to the existing `signOut` server action (which destroys the session +
 * redirects to `/`). Still NO Billing/Settings-hub items — those routes
 * don't exist yet, and the page guide forbids CTAs without a real route.
 *
 * Notes:
 *   - The `<form action={signOut}>` is the standard Next.js server-
 *     action invocation. `useState` here is only for popover open/close;
 *     the sign-out itself doesn't need client state.
 *   - Initials are derived locally from the email — no extra fetch.
 */
/** Staffed support mailbox surfaced to signed-in users (mirrors the
 * marketing footers). Kept as a named constant so the address lives in
 * one place per surface. */
const SUPPORT_EMAIL = "support@chainreact.app";

interface Props {
  userEmail: string;
  /**
   * 5.ONBOARD-1 — server-evaluated ENABLE_ONBOARDING_CHECKLIST (threaded from
   * AppShell; the env var is not NEXT_PUBLIC so it can't be read here). Shows
   * the "Getting started" item that reopens a dismissed checklist.
   */
  gettingStartedEnabled?: boolean;
}

export function UserMenu({ userEmail, gettingStartedEnabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const initials = initialsForEmail(userEmail);

  // Reopen the checklist for the ACTIVE account, then land on /workflows with
  // a full reload (same re-scope idiom as the account switcher) so the
  // server-fetched checklist reflects the reopen. The POST is best-effort —
  // navigation proceeds even if it fails.
  async function openGettingStarted() {
    setOpen(false);
    try {
      await postOnboardingPresentation({ action: "reopen" });
    } catch {
      /* best-effort */
    }
    window.location.assign("/workflows");
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="app-shell-user-menu-trigger"
          aria-label={`Account menu for ${userEmail}`}
          aria-expanded={open}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-xs font-semibold text-primary transition hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span aria-hidden>{initials}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        className="w-64 p-2"
        // Pinned dark scope: PopoverContent portals to document.body,
        // outside the AppShell's `[data-app-surface="dark"]` ancestor,
        // so the scope's HSL re-themes don't cascade. Re-applying the
        // attribute here makes the CSS rule match the portaled node
        // directly.
        data-app-surface="dark"
        data-testid="app-shell-user-menu-content"
      >
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Signed in as
          </span>
          <span
            data-testid="app-shell-user-email"
            className="truncate text-sm text-foreground"
          >
            {userEmail}
          </span>
        </div>
        <div className="my-1 h-px bg-border" />
        {gettingStartedEnabled && (
          <button
            type="button"
            data-testid="app-shell-getting-started"
            onClick={() => void openGettingStarted()}
            className="block w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          >
            Getting started
          </button>
        )}
        <Link
          href="/account"
          data-testid="app-shell-account"
          onClick={() => setOpen(false)}
          className="block w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
        >
          Account settings
        </Link>
        {/*
         * Contact support: a real mailto to the staffed support@chainreact.app
         * mailbox, so a signed-in user hitting a problem has an in-product way
         * to reach a human from every authenticated surface (the user menu is
         * rendered on every app-shell page). External link → plain <a>, not
         * next/link.
         */}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          data-testid="app-shell-contact-support"
          onClick={() => setOpen(false)}
          className="block w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
        >
          Contact support
        </a>
        <form action={signOut}>
          <button
            type="submit"
            data-testid="app-shell-sign-out"
            className="block w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function initialsForEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  // Initials from local-part: split on common separators, take leading
  // letters. Falls back to the first two letters of the local-part, or
  // "?" if nothing usable.
  const tokens = local.split(/[._\-+]/).filter(Boolean);
  if (tokens.length >= 2) {
    const a = tokens[0]?.[0] ?? "";
    const b = tokens[1]?.[0] ?? "";
    return (a + b).toUpperCase() || "?";
  }
  const head = local.replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return head.toUpperCase() || "?";
}

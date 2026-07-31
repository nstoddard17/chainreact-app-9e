"use client";

import { useState, type FormEvent } from "react";
import {
  AccountApiError,
  createInvitation,
  type CreatedInvitation,
  type TeamManageableRole,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_COPY } from "./roleCopy";

/**
 * Invite bar (Slice 4.TEAM-PAGE-1; email delivery TEAM-INVITATION-EMAIL-1).
 *
 * Submitting creates a durable pending invite AND emails the invited address a
 * ChainReact-branded invitation. Email is the primary delivery channel; the
 * one-time copyable accept link stays as a fallback in every outcome:
 *
 *   - `sent`            → "Invitation emailed to …" + link as a backup.
 *   - `failed`          → warning: the invite EXISTS but the email didn't go
 *                         out — the owner shares the link manually. Explicitly
 *                         tells them NOT to resubmit (a resubmit would hit the
 *                         duplicate-pending-invite rule, not resend).
 *   - `not_configured`  → local/dev without email credentials: same manual-link
 *                         guidance, neutral wording.
 *
 * The full URL is built from `window.location.origin + acceptPath` at render
 * time (the inviter is on the canonical origin; the emailed link is built
 * server-side from the configured origin). Delivery outcome is announced via
 * an `aria-live` region.
 *
 * Disabled at the team member cap — the parent passes `disabled` so the control
 * can't even attempt a call the server would reject with TEAM_MEMBER_LIMIT_REACHED.
 */
interface Props {
  accountId: string;
  disabled: boolean;
  onChanged: () => void;
}

export function InviteBar({ accountId, disabled, onChanged }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamManageableRole>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setError("Enter an email address to invite.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const created = await createInvitation(accountId, trimmed, role);
      setResult(created);
      setEmail("");
      onChanged(); // refresh pending-invite list
    } catch (err) {
      setError(err instanceof AccountApiError ? err.message : "Couldn't create the invite.");
    } finally {
      setPending(false);
    }
  }

  function acceptUrl(path: string): string {
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  async function handleCopy() {
    if (!result) return;
    const url = acceptUrl(result.acceptPath);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions / insecure context) — the link stays
      // visible in the readonly field for manual selection.
      setCopied(false);
    }
  }

  const delivery = result?.emailDelivery.status ?? null;

  return (
    <div
      data-testid="team-invite-bar"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          type="email"
          aria-label="Invite by email"
          placeholder="Invite by email — we'll send them an invitation"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled || pending}
          className="min-w-0 flex-1"
        />
        <select
          aria-label="Invite role"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamManageableRole)}
          disabled={disabled || pending}
          className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto"
        >
          <option value="member">As Member</option>
          <option value="admin">As Admin</option>
        </select>
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </form>

      <p data-testid="team-invite-role-help" className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">As {ROLE_COPY[role].label}:</span>{" "}
        {ROLE_COPY[role].summary}
      </p>

      <p className="text-xs text-muted-foreground">
        We&apos;ll email the invitation. Your teammate accepts while signed in
        with the invited address — new to ChainReact, they can create an account
        with it.
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Screen-reader announcement of the delivery outcome. Visually the
          panels below carry the same information. */}
      <p aria-live="polite" role="status" className="sr-only">
        {result
          ? delivery === "sent"
            ? `Invitation emailed to ${result.invitation.email}.`
            : `Invitation created for ${result.invitation.email}, but the email was not sent. Copy the invitation link to share it.`
          : ""}
      </p>

      {result && (
        <div
          data-testid="team-invite-link"
          className={
            delivery === "sent"
              ? "flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
              : "flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
          }
        >
          {delivery === "sent" ? (
            <span data-testid="team-invite-delivery" className="text-xs font-medium text-foreground">
              Invitation emailed to {result.invitation.email} (
              {result.invitation.role}). It stays active until accepted or
              canceled. They can sign in or create an account with that address.
              Backup link:
            </span>
          ) : (
            <span data-testid="team-invite-delivery" className="text-xs font-medium text-foreground">
              {delivery === "not_configured"
                ? "Invitation created. Email sending isn't configured in this environment — "
                : "The invitation was created, but the email couldn't be sent — "}
              copy this link and send it to {result.invitation.email} yourself (
              {result.invitation.role}). It stays active until accepted or
              canceled. Don&apos;t submit the form again — the invitation
              already exists.
            </span>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              aria-label="Invite link"
              value={acceptUrl(result.acceptPath)}
              onFocus={(e) => e.target.select()}
              className="h-9 w-full min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
            />
            <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

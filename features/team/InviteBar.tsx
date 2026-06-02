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

/**
 * Invite-by-copy-link bar (Slice 4.TEAM-PAGE-1).
 *
 * Creates a pending invite and surfaces the one-time accept link for the
 * inviter to copy and share manually. NO outbound email is sent (the backend
 * has no email infra; the raw token is returned only on create). The full URL
 * is built from `window.location.origin + acceptPath` at copy time.
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

  return (
    <div
      data-testid="team-invite-bar"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="email"
          aria-label="Invite by email"
          placeholder="Invite by email — they'll need this address to accept"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled || pending}
          className="flex-1"
        />
        <select
          aria-label="Invite role"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamManageableRole)}
          disabled={disabled || pending}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <option value="member">As Member</option>
          <option value="admin">As Admin</option>
        </select>
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Creating…" : "Create invite link"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        We don&apos;t email invites yet — create the link and share it with your
        teammate. They&apos;ll accept while signed in with the invited email.
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div
          data-testid="team-invite-link"
          className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
        >
          <span className="text-xs font-medium text-foreground">
            Invite link for {result.invitation.email} ({result.invitation.role}) —
            expires {result.invitation.expiresAt.slice(0, 10)}
          </span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Invite link"
              value={acceptUrl(result.acceptPath)}
              onFocus={(e) => e.target.select()}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
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

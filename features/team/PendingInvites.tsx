"use client";

import { useState } from "react";
import { AccountApiError, revokeInvitation } from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TeamInvitationView } from "./teamTypes";
import { formatTeamDate } from "./formatTeamDate";

/**
 * Pending invitations list (Slice 4.TEAM-PAGE-1).
 *
 * Owner/admin only (the parent gates rendering). Each row shows the invited
 * email, role, and expiry, with a Revoke action wired to the DELETE invitation
 * route. There is no Resend (no email infra) — to re-share, revoke and create a
 * fresh link from the invite bar.
 */
interface Props {
  accountId: string;
  invitations: readonly TeamInvitationView[];
  onChanged: () => void;
}

export function PendingInvites({ accountId, invitations, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await revokeInvitation(accountId, id);
      onChanged();
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't revoke the invite.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      data-testid="team-pending-invites"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <span>Pending invitations</span>
        <Badge variant="outline" className="border-warning/40 text-warning">
          {invitations.length}
        </Badge>
      </div>

      <ul>
        {invitations.map((iv) => (
          <li
            key={iv.id}
            data-testid={`team-invite-${iv.id}`}
            className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {iv.email}
              </span>
              <span className="text-xs text-muted-foreground">
                {iv.role} · expires {formatTeamDate(iv.expiresAt)}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid={`team-revoke-${iv.id}`}
              disabled={busyId === iv.id}
              onClick={() => handleRevoke(iv.id)}
              className="text-destructive hover:text-destructive"
            >
              {busyId === iv.id ? "Revoking…" : "Revoke"}
            </Button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

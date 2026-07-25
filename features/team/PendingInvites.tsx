"use client";

import { useState, type FormEvent } from "react";
import {
  AccountApiError,
  revokeInvitation,
  changeInvitationRole,
  changeInvitationEmail,
  type CreatedInvitation,
  type TeamManageableRole,
} from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TeamInvitationView } from "./teamTypes";
import { formatTeamDate } from "./formatTeamDate";

/**
 * Pending invitations list (Slice 4.TEAM-PAGE-1; lifecycle controls
 * TEAM-INVITATION-LIFECYCLE-2).
 *
 * Owner/admin only (the parent gates rendering). Invitations do NOT expire —
 * each row shows invited email, role, and invite date, with three controls:
 *
 *   - Change role  — updates the invite IN PLACE. The existing invitation link
 *                    stays active and no new email is sent; the row confirms
 *                    exactly that after a change.
 *   - Change email — REPLACES the invite. The UI warns first that the old link
 *                    will stop working; on success it shows the NEW one-time
 *                    copyable link + delivery status for the new address.
 *   - Cancel       — revokes immediately; the link stops working.
 *
 * Outcomes are announced via an `aria-live` region.
 */
interface Props {
  accountId: string;
  invitations: readonly TeamInvitationView[];
  onChanged: () => void;
}

export function PendingInvites({ accountId, invitations, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Row currently showing the change-email form. */
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  /** Per-row confirmation after a successful role change. */
  const [roleChangedId, setRoleChangedId] = useState<string | null>(null);
  /** Replacement result (new link) after a successful email change. */
  const [replacement, setReplacement] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [announce, setAnnounce] = useState("");

  function resetTransient() {
    setError(null);
    setRoleChangedId(null);
    setCopied(false);
  }

  async function handleRevoke(id: string) {
    setBusyId(id);
    resetTransient();
    try {
      await revokeInvitation(accountId, id);
      setAnnounce("Invitation canceled. Its link no longer works.");
      onChanged();
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't cancel the invite.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleRoleChange(id: string, role: TeamManageableRole) {
    setBusyId(id);
    resetTransient();
    try {
      await changeInvitationRole(accountId, id, role);
      setRoleChangedId(id);
      setAnnounce(
        `Role updated to ${role}. The existing invitation link is still active — no new email was sent.`,
      );
      onChanged();
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't change the role.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleEmailChange(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const trimmed = newEmail.trim();
    if (trimmed.length === 0) {
      setError("Enter the new email address.");
      return;
    }
    setBusyId(id);
    resetTransient();
    try {
      const created = await changeInvitationEmail(accountId, id, trimmed);
      setReplacement(created);
      setEditingEmailId(null);
      setNewEmail("");
      setAnnounce(
        created.emailDelivery.status === "sent"
          ? `Invitation re-issued and emailed to ${created.invitation.email}. The old link no longer works.`
          : `Invitation re-issued for ${created.invitation.email}, but the email was not sent — copy the new link below. The old link no longer works.`,
      );
      onChanged();
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't change the email.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function replacementUrl(path: string): string {
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  async function handleCopyReplacement() {
    if (!replacement) return;
    try {
      await navigator.clipboard.writeText(replacementUrl(replacement.acceptPath));
      setCopied(true);
    } catch {
      setCopied(false);
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
            className="flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {iv.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  invited {formatTeamDate(iv.createdAt)} · active until accepted or
                  canceled
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Role for ${iv.email}`}
                  data-testid={`team-invite-role-${iv.id}`}
                  value={iv.role}
                  disabled={busyId === iv.id}
                  onChange={(e) =>
                    handleRoleChange(iv.id, e.target.value as TeamManageableRole)
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`team-invite-change-email-${iv.id}`}
                  disabled={busyId === iv.id}
                  onClick={() => {
                    resetTransient();
                    setReplacement(null);
                    setEditingEmailId(editingEmailId === iv.id ? null : iv.id);
                    setNewEmail("");
                  }}
                >
                  Change email
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`team-revoke-${iv.id}`}
                  disabled={busyId === iv.id}
                  onClick={() => handleRevoke(iv.id)}
                  className="text-destructive hover:text-destructive"
                >
                  {busyId === iv.id ? "Working…" : "Cancel"}
                </Button>
              </div>
            </div>

            {roleChangedId === iv.id && (
              <p
                data-testid={`team-invite-role-confirm-${iv.id}`}
                className="text-xs text-muted-foreground"
              >
                Role updated. The existing invitation link is still active — no new
                email was sent.
              </p>
            )}

            {editingEmailId === iv.id && (
              <form
                onSubmit={(e) => handleEmailChange(e, iv.id)}
                data-testid={`team-invite-email-form-${iv.id}`}
                className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
              >
                <p className="text-xs text-foreground">
                  Changing the email re-issues this invitation:{" "}
                  <span className="font-medium">
                    the old link will stop working
                  </span>{" "}
                  and a new invitation email and link will be sent to the new
                  address (same role).
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    aria-label="New invite email"
                    placeholder="new-address@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={busyId === iv.id}
                    className="h-8 flex-1 text-xs"
                  />
                  <Button type="submit" size="sm" disabled={busyId === iv.id}>
                    {busyId === iv.id ? "Re-issuing…" : "Re-issue invite"}
                  </Button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>

      {replacement && (
        <div
          data-testid="team-invite-replacement"
          className="flex flex-col gap-2 border-t border-border px-4 py-3"
        >
          <span className="text-xs font-medium text-foreground">
            {replacement.emailDelivery.status === "sent"
              ? `New invitation emailed to ${replacement.invitation.email}. `
              : replacement.emailDelivery.status === "not_configured"
                ? `New invitation created for ${replacement.invitation.email} (email isn't configured in this environment). `
                : `New invitation created for ${replacement.invitation.email}, but the email couldn't be sent. `}
            The previous link no longer works. New link:
          </span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="New invite link"
              value={replacementUrl(replacement.acceptPath)}
              onFocus={(e) => e.target.select()}
              className="h-8 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
            />
            <Button type="button" size="sm" variant="outline" onClick={handleCopyReplacement}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </div>
      )}

      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>

      {error && (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

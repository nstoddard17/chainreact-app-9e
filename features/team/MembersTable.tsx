"use client";

import { useState } from "react";
import {
  AccountApiError,
  changeMemberRole,
  getMemberWorkflowImpact,
  removeMember,
  type TeamManageableRole,
} from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TeamMemberView } from "./teamTypes";
import { formatTeamDate } from "./formatTeamDate";
import { RoleBadge } from "./RoleBadge";

/**
 * Members roster table (Slice 4.TEAM-PAGE-1; identity added in 4.TEAM-PAGE-2).
 *
 * Display identity comes from the co-member-only `get_account_member_identities`
 * RPC. The fallback chain is name → email → short user id, and the signed-in
 * user always carries a "You" badge. We never invent identity we don't have.
 *
 * Manager controls (owner/admin): the owner row is fixed (no controls — owner
 * transfer is deferred). For non-owner, non-self rows, a role select
 * (admin↔member) + Remove are shown. The server still enforces the fine-grained
 * rules (admins can't manage other admins, etc.); we surface its errors inline.
 */
interface Props {
  accountId: string;
  members: readonly TeamMemberView[];
  canManage: boolean;
  onChanged: () => void;
}

function shortId(userId: string): string {
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
}

/**
 * Resolve the two display lines + avatar seed for a member.
 *
 * Preferred shape: NAME on top (next to the "You" pill), EMAIL underneath.
 * The raw user id is only ever shown as a last resort when we have neither a
 * name nor an email — once an email exists it always wins the bottom line over
 * the id.
 *   - name + email → name / email
 *   - name only    → name / (nothing)
 *   - email only   → email / (nothing — no id)
 *   - neither      → "You" | "Team member" / short id
 */
function memberIdentity(m: TeamMemberView): {
  primary: string;
  secondary: string | null;
  avatar: string;
} {
  const name = m.displayName?.trim() || "";
  const email = m.email?.trim() || "";
  if (name) {
    return { primary: name, secondary: email || null, avatar: name };
  }
  if (email) {
    return { primary: email, secondary: null, avatar: email };
  }
  return {
    primary: m.isYou ? "You" : "Team member",
    secondary: shortId(m.userId),
    avatar: m.userId,
  };
}

/**
 * Per-row removal confirmation state (Slice 4.TEAM-WORKFLOWS-7 / TW-5).
 * `impact` is null while the advisory workflow-impact count is loading.
 */
interface RemoveConfirm {
  userId: string;
  impact: number | null;
}

export function MembersTable({ accountId, members, canManage, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<RemoveConfirm | null>(null);

  async function withBusy(userId: string, fn: () => Promise<void>) {
    setBusyId(userId);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "That action failed. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  // Open the removal confirmation and fetch the advisory workflow-impact count.
  // The impact lookup is best-effort: a failure leaves `impact` null (no
  // warning shown) — it must never block the ability to remove.
  async function startRemove(userId: string) {
    setError(null);
    setConfirm({ userId, impact: null });
    try {
      const impact = await getMemberWorkflowImpact(accountId, userId);
      setConfirm((c) => (c && c.userId === userId ? { ...c, impact } : c));
    } catch {
      setConfirm((c) => (c && c.userId === userId ? { ...c, impact: 0 } : c));
    }
  }

  async function confirmRemove(userId: string) {
    setConfirm(null);
    await withBusy(userId, () => removeMember(accountId, userId));
  }

  return (
    <div
      data-testid="team-members-table"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      {/* Column headers belong to the TABLE presentation only. Below `sm` each
          member becomes a stacked card, where a row of headings above the list
          would label nothing. */}
      <div
        data-testid="team-members-table-head"
        className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 border-b border-border bg-background/40 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid"
      >
        <span>Member</span>
        <span>Role</span>
        <span>Joined</span>
        <span className="sr-only">Actions</span>
      </div>

      {members.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No members match your search.
        </p>
      )}

      <ul>
        {members.map((m) => {
          const isOwner = m.role === "owner";
          const manageable = canManage && !isOwner && !m.isYou;
          const rowBusy = busyId === m.userId;
          const confirming = confirm?.userId === m.userId;
          const identity = memberIdentity(m);
          return (
            <li
              key={m.userId}
              data-testid={`team-member-${m.userId}`}
              className="border-t border-border first:border-t-0"
            >
              {/*
                RESPONSIVE-TEAM-4 — the member row is a TABLE above `sm` and a
                STACKED CARD below it, from one set of markup.

                The old row was a four-track grid at every width, and the identity
                track (`2.4fr`, `min-w-0`) was the only one that could yield. So
                when space ran out the name and email — the reason the row exists —
                collapsed to 64px, of which 32px was the avatar, while the role
                select, the joined date and the Remove button all kept their
                intrinsic widths. Nothing overflowed, so this was invisible to a
                containment check; it is why the harness now also enforces a
                declared minimum readable width.

                Below `sm` identity takes the full line and the secondary group
                (role · joined · actions) wraps underneath it. At `sm` and up the
                wrapper becomes `display: contents`, so its three children rejoin
                the parent grid as tracks 2–4 and the aligned table is unchanged.
                One DOM, one set of controls — a member cannot be offered an action
                in one presentation and denied it in the other.
              */}
              <div className="flex flex-col gap-3 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              {/* The tag sits on the ALLOCATED cell, not on the identity block
                  inside it: the block shrink-wraps its content, so a short name
                  like "Team member" measures 91px and would look like a squeeze
                  when it is simply short. The cell is the space the layout GAVE
                  identity, which is the number that actually goes wrong. 180px
                  leaves ~136px of text after the 32px avatar and its gap. */}
              <div
                className="flex min-w-0 items-center gap-3"
                data-legible-min="180"
                data-legible-what="member identity"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
                >
                  {identity.avatar.slice(0, 2)}
                </span>
                <div className="flex min-w-0 flex-col">
                  {/* `truncate` was on the FLEX ROW, which cannot truncate its
                      children — it just let the "You" badge escape. The name owns
                      the truncation now (wrapping in card mode, ellipsis in table
                      mode) and the badge holds its width. */}
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <span className="min-w-0 break-words sm:truncate">
                      {identity.primary}
                    </span>
                    {m.isYou && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-primary/30 text-primary"
                      >
                        You
                      </Badge>
                    )}
                  </span>
                  {identity.secondary && (
                    // An email is one unbroken token; `break-all` is what actually
                    // splits it when the card is narrow.
                    <span className="min-w-0 break-all font-mono text-xs text-muted-foreground sm:truncate">
                      {identity.secondary}
                    </span>
                  )}
                </div>
              </div>

              {/* Secondary group: its own wrapping row in card mode, dissolved
                  back into grid tracks 2–4 by `sm:contents`. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:contents">
              <div className="min-w-0">
                {manageable ? (
                  <select
                    aria-label="Member role"
                    value={m.role}
                    disabled={rowBusy}
                    onChange={(e) =>
                      withBusy(m.userId, () =>
                        changeMemberRole(
                          accountId,
                          m.userId,
                          e.target.value as TeamManageableRole,
                        ),
                      )
                    }
                    // Content-sized in the wrapping card row so it sits beside the
                    // date; fills its track in the aligned table.
                    className="h-8 w-auto min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:w-full"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
              </div>

              <span className="min-w-0 text-xs text-muted-foreground">
                {/* In card mode the column header is gone, so the date says what
                    it is. The table presentation already has a "Joined" header. */}
                <span className="sm:hidden">Joined </span>
                {formatTeamDate(m.joinedAt)}
              </span>

              <div className="flex justify-start sm:justify-end">
                {manageable && !confirming && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid={`team-remove-${m.userId}`}
                    disabled={rowBusy}
                    onClick={() => startRemove(m.userId)}
                    className="shrink-0 text-destructive hover:text-destructive"
                  >
                    {rowBusy ? "…" : "Remove"}
                  </Button>
                )}
              </div>
              </div>
              </div>

              {/* TW-5: removal confirmation + advisory workflow-impact warning.
                  The warning is non-blocking — removal always proceeds via
                  "Remove member". */}
              {confirming && (
                <div
                  data-testid={`team-remove-confirm-${m.userId}`}
                  className="flex flex-col gap-2 border-t border-border bg-background/40 px-4 py-3"
                >
                  {confirm?.impact != null && confirm.impact > 0 && (
                    <p
                      role="alert"
                      data-testid={`team-remove-impact-${m.userId}`}
                      className="text-xs text-amber-600 dark:text-amber-400"
                    >
                      {`This member runs ${confirm.impact} workflow${
                        confirm.impact === 1 ? "" : "s"
                      } with personal app steps under their connection (as creator or assigned owner). Those steps may stop running after removal until reconnected or reassigned.`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      data-testid={`team-remove-confirm-button-${m.userId}`}
                      disabled={rowBusy}
                      onClick={() => confirmRemove(m.userId)}
                    >
                      {rowBusy ? "Removing…" : "Remove member"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`team-remove-cancel-${m.userId}`}
                      disabled={rowBusy}
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

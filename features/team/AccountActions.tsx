"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AccountApiError,
  getLeaveImpact,
  leaveAccount,
  transferOwnership,
  type AccountSummary,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Panel } from "./Panel";
import type { TeamMemberView } from "./teamTypes";

/**
 * Ownership & membership actions for a team/business account
 * (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-6 / TL-5).
 *
 * Surfaces the already-built backend:
 *   - Transfer ownership (owner only) — `transferOwnership` (password step-up,
 *     target must already be a member). Old owner becomes admin; the target
 *     becomes owner. Workflows + their creator connections are unchanged.
 *   - Leave team (members/admins) — `leaveAccount`. A sole owner is blocked and
 *     pointed at Transfer ownership. Before confirming, `getLeaveImpact` surfaces
 *     the count of the caller's own personal-app workflows that may stop running.
 *
 * Uses the page's inline-confirmation style (no modal primitive exists) — the
 * same shape as `MembersTable`'s removal flow. Every mutation refreshes the
 * server context via `onChanged`; a successful leave routes to a safe page since
 * the caller no longer belongs to the active account.
 */
interface Props {
  account: AccountSummary;
  members: readonly TeamMemberView[];
  onChanged: () => void;
}

function shortId(userId: string): string {
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
}

/** Display label for a member in the transfer target picker (name → email → short id). */
function memberLabel(m: TeamMemberView): string {
  const name = m.displayName?.trim() || "";
  const email = m.email?.trim() || "";
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return `Team member ${shortId(m.userId)}`;
}

export function AccountActions({ account, members, onChanged }: Props) {
  const router = useRouter();
  const isOwner = account.role === "owner";

  // A sole owner can't leave (the account must keep an owner). In the
  // single-owner launch the owner is always the sole owner; the `otherOwners`
  // check keeps this correct if multi-owner is ever enabled.
  const otherOwners = members.filter((m) => !m.isYou && m.role === "owner").length;
  const soleOwner = isOwner && otherOwners === 0;

  // Transfer targets: existing members who are neither the caller nor an owner.
  const targets = useMemo(
    () => members.filter((m) => !m.isYou && m.role !== "owner"),
    [members],
  );

  // ── Transfer ownership state ────────────────────────────────────────────────
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [password, setPassword] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferDone, setTransferDone] = useState(false);

  function openTransfer() {
    setTransferError(null);
    setTransferDone(false);
    setPassword("");
    setTargetUserId(targets[0]?.userId ?? "");
    setTransferOpen(true);
  }

  function cancelTransfer() {
    setTransferOpen(false);
    setTransferError(null);
    setPassword("");
  }

  async function submitTransfer() {
    if (!targetUserId || password.length === 0) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      await transferOwnership(account.id, { targetUserId, password });
      setTransferOpen(false);
      setPassword("");
      setTransferDone(true);
      onChanged();
    } catch (err) {
      setTransferError(
        err instanceof AccountApiError
          ? err.message
          : "Couldn't transfer ownership. Try again.",
      );
    } finally {
      setTransferBusy(false);
    }
  }

  // ── Leave team state ────────────────────────────────────────────────────────
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveImpact, setLeaveImpact] = useState<number | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Open the leave confirmation and fetch the advisory self-impact count. The
  // lookup is best-effort: a failure leaves the count null (no warning), never
  // blocking the ability to leave.
  async function startLeave() {
    setLeaveError(null);
    setLeaveImpact(null);
    setLeaveOpen(true);
    try {
      const impact = await getLeaveImpact(account.id);
      setLeaveImpact(impact);
    } catch {
      setLeaveImpact(0);
    }
  }

  function cancelLeave() {
    setLeaveOpen(false);
    setLeaveError(null);
  }

  async function confirmLeave() {
    setLeaveBusy(true);
    setLeaveError(null);
    try {
      await leaveAccount(account.id);
      onChanged();
      // The caller no longer belongs to this account — route to a safe page.
      router.push("/workflows");
    } catch (err) {
      setLeaveError(
        err instanceof AccountApiError ? err.message : "Couldn't leave. Try again.",
      );
      setLeaveBusy(false);
    }
  }

  return (
    <Panel
      title="Ownership & membership"
      desc="Hand off this account or leave it. These actions don't change billing or who created your workflows."
    >
      <div data-testid="team-account-actions" className="flex flex-col gap-5">
        {/* ── Transfer ownership (owner only) ───────────────────────────────── */}
        {isOwner && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">
                  Transfer ownership
                </span>
                <span className="text-xs text-muted-foreground">
                  Make another member the owner. You become an admin.
                </span>
              </div>
              {!transferOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="team-transfer-open"
                  disabled={targets.length === 0}
                  onClick={openTransfer}
                >
                  Transfer ownership
                </Button>
              )}
            </div>

            {transferDone && (
              <p
                role="status"
                data-testid="team-transfer-success"
                className="text-xs text-emerald-600 dark:text-emerald-400"
              >
                Ownership transferred. You are now an admin of this account.
              </p>
            )}

            {targets.length === 0 && !transferOpen && (
              <p className="text-xs text-muted-foreground">
                Invite another member before you can transfer ownership.
              </p>
            )}

            {transferOpen && (
              <div
                data-testid="team-transfer-form"
                className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4"
              >
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  <li>The member you choose becomes the owner.</li>
                  <li>You become an admin of this account.</li>
                  <li>Workflows stay in the account — nothing is deleted.</li>
                  <li>Workflow creator app connections are unchanged.</li>
                </ul>

                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  New owner
                  <select
                    aria-label="New owner"
                    data-testid="team-transfer-target"
                    value={targetUserId}
                    disabled={transferBusy}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {targets.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {memberLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  Confirm your password
                  <input
                    type="password"
                    aria-label="Confirm your password"
                    data-testid="team-transfer-password"
                    value={password}
                    disabled={transferBusy}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                </label>

                {transferError && (
                  <p
                    role="alert"
                    data-testid="team-transfer-error"
                    className="text-xs text-destructive"
                  >
                    {transferError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    data-testid="team-transfer-confirm"
                    disabled={transferBusy || !targetUserId || password.length === 0}
                    onClick={submitTransfer}
                  >
                    {transferBusy ? "Transferring…" : "Transfer ownership"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid="team-transfer-cancel"
                    disabled={transferBusy}
                    onClick={cancelTransfer}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Leave team ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">Leave team</span>
              <span className="text-xs text-muted-foreground">
                Remove yourself from this account.
              </span>
            </div>
            {!leaveOpen &&
              (soleOwner ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="team-leave-open"
                  disabled
                >
                  Leave team
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="team-leave-open"
                  onClick={startLeave}
                  className="text-destructive hover:text-destructive"
                >
                  Leave team
                </Button>
              ))}
          </div>

          {soleOwner && (
            <p
              data-testid="team-leave-sole-owner"
              className="text-xs text-muted-foreground"
            >
              Transfer ownership before leaving this team.
            </p>
          )}

          {leaveOpen && !soleOwner && (
            <div
              data-testid="team-leave-form"
              className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-4"
            >
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                <li>Leaving removes your membership from this account.</li>
                <li>
                  Personal app connections you added to this team will be disconnected.
                </li>
                <li>
                  Workflows you created with personal app steps may stop running until
                  reconnected or reassigned.
                </li>
              </ul>

              {leaveImpact != null && leaveImpact > 0 && (
                <p
                  role="alert"
                  data-testid="team-leave-impact"
                  className="text-xs text-amber-600 dark:text-amber-400"
                >
                  {`You created ${leaveImpact} workflow${
                    leaveImpact === 1 ? "" : "s"
                  } with personal app steps. Those steps may stop running after you leave.`}
                </p>
              )}

              {leaveError && (
                <p
                  role="alert"
                  data-testid="team-leave-error"
                  className="text-xs text-destructive"
                >
                  {leaveError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  data-testid="team-leave-confirm"
                  disabled={leaveBusy}
                  onClick={confirmLeave}
                >
                  {leaveBusy ? "Leaving…" : "Leave team"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="team-leave-cancel"
                  disabled={leaveBusy}
                  onClick={cancelLeave}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

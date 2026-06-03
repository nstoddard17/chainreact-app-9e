"use client";

import { Info } from "lucide-react";
import { useBuilderTeamContext } from "../context/builderTeamContext";

/**
 * Active-account mismatch banner (Slice 4.TEAM-WORKFLOWS-6 / TW-3b).
 *
 * Non-blocking notice shown ONLY when the workflow being edited belongs to a
 * different account than the one currently active (e.g. editing a Team
 * workflow while Personal is active). It renders nothing otherwise.
 *
 * Purely informational: no buttons, no links, no state mutation — it does NOT
 * reload, redirect, or discard edits. The builder is pinned to the workflow it
 * loaded (membership is re-checked server-side on every write — see
 * team-workflows-1-builder-plan.md §4).
 */
export function ActiveAccountMismatchBanner() {
  const team = useBuilderTeamContext();
  if (!team || !team.accountMismatch) return null;

  const workflowAccount = team.workflowAccountName ?? "another account";
  const activeAccount = team.activeAccountName ?? "a different account";

  return (
    <div
      role="status"
      data-testid="active-account-mismatch-banner"
      className="flex items-center gap-2 border-b px-3 py-1.5 text-[12px]"
      style={{
        background: "var(--builder-panel-2)",
        color: "var(--builder-muted)",
        borderColor: "var(--builder-border)",
      }}
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        You&rsquo;re editing a workflow in <strong>{workflowAccount}</strong>{" "}
        while <strong>{activeAccount}</strong> is active.
      </span>
    </div>
  );
}

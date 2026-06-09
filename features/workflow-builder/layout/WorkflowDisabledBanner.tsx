"use client";

import { AlertTriangle } from "lucide-react";
import type { WorkflowDisabledReason, WorkflowState } from "@/contracts/workflow";

/**
 * Disabled-workflow notice for the builder banner slot.
 *
 * Renders ONLY when the open workflow's state is `disabled`. Surfaces the human-readable
 * `disabledContext` the lifecycle layer persisted (e.g. the template-replace context
 * "Definition replaced from a template — reconnect and reactivate.") so the user understands
 * WHY the workflow is off — previously this string reached the client but was rendered
 * nowhere. Falls back to a per-reason explanation when no context is present.
 *
 * Informational only — no mutation here. Recovery is the header's "Reactivate" action
 * (markEligibleToResume → Resume), which re-registers triggers off the current draft.
 */
interface Props {
  state: WorkflowState;
  disabledReason: WorkflowDisabledReason | null;
  disabledContext: string | null;
}

const REASON_FALLBACK: Record<WorkflowDisabledReason, string> = {
  integration_revoked:
    "A connected account was disconnected. Reconnect it, then reactivate this workflow.",
  billing_exhausted:
    "This workflow was turned off because the account reached its task limit for the period.",
  repeated_failure:
    "This workflow was turned off after repeated run failures. Review the steps, then reactivate.",
  manual_admin:
    "This workflow was turned off. Review the steps, reconnect any accounts, then reactivate.",
};

export function WorkflowDisabledBanner({ state, disabledReason, disabledContext }: Props) {
  if (state !== "disabled") return null;

  const message =
    disabledContext?.trim() ||
    (disabledReason ? REASON_FALLBACK[disabledReason] : null) ||
    "This workflow is turned off. Review it, then reactivate when you're ready.";

  return (
    <div
      role="status"
      data-testid="workflow-disabled-banner"
      className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <strong>Workflow deactivated.</strong> {message} Use <strong>Reactivate</strong> in
        the header when you&rsquo;re ready.
      </span>
    </div>
  );
}

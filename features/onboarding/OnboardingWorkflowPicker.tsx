"use client";

import type { OnboardingWorkflowOptionDTO } from "@/contracts/onboarding";

/**
 * "Working on" workflow selector (5.ONBOARD-1 Batch 2). Rendered only when
 * the account has more than one candidate workflow, so the checklist's
 * guidance stays coherent (locked decision #4). Native <select> styled with
 * the surface tokens — small control, full keyboard/AT support for free.
 */
export function OnboardingWorkflowPicker({
  options,
  selectedId,
  disabled,
  onSelect,
}: {
  options: readonly OnboardingWorkflowOptionDTO[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (workflowId: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <label className="flex items-center gap-2 px-4 pb-1 pt-2 text-xs text-muted-foreground">
      <span className="flex-none font-medium">Working on</span>
      <select
        data-testid="onboarding-workflow-picker"
        value={selectedId ?? ""}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value && e.target.value !== selectedId) {
            onSelect(e.target.value);
          }
        }}
        className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { Button } from "@/components/ui/button";

/**
 * Slice 4.AI-DIAG-QA-AUTOROUTE-1 (CS-2) — render the intent-clarification bubble.
 *
 * Shown when the one Builder AI composer's deterministic router returns `clarify`
 * (mutation-capable but ambiguous intent). Pure presentational: fixed copy + two
 * quick actions. It echoes NO user text, ids, config, or secrets. It has NO
 * Apply / Preview / Save / Run control — both actions only choose a ROUTE for the
 * retained prompt (the actual Q&A vs planner routing is wired in CS-3); until then
 * the parent's callbacks mark the choice resolved (resolve-once, like chat-fill).
 */
export function IntentClarificationBody({
  resolved,
  onExplain,
  onPlan,
}: {
  /** True once a choice has been made (both buttons disable). */
  readonly resolved: boolean;
  /** Explicit-click handler — route the retained prompt to read-only Q&A (CS-3). */
  readonly onExplain: () => void;
  /** Explicit-click handler — route the retained prompt to the planner (CS-3). */
  readonly onPlan: () => void;
}) {
  return (
    <div data-testid="builder-ai-intent-clarification" className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--builder-text)" }}>
        I can explain what&rsquo;s wrong, or I can plan changes to fix it. Which do you want?
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onExplain}
          disabled={resolved}
          data-testid="builder-ai-clarify-explain"
          className="h-7 text-xs"
        >
          Explain the issue
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPlan}
          disabled={resolved}
          data-testid="builder-ai-clarify-plan"
          className="h-7 text-xs"
        >
          Plan a fix
        </Button>
      </div>
    </div>
  );
}

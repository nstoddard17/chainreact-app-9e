"use client";

import { useRef, type ReactNode } from "react";
import type { AgentReadinessBlocker } from "@/core/workflows/agentReadiness";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided Configure stage body.
 *
 * Walks the remaining setup ONE node at a time with visible progress
 * ("Step 2 of 3"), rendering the EXISTING in-rail node setup card
 * (`BuilderNodeSetupCard` via the builder's `renderNodeSetup` wiring — the
 * same structured controls, option resolvers, recovery states, and
 * draft-write path the Check-workflow flow uses). When the current node's
 * required fields are filled, it drops out of `targets` and the next node
 * becomes current automatically — advancement IS the readiness recompute,
 * not a parallel cursor.
 *
 * Progress denominator: targets resolve and DISAPPEAR as the user works, so
 * the section accumulates the ids it has seen this mount. That is display
 * memory only (never truth): a reload restarts the count at the honest
 * remaining set.
 *
 * When no field targets remain but configure-stage blockers persist (broken
 * `{{...}}` references), it says so honestly and routes to the issues rail —
 * no dead controls, no pretending a picker exists for a deleted step.
 */

export interface GuidedConfigureSectionProps {
  /** Nodes with missing required fields, graph order (live, shrinks as fixed). */
  readonly targets: readonly CheckWorkflowSetupTarget[];
  /** Render the existing node setup card for a target set (builder wiring). */
  readonly renderNodeSetup: (targets: readonly CheckWorkflowSetupTarget[]) => ReactNode;
  /** Configure-stage blockers from the snapshot (for the no-targets case). */
  readonly configureBlockers: readonly AgentReadinessBlocker[];
  /** Open the issues rail (secondary detailed surface). */
  readonly onOpenIssues?: () => void;
}

export function GuidedConfigureSection({
  targets,
  renderNodeSetup,
  configureBlockers,
  onOpenIssues,
}: GuidedConfigureSectionProps) {
  // Display-only progress memory: every target id seen while this section is
  // mounted. Remaining = current targets; done = seen − remaining.
  const seenRef = useRef<Set<string>>(new Set());
  for (const t of targets) seenRef.current.add(t.nodeId);
  const total = seenRef.current.size;
  const done = total - targets.length;

  if (targets.length === 0) {
    // Configure stage with no field targets ⇒ unresolved-variable work.
    return (
      <div data-testid="guided-configure-variables">
        <p className="text-[11px]" style={{ color: "var(--builder-text)" }}>
          {configureBlockers[0]?.message ??
            "A field references a step that no longer exists."}
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--builder-muted)" }}>
          {configureBlockers[0]?.nextStep ??
            "Re-pick the value from an existing step, or clear it."}
          {onOpenIssues ? (
            <>
              {" "}
              <button
                type="button"
                data-testid="guided-configure-variables-open-issues"
                onClick={onOpenIssues}
                className="underline"
                style={{ color: "var(--builder-accent)" }}
              >
                Open setup issues
              </button>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  const current = targets[0]!;
  return (
    <div data-testid="guided-configure-body">
      <p
        className="text-[11px]"
        data-testid="guided-configure-progress"
        style={{ color: "var(--builder-muted)" }}
      >
        {total > 1
          ? `Step ${done + 1} of ${total}: set up ${current.label}.`
          : `One step left: set up ${current.label}.`}
        {done > 0 ? ` (${done} of ${total} configured)` : ""}
      </p>
      {/* The existing setup card, scoped to the CURRENT node only. */}
      {renderNodeSetup([current])}
      {targets.length > 1 ? (
        <p className="mt-1 text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
          Next up:{" "}
          {targets
            .slice(1, 4)
            .map((t) => t.label)
            .join(", ")}
          {targets.length > 4 ? "…" : ""}
        </p>
      ) : null}
    </div>
  );
}

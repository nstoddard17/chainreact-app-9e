"use client";

import type { ReactNode } from "react";
import type {
  AgentReadinessBlocker,
  AgentReadinessBlockerKind,
  AgentReadinessStatus,
  AgentReadinessVerdict,
} from "@/core/workflows/agentReadiness";

/**
 * REACT-AGENT-READINESS-1 — the readiness verdict header shown at the top of the
 * React Agent "Review changes" rail (and, compactly, after an apply).
 *
 * It answers ONE question for the user: "what is left before this can run?" — a
 * status pill (Not ready / Ready to test / Ready to activate / Blocked), a
 * one-line summary, blockers GROUPED BY TYPE each with its next step, any
 * non-blocking warnings, and a "Ready after" checklist of concrete next steps.
 *
 * Presentational ONLY: no store/fetch/service. Every value arrives in `verdict`
 * (already redacted by `computeAgentReadiness` — labels / counts / enums only,
 * never config values, secrets, tokens, or credential identities). Renders nothing
 * for an `unknown` (no-change) verdict.
 */

export interface AgentReadinessSummaryProps {
  readonly verdict: AgentReadinessVerdict;
  /** Compact variant (post-apply notice): status + summary only, no group detail. */
  readonly compact?: boolean;
}

const STATUS_TONE: Record<AgentReadinessStatus, { bg: string; fg: string }> = {
  ready_to_activate: { bg: "var(--builder-success-bg, rgba(21,128,61,0.12))", fg: "var(--builder-success, #15803d)" },
  ready_to_test: { bg: "var(--builder-accent-bg, rgba(2,132,199,0.12))", fg: "var(--builder-accent, #0284c7)" },
  not_ready: { bg: "var(--builder-warning-bg, rgba(180,83,9,0.12))", fg: "var(--builder-warning, #b45309)" },
  blocked: { bg: "var(--builder-danger-bg, rgba(185,28,28,0.12))", fg: "var(--builder-danger, #b91c1c)" },
  unknown: { bg: "var(--builder-panel-2)", fg: "var(--builder-muted)" },
};

/** Blocker groups, in display order. Each renders only when it has ≥1 blocking blocker. */
const BLOCKER_GROUPS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly kinds: ReadonlyArray<AgentReadinessBlockerKind>;
}> = [
  { id: "fields", title: "Missing required fields", kinds: ["missing_required_field"] },
  { id: "connection", title: "App connections", kinds: ["missing_connection", "invalid_connection"] },
  { id: "variables", title: "Unresolved variables", kinds: ["unresolved_variable"] },
  { id: "structure", title: "Structure & activation", kinds: ["invalid_graph", "lifecycle_warning", "activation_blocked"] },
  { id: "test", title: "Test", kinds: ["test_failed"] },
  { id: "other", title: "Other setup", kinds: ["setup_warning", "unknown"] },
];

export function AgentReadinessSummary({ verdict, compact }: AgentReadinessSummaryProps) {
  if (verdict.status === "unknown") return null;

  const tone = STATUS_TONE[verdict.status];
  const blocking = verdict.blockers;
  // "Ready after" — the deduped next steps from blockers, then the positive action.
  const readyAfter = dedupe([
    ...blocking.map((b) => b.nextStep),
    ...(verdict.status === "ready_to_test" ? ["Run a test to confirm it works."] : []),
    ...(verdict.status === "ready_to_activate" ? ["Activate the workflow when you're ready."] : []),
  ]);

  return (
    <section
      data-testid="agent-readiness"
      data-status={verdict.status}
      className="flex flex-col gap-2 rounded-md border p-2.5"
      style={{ borderColor: "var(--builder-border)", background: "var(--builder-panel-2)" }}
    >
      <div className="flex items-center gap-2">
        <span
          data-testid="agent-readiness-pill"
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {verdict.title}
        </span>
      </div>

      {verdict.summary ? (
        <p data-testid="agent-readiness-summary" className="text-[12px]" style={{ color: "var(--builder-text)" }}>
          {verdict.summary}
        </p>
      ) : null}

      {!compact && blocking.length > 0 ? (
        <div data-testid="agent-readiness-blockers" className="flex flex-col gap-2">
          {BLOCKER_GROUPS.map((group) => {
            const items = blocking.filter((b) => group.kinds.includes(b.kind));
            if (items.length === 0) return null;
            return (
              <BlockerGroup key={group.id} groupId={group.id} title={group.title} items={items} />
            );
          })}
        </div>
      ) : null}

      {!compact && verdict.warnings.length > 0 ? (
        <div data-testid="agent-readiness-warnings" className="flex flex-col gap-1">
          <GroupHeading>Heads up</GroupHeading>
          <ul className="ml-3 list-disc">
            {verdict.warnings.map((w, i) => (
              <li
                key={`warn-${w.kind}-${i}`}
                className="text-[11.5px]"
                style={{ color: "var(--builder-muted)" }}
              >
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && readyAfter.length > 0 ? (
        <div data-testid="agent-readiness-next" className="flex flex-col gap-1">
          <GroupHeading>{blocking.length > 0 ? "Ready after" : "Next"}</GroupHeading>
          <ul className="ml-3 list-disc">
            {readyAfter.map((step, i) => (
              <li
                key={`next-${i}`}
                data-testid="agent-readiness-next-step"
                className="text-[11.5px]"
                style={{ color: "var(--builder-text)" }}
              >
                {step}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function BlockerGroup({
  groupId,
  title,
  items,
}: {
  readonly groupId: string;
  readonly title: string;
  readonly items: readonly AgentReadinessBlocker[];
}) {
  return (
    <div data-testid={`agent-readiness-group-${groupId}`}>
      <GroupHeading>{title}</GroupHeading>
      <ul className="mt-0.5 ml-3 list-disc">
        {items.map((b, i) => (
          <li
            key={`${b.kind}-${b.nodeId ?? ""}-${b.fieldPath ?? ""}-${i}`}
            data-testid="agent-readiness-blocker"
            className="text-[11.5px]"
            style={{ color: "var(--builder-text)" }}
          >
            <span style={{ color: "var(--builder-warning, #b45309)" }}>{b.message}</span>
            {b.nodeLabel ? (
              <span style={{ color: "var(--builder-muted)" }}> · {b.nodeLabel}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupHeading({ children }: { readonly children: ReactNode }) {
  return (
    <h4
      className="text-[10.5px] font-semibold uppercase tracking-wide"
      style={{ color: "var(--builder-muted)" }}
    >
      {children}
    </h4>
  );
}

function dedupe(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

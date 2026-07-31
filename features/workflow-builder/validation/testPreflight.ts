import type { BuilderValidationIssue } from "./collectBuilderValidationIssues";

/**
 * WORKFLOW-LIVE-TEST-2 §2 — the shared pre-flight both testing modes run FIRST.
 *
 * Every way of executing a workflow from the builder — Safe Test (dry run) and Run Live Test
 * (consented real execution) — begins with the SAME canonical validation. When it fails, nothing
 * happens externally: no provider call, no run row, no trigger polling. The user gets an
 * actionable summary instead of a silent return or a disabled button whose only explanation is a
 * tooltip nobody hovers.
 *
 * This module is deliberately tiny and pure: it turns the issue list the builder already computes
 * (`collectBuilderValidationIssues`) into the copy + the focusable item list the run controls
 * render. It introduces NO second ruleset — readiness stays owned by `core/workflows`, so the
 * top-level Ready indicator, the per-node "Needs setup" badge, the issues rail, and this pre-flight
 * can never disagree.
 *
 * Only `severity: "error"` issues block. Warnings (a broken variable reference) are surfaced by the
 * issues rail but must not prevent a user from testing — blocking on a soft signal would make the
 * button feel broken for a reason the user can't act on decisively.
 */

/** One blocking item, already resolved to what the user must open and fix. */
export interface TestPreflightItem {
  /** Stable id (mirrors the underlying validation issue id) for React keys. */
  readonly id: string;
  /** Author-facing description of what is missing. */
  readonly message: string;
  /** The step to open, when the issue belongs to one. Absent for graph-level issues. */
  readonly nodeId?: string;
  /** The field inside that step to focus, when the issue names one. */
  readonly fieldName?: string;
  /** Author-facing label of that field ("Spreadsheet"), when known. */
  readonly fieldLabel?: string;
}

export interface TestPreflightOk {
  readonly ok: true;
}

export interface TestPreflightBlocked {
  readonly ok: false;
  /** Number of blocking setup items. */
  readonly issueCount: number;
  /** Headline copy, e.g. "Finish 4 setup items before testing this workflow." */
  readonly summary: string;
  /** The blocking items, in the order the issues rail lists them. */
  readonly items: readonly TestPreflightItem[];
}

export type TestPreflightResult = TestPreflightOk | TestPreflightBlocked;

/**
 * Headline for a blocked test attempt. Singular/plural is handled explicitly because
 * "1 setup items" reads as a bug to a careful user.
 */
export function testPreflightSummary(issueCount: number): string {
  return issueCount === 1
    ? "Finish 1 setup item before testing this workflow."
    : `Finish ${issueCount} setup items before testing this workflow.`;
}

/**
 * Evaluate the pre-flight from the builder's canonical validation issues.
 *
 * Pure. Callers pass the SAME issue list the header pill and the issues rail consume, so a user can
 * never see "Ready" next to a blocked test button.
 */
export function evaluateTestPreflight(
  issues: readonly BuilderValidationIssue[],
): TestPreflightResult {
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length === 0) return { ok: true };
  return {
    ok: false,
    issueCount: blocking.length,
    summary: testPreflightSummary(blocking.length),
    items: blocking.map((issue) => ({
      id: issue.id,
      message: issue.message,
      ...(issue.nodeId !== undefined ? { nodeId: issue.nodeId } : {}),
      ...(issue.fieldName !== undefined ? { fieldName: issue.fieldName } : {}),
      ...(issue.fieldLabel !== undefined ? { fieldLabel: issue.fieldLabel } : {}),
    })),
  };
}

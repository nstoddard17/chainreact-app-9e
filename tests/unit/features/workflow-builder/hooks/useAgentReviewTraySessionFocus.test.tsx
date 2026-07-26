/**
 * REACT-AGENT-REVIEW-RECOVERY-MERGE-1 — the seam between the two merged slices.
 *
 * The review tray opens EXPANDED when a review session starts (REACT-AGENT-REVIEW-TRAY-UX-1). The
 * resolver-recovery slice added an apply that is ITSELF a navigation ("Add to draft & open step" on
 * a preview-only node): it applies the preview AND reveals a specific field. Combined naively, that
 * apply starts a new session, so the tray would expand right over the field it had just sent the
 * user to — re-creating the exact problem the tray was built to solve.
 *
 * A session that already navigated to a field must therefore open COLLAPSED with that issue
 * selected, while every ordinary apply still opens expanded.
 */
import { act, renderHook } from "@testing-library/react";
import { useAgentReviewTray } from "@/features/workflow-builder/hooks/useAgentReviewTray";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";

function issue(nodeId: string, fieldPath: string): AgentSetupIssue {
  return {
    id: `missing_required_field:${nodeId}:${fieldPath}`,
    kind: "missing_required_field",
    nodeId,
    nodeLabel: `Node ${nodeId}`,
    fieldLabel: fieldPath,
    blocking: true,
    explanation: `${fieldPath} is required.`,
    nextStep: `Open Node ${nodeId} and set ${fieldPath}.`,
    focusTarget: { nodeId, fieldPath },
  } as unknown as AgentSetupIssue;
}

const issues = [issue("n1", "formId"), issue("n2", "audience_id")];

describe("review tray — session that starts already navigated to a field", () => {
  it("an ordinary apply opens the tray EXPANDED with nothing selected", () => {
    const { result } = renderHook(
      ({ token }) => useAgentReviewTray({ issues, sessionToken: token }),
      { initialProps: { token: 1 } },
    );
    expect(result.current.expanded).toBe(true);
    expect(result.current.selectedIssueId).toBeNull();
    expect(result.current.summary.remaining).toBe(2);
  });

  it("'Add to draft & open step' opens the tray COLLAPSED on the field it navigated to", () => {
    const { result } = renderHook(
      ({ token }) =>
        useAgentReviewTray({
          issues,
          sessionToken: token,
          sessionFocus: { nodeId: "n2", fieldKey: "audience_id" },
        }),
      { initialProps: { token: 7 } },
    );
    expect(result.current.expanded).toBe(false);
    // The collapsed bar can name the field being edited.
    expect(result.current.selectedIssue?.focusTarget?.fieldPath).toBe("audience_id");
    // Collapsing is presentation only — the session is intact.
    expect(result.current.items).toHaveLength(2);
    expect(result.current.summary.remaining).toBe(2);
  });

  it("falls back to EXPANDED when the focus target matches no issue", () => {
    const { result } = renderHook(() =>
      useAgentReviewTray({
        issues,
        sessionToken: 3,
        sessionFocus: { nodeId: "node-that-has-no-issue", fieldKey: "whatever" },
      }),
    );
    expect(result.current.expanded).toBe(true);
    expect(result.current.selectedIssueId).toBeNull();
  });

  it("a LATER session re-evaluates the focus (collapsed → expanded and back)", () => {
    const { result, rerender } = renderHook(
      ({ token, focus }: { token: number; focus: { nodeId: string; fieldKey?: string } | null }) =>
        useAgentReviewTray({ issues, sessionToken: token, sessionFocus: focus }),
      {
        initialProps: {
          token: 1,
          focus: { nodeId: "n1", fieldKey: "formId" } as { nodeId: string; fieldKey?: string } | null,
        },
      },
    );
    expect(result.current.expanded).toBe(false);

    // A plain Apply next: new session, no focus → expanded again.
    rerender({ token: 2, focus: null });
    expect(result.current.expanded).toBe(true);
    expect(result.current.selectedIssueId).toBeNull();

    // Another focused apply: collapsed on the new field.
    rerender({ token: 3, focus: { nodeId: "n2", fieldKey: "audience_id" } });
    expect(result.current.expanded).toBe(false);
    expect(result.current.selectedIssue?.focusTarget?.nodeId).toBe("n2");
  });

  it("issue churn WITHIN a focused session never re-expands the tray", () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: readonly AgentSetupIssue[] }) =>
        useAgentReviewTray({
          issues: list,
          sessionToken: 5,
          sessionFocus: { nodeId: "n2", fieldKey: "audience_id" },
        }),
      { initialProps: { list: issues } },
    );
    expect(result.current.expanded).toBe(false);

    // The user fills the field they were sent to — the live list drops that issue.
    rerender({ list: [issues[0]!] });
    expect(result.current.expanded).toBe(false); // count updates, tray does NOT reopen
    expect(result.current.summary.remaining).toBe(1);
    // Resolved item stays in place and is marked resolved (no list jump).
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[1]!.resolved).toBe(true);
    // Selection survives so the compact bar still names what was being edited.
    expect(result.current.selectedIssue?.focusTarget?.fieldPath).toBe("audience_id");
  });

  it("expanding a focused session keeps the selected issue (presentation only)", () => {
    const { result } = renderHook(() =>
      useAgentReviewTray({
        issues,
        sessionToken: 9,
        sessionFocus: { nodeId: "n1", fieldKey: "formId" },
      }),
    );
    const before = result.current.selectedIssueId;
    act(() => result.current.expand());
    expect(result.current.expanded).toBe(true);
    expect(result.current.selectedIssueId).toBe(before);
    expect(result.current.items).toHaveLength(2);
  });
});

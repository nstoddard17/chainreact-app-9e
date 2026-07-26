import { act, renderHook } from "@testing-library/react";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import { useAgentReviewTray } from "@/features/workflow-builder/hooks/useAgentReviewTray";

/**
 * REACT-AGENT-REVIEW-TRAY-UX-1 — the tray's PRESENTATION state.
 *
 * The point of these tests is the separation the slice requires: collapsing is a
 * presentation change and NOTHING else. The item list, the selected issue, and the
 * remembered scroll offset all survive a collapse/expand round-trip; only a NEW
 * review session (a changed session token) resets them.
 */

function issue(over: Partial<AgentSetupIssue> = {}): AgentSetupIssue {
  return {
    id: "missing_required_field:n1:form",
    kind: "missing_required_field",
    workflowId: "wf1",
    nodeId: "n1",
    nodeLabel: "New Response in Form",
    actionLabel: "New Response in Form",
    fieldPath: "form",
    fieldLabel: "Form",
    message: "New Response in Form needs a Form.",
    explanation: "React added this step but didn't have enough information to fill this in safely.",
    nextStep: "Open the Form field and fill it in.",
    blocking: true,
    focusTarget: { nodeId: "n1", fieldPath: "form" },
    ...over,
  };
}

const form = issue();
const audience = issue({
  id: "missing_required_field:n2:audience",
  nodeId: "n2",
  nodeLabel: "Add Subscriber",
  actionLabel: "Add Subscriber",
  fieldPath: "audience",
  fieldLabel: "Audience",
  message: "Add Subscriber needs an Audience.",
});

function setup(issues: readonly AgentSetupIssue[] = [form, audience], sessionToken = 1) {
  return renderHook(
    ({ issues: i, sessionToken: t }) => useAgentReviewTray({ issues: i, sessionToken: t }),
    { initialProps: { issues, sessionToken } },
  );
}

describe("useAgentReviewTray", () => {
  it("starts EXPANDED with every live issue unresolved", () => {
    const { result } = setup();
    expect(result.current.expanded).toBe(true);
    expect(result.current.summary).toMatchObject({ total: 2, remaining: 2, status: "blocked" });
    expect(result.current.selectedIssueId).toBeNull();
  });

  it("collapses and expands manually without touching the review session", () => {
    const { result } = setup();
    act(() => result.current.collapse());
    expect(result.current.expanded).toBe(false);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.summary.remaining).toBe(2);

    act(() => result.current.expand());
    expect(result.current.expanded).toBe(true);
    expect(result.current.items).toHaveLength(2);
  });

  it("selecting an issue records it AND collapses the tray", () => {
    const { result } = setup();
    act(() => result.current.selectIssue(form.id));
    expect(result.current.expanded).toBe(false);
    expect(result.current.selectedIssueId).toBe(form.id);
    expect(result.current.selectedIssue?.fieldLabel).toBe("Form");
  });

  it("keeps the selected issue across a collapse/expand round-trip", () => {
    const { result } = setup();
    act(() => result.current.selectIssue(audience.id));
    act(() => result.current.expand());
    expect(result.current.selectedIssueId).toBe(audience.id);
    act(() => result.current.collapse());
    expect(result.current.selectedIssueId).toBe(audience.id);
  });

  it("preserves the remembered scroll offset across collapse/expand", () => {
    const { result } = setup();
    act(() => result.current.rememberScrollTop(148));
    act(() => result.current.collapse());
    act(() => result.current.expand());
    expect(result.current.getScrollTop()).toBe(148);
  });

  it("drops a fixed field from the remaining count while STAYING collapsed", () => {
    const { result, rerender } = setup();
    act(() => result.current.selectIssue(form.id));
    expect(result.current.expanded).toBe(false);

    // The user fills in the Form field → the live rule stops reporting that issue.
    rerender({ issues: [audience], sessionToken: 1 });

    expect(result.current.expanded).toBe(false); // never re-opens on its own
    expect(result.current.summary).toMatchObject({ total: 2, remaining: 1, resolved: 1 });
    expect(result.current.items[0]).toMatchObject({ resolved: true });
    expect(result.current.items[1]).toMatchObject({ resolved: false });
    expect(result.current.selectedIssueId).toBe(form.id); // progress is not lost
  });

  it("reaches the ready state once every issue is resolved", () => {
    const { result, rerender } = setup();
    rerender({ issues: [], sessionToken: 1 });
    expect(result.current.summary).toMatchObject({ total: 2, remaining: 0, status: "ready" });
  });

  it("does NOT reset presentation state when the issue list merely churns", () => {
    const { result, rerender } = setup();
    act(() => result.current.selectIssue(form.id));
    act(() => result.current.rememberScrollTop(90));
    // Same session, a re-derived array with the same content (the live memo recomputes).
    rerender({ issues: [{ ...form }, { ...audience }], sessionToken: 1 });
    expect(result.current.expanded).toBe(false);
    expect(result.current.selectedIssueId).toBe(form.id);
    expect(result.current.getScrollTop()).toBe(90);
  });

  it("resets to a fresh expanded session when a NEW session token arrives", () => {
    const { result, rerender } = setup();
    act(() => result.current.selectIssue(form.id));
    act(() => result.current.rememberScrollTop(200));

    rerender({ issues: [audience], sessionToken: 2 });

    expect(result.current.expanded).toBe(true);
    expect(result.current.selectedIssueId).toBeNull();
    expect(result.current.getScrollTop()).toBe(0);
    // The previous session's resolved history is gone — this is a new review.
    expect(result.current.items.map((i) => i.issue.id)).toEqual([audience.id]);
  });
});

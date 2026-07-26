import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import { BuilderApplyNotice } from "@/features/workflow-builder/canvas/BuilderApplyNotice";

/**
 * REACT-AGENT-REVIEW-TRAY-UX-1 — the post-approval review tray.
 *
 * Behavior under test: it opens expanded, collapses (manually, by Escape, and
 * automatically when an issue is selected) into a compact bar that still states
 * what is unresolved, and re-expands with the list, the selection, and the scroll
 * offset intact. Collapsing is presentation only — the review is never dismissed.
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

const NOTICE = "Preview applied to draft — review required fields before saving or activating.";

function renderTray(
  props: Partial<ComponentProps<typeof BuilderApplyNotice>> = {},
) {
  const onOpenIssue = jest.fn();
  const onDismiss = jest.fn();
  const utils = render(
    <BuilderApplyNotice
      notice={NOTICE}
      setupIssues={[form, audience]}
      sessionToken={1}
      onOpenIssue={onOpenIssue}
      onDismiss={onDismiss}
      {...props}
    />,
  );
  return { ...utils, onOpenIssue, onDismiss };
}

function rowFor(fieldPath: string): HTMLElement {
  const row = screen
    .getAllByTestId("builder-setup-needed-issue")
    .find((el) => el.getAttribute("data-field-path") === fieldPath);
  if (!row) throw new Error(`no issue row for ${fieldPath}`);
  return row;
}

describe("BuilderApplyNotice — review tray", () => {
  it("opens EXPANDED with the notice, the blocked status, the count, and the issue list", () => {
    renderTray();
    expect(screen.getByTestId("builder-review-tray-expanded")).toBeInTheDocument();
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent("Preview applied to draft");
    expect(screen.getByTestId("builder-review-tray-status")).toHaveTextContent("Blocked");
    expect(screen.getByTestId("builder-review-tray-remaining")).toHaveTextContent("2 issues remaining");
    expect(screen.getByTestId("builder-setup-needed")).toHaveTextContent("New Response in Form needs a Form.");
    expect(screen.getByTestId("builder-setup-needed-blocking")).toHaveTextContent("2 to fix before active");
  });

  it("collapses and expands manually, keeping the review alive either way", async () => {
    const user = userEvent.setup();
    const { onDismiss } = renderTray();

    await user.click(screen.getByTestId("builder-review-tray-collapse"));
    expect(screen.queryByTestId("builder-review-tray-expanded")).not.toBeInTheDocument();
    const bar = screen.getByTestId("builder-review-tray-collapsed");
    // Never an invisible icon — the compact bar still states blocked + remaining.
    expect(bar).toHaveTextContent("Blocked");
    expect(bar).toHaveTextContent("2 issues remaining");
    expect(onDismiss).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("builder-review-tray-expand"));
    expect(screen.getByTestId("builder-review-tray-expanded")).toBeInTheDocument();
    expect(screen.getAllByTestId("builder-setup-needed-issue")).toHaveLength(2);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("selecting an issue calls the existing open-and-highlight path and auto-collapses", async () => {
    const user = userEvent.setup();
    const { onOpenIssue } = renderTray();

    await user.click(rowFor("audience"));

    expect(onOpenIssue).toHaveBeenCalledTimes(1);
    expect(onOpenIssue.mock.calls[0]![0]).toMatchObject({ nodeId: "n2", fieldPath: "audience" });
    expect(screen.queryByTestId("builder-review-tray-expanded")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-review-tray-collapsed")).toBeInTheDocument();
  });

  it("names the issue being edited on the collapsed bar, and keeps it selected on re-expand", async () => {
    const user = userEvent.setup();
    renderTray();
    await user.click(rowFor("audience"));
    expect(screen.getByTestId("builder-review-tray-current")).toHaveTextContent("Editing Audience");

    await user.click(screen.getByTestId("builder-review-tray-expand"));
    expect(rowFor("audience")).toHaveAttribute("data-selected", "true");
    expect(rowFor("form")).toHaveAttribute("data-selected", "false");
  });

  it("restores the remembered scroll offset when the list is shown again", async () => {
    const user = userEvent.setup();
    renderTray();
    const list = screen.getByTestId("builder-review-tray-list");
    // jsdom has no layout, so drive the scroll value explicitly and fire the handler.
    Object.defineProperty(list, "scrollTop", { value: 132, writable: true, configurable: true });
    list.dispatchEvent(new Event("scroll", { bubbles: true }));

    await user.click(screen.getByTestId("builder-review-tray-collapse"));
    await user.click(screen.getByTestId("builder-review-tray-expand"));

    // The restore effect re-applies the remembered offset (mirrored for observability).
    expect(screen.getByTestId("builder-review-tray-list")).toHaveAttribute("data-scroll-top", "132");
  });

  it("marks an issue the live list stopped reporting as Resolved, in place, and drops the count", () => {
    const { rerender } = renderTray();
    rerender(
      <BuilderApplyNotice
        notice={NOTICE}
        setupIssues={[audience]}
        sessionToken={1}
        onOpenIssue={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    const rows = screen.getAllByTestId("builder-setup-needed-issue");
    expect(rows).toHaveLength(2); // resolved rows stay in place — the list never jumps
    expect(rows[0]).toHaveAttribute("data-resolved", "true");
    expect(rows[1]).toHaveAttribute("data-resolved", "false");
    expect(screen.getByTestId("builder-review-tray-remaining")).toHaveTextContent("1 issue remaining");
    expect(screen.getByTestId("builder-setup-needed-blocking")).toHaveTextContent("1 to fix before active");
    expect(screen.getByTestId("builder-setup-needed-resolved")).toBeInTheDocument();
  });

  it("switches to the ready state once every issue is resolved", () => {
    const { rerender } = renderTray();
    rerender(
      <BuilderApplyNotice
        notice={NOTICE}
        setupIssues={[]}
        sessionToken={1}
        onOpenIssue={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByTestId("builder-review-tray-status")).toHaveTextContent("Ready");
    expect(screen.getByTestId("builder-review-tray-status")).toHaveAttribute("data-status", "ready");
    expect(screen.getByTestId("builder-review-tray-remaining")).toHaveTextContent("All setup complete");
    expect(screen.queryByTestId("builder-setup-needed-blocking")).not.toBeInTheDocument();
  });

  it("resets to a fresh expanded review when a NEW session token arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = renderTray();
    await user.click(screen.getByTestId("builder-review-tray-collapse"));
    rerender(
      <BuilderApplyNotice
        notice="Change applied to your draft — review required fields before saving or activating."
        setupIssues={[form]}
        sessionToken={2}
        onOpenIssue={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByTestId("builder-review-tray-expanded")).toBeInTheDocument();
    expect(screen.getAllByTestId("builder-setup-needed-issue")).toHaveLength(1);
  });

  describe("accessibility", () => {
    it("labels both toggles and reports the expanded state", async () => {
      const user = userEvent.setup();
      renderTray();
      const collapse = screen.getByRole("button", { name: "Collapse review" });
      expect(collapse).toHaveAttribute("aria-expanded", "true");
      expect(collapse).toHaveAttribute("aria-controls", "builder-review-tray-list");

      await user.click(collapse);
      const expand = screen.getByRole("button", { name: "Expand review" });
      expect(expand).toHaveAttribute("aria-expanded", "false");
    });

    it("moves focus to the compact tray on collapse and back to Collapse on expand", async () => {
      const user = userEvent.setup();
      renderTray();
      await user.click(screen.getByTestId("builder-review-tray-collapse"));
      expect(screen.getByTestId("builder-review-tray-expand")).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByTestId("builder-review-tray-collapse")).toHaveFocus();
    });

    it("Escape collapses the tray but never discards the review or its progress", async () => {
      const user = userEvent.setup();
      const { onDismiss } = renderTray();
      await user.click(rowFor("form"));
      await user.click(screen.getByTestId("builder-review-tray-expand"));

      screen.getByTestId("builder-review-tray-collapse").focus();
      await user.keyboard("{Escape}");

      expect(screen.getByTestId("builder-review-tray-collapsed")).toBeInTheDocument();
      expect(onDismiss).not.toHaveBeenCalled();
      // The review session and the in-progress selection survive.
      expect(screen.getByTestId("builder-review-tray-remaining")).toHaveTextContent("2 issues remaining");
      expect(screen.getByTestId("builder-review-tray-current")).toHaveTextContent("Editing Form");
    });

    it("announces the remaining count through ONE persistent polite live region", async () => {
      const user = userEvent.setup();
      renderTray();
      const live = screen.getByTestId("builder-review-tray-live");
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(live).toHaveTextContent("Blocked · 2 issues remaining");
      // Collapsing is not a content change — the same region persists (no re-announce storm).
      await user.click(screen.getByTestId("builder-review-tray-collapse"));
      expect(screen.getAllByTestId("builder-review-tray-live")).toHaveLength(1);
      expect(screen.getByTestId("builder-review-tray-live")).toHaveTextContent("Blocked · 2 issues remaining");
    });
  });

  describe("layout", () => {
    it("anchors to the canvas edge with a capped width and its own bounded scroll area", () => {
      renderTray();
      const root = screen.getByTestId("builder-apply-notice");
      // Left-anchored + width-capped: it can never span the builder or reach the
      // right-hand configuration panel, at desktop or narrow builder widths.
      expect(root.className).toContain("left-3");
      expect(root.className).toContain("max-w-[calc(100%-1.5rem)]");
      // The list scrolls inside itself (bounded height, contained overscroll) rather
      // than growing the tray until it dominates the canvas.
      const list = screen.getByTestId("builder-review-tray-list");
      expect(list.className).toContain("overflow-y-auto");
      expect(list.className).toContain("overscroll-contain");
      expect(screen.getByTestId("builder-review-tray-expanded").className).toContain("max-h-[62vh]");
    });

    it("shrinks to a compact bar with no scroll area at all when collapsed", async () => {
      const user = userEvent.setup();
      renderTray();
      await user.click(screen.getByTestId("builder-review-tray-collapse"));
      expect(screen.queryByTestId("builder-review-tray-list")).not.toBeInTheDocument();
      expect(screen.getByTestId("builder-review-tray-collapsed").className).toContain("rounded-full");
    });
  });

  it("stays the plain transient confirmation when the change left nothing to review", () => {
    renderTray({ setupIssues: [] });
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent("Preview applied to draft");
    expect(screen.queryByTestId("builder-review-tray-expanded")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-review-tray-collapsed")).not.toBeInTheDocument();
  });

  it("never renders a config value (the read-model is label-only), collapsed or expanded", async () => {
    const user = userEvent.setup();
    renderTray();
    const root = screen.getByTestId("builder-apply-notice");
    expect(root.textContent ?? "").not.toMatch(/token|secret|xox|Bearer|password/i);
    await user.click(screen.getByTestId("builder-review-tray-collapse"));
    expect(screen.getByTestId("builder-apply-notice").textContent ?? "").not.toMatch(
      /token|secret|xox|Bearer|password/i,
    );
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderApplyNotice } from "@/features/workflow-builder/canvas/BuilderApplyNotice";

/**
 * BUILDER-ISSUES-RAIL-1 — the post-apply confirmation, reduced from a review tray to a toast.
 *
 * The collapsible tray that used to live here carried the whole "Setup needed" list over the
 * canvas — the same gaps the issues rail reports, from the same rules. That list now lives ONLY in
 * the rail. What this component must still do is acknowledge that the apply happened, and it must
 * do it WITHOUT reintroducing a panel: no issue list, no status pill, no expand/collapse, and
 * nothing that can sit over a config field the user is trying to fill.
 */

const NOTICE = "Preview applied to draft — review required fields before saving or activating.";

describe("BuilderApplyNotice", () => {
  it("renders the notice as a dismissible status toast", () => {
    render(<BuilderApplyNotice notice={NOTICE} onDismiss={jest.fn()} />);
    const el = screen.getByTestId("builder-apply-notice");
    expect(el).toHaveTextContent(NOTICE);
    expect(el).toHaveAttribute("role", "status");
    expect(screen.getByTestId("builder-apply-notice-dismiss")).toBeInTheDocument();
  });

  it("calls onDismiss when dismissed", async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(<BuilderApplyNotice notice={NOTICE} onDismiss={onDismiss} />);
    await user.click(screen.getByTestId("builder-apply-notice-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // The regression this batch exists to prevent: a second issues surface growing back here.
  it("is never a review panel — no issue list, no status pill, no expand/collapse", () => {
    render(<BuilderApplyNotice notice={NOTICE} onDismiss={jest.fn()} />);
    expect(screen.queryByTestId("builder-setup-needed")).toBeNull();
    expect(screen.queryByTestId("builder-review-tray-expanded")).toBeNull();
    expect(screen.queryByTestId("builder-review-tray-collapsed")).toBeNull();
    expect(screen.queryByTestId("builder-review-tray-status")).toBeNull();
    expect(screen.queryByTestId("builder-review-tray-collapse")).toBeNull();
    expect(screen.queryByTestId("builder-review-tray-expand")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("does not cover the canvas centre or the right-hand config panel", () => {
    render(<BuilderApplyNotice notice={NOTICE} onDismiss={jest.fn()} />);
    // Anchored to the bottom-left corner and width-capped — never a centred overlay.
    const className = screen.getByTestId("builder-apply-notice").className;
    expect(className).toContain("absolute");
    expect(className).toContain("bottom-3");
    expect(className).toContain("left-3");
  });
});

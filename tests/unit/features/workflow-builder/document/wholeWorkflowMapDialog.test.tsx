import { render, screen, fireEvent } from "@testing-library/react";
import { WholeWorkflowMap } from "@/features/workflow-builder/document/WholeWorkflowMap";
import type { WholeWorkflowMap as MapModel } from "@/features/workflow-builder/document/wholeWorkflowMapModel";

/**
 * 5.DUAL-BUILDER-1 CS-7D — regression for the live-browser defect the flag-on
 * journey exposed: the Whole Workflow map dialog did NOT close on Escape,
 * because the dialog container was never focused on open, so the `onKeyDown`
 * Escape handler never received the key (focus stayed on the opener button
 * outside the dialog subtree). The fix focuses the dialog on mount (matching
 * GuidedStopEditor). jsdom can't reproduce the ORIGINAL browser failure (it
 * dispatches keydown directly on the node), so this test locks the ROOT CAUSE:
 * the dialog is focused on mount, which is what makes Escape work live.
 */

const EMPTY_MAP: MapModel = { rows: [] };

describe("WholeWorkflowMap dialog (CS-7D Escape/focus regression)", () => {
  it("restores focus to the opener on close (CS-7E a11y regression)", () => {
    // The opener button is focused (as it would be right after a click opens the map).
    const opener = document.createElement("button");
    opener.setAttribute("data-testid", "opener");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(
      <WholeWorkflowMap map={EMPTY_MAP} activeNodeId={null} onClose={() => {}} onSelectRow={() => {}} />,
    );
    // On open, focus moves INTO the dialog.
    expect(document.activeElement).toBe(
      screen.getByRole("dialog", { name: "Whole workflow map" }),
    );
    // On close (unmount), focus RETURNS to the opener.
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("focuses the dialog container on mount so Escape works in a real browser", () => {
    render(
      <WholeWorkflowMap
        map={EMPTY_MAP}
        activeNodeId={null}
        onClose={() => {}}
        onSelectRow={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Whole workflow map" });
    expect(dialog).toHaveAttribute("tabindex", "-1");
    // The container itself holds focus → Escape keydown lands inside the dialog.
    expect(document.activeElement).toBe(dialog);
  });

  it("closes on Escape via the focused container", () => {
    const onClose = jest.fn();
    render(
      <WholeWorkflowMap
        map={EMPTY_MAP}
        activeNodeId={null}
        onClose={onClose}
        onSelectRow={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Whole workflow map" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still closes via the explicit close button", () => {
    const onClose = jest.fn();
    render(
      <WholeWorkflowMap
        map={EMPTY_MAP}
        activeNodeId={null}
        onClose={onClose}
        onSelectRow={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close whole workflow map" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

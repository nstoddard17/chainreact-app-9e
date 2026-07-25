/**
 * BUILDER-TABS-HEADER-1 — CanvasActionBar is now canvas-only chrome: the
 * env/trigger/node-count tags + the "+ Add action" CTA. The section tab
 * segment (Builder | Runs | Data Map | History | Settings) moved to the
 * header-level BuilderTabStrip (see layout/BuilderTabs.test.tsx).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasActionBar } from "@/features/workflow-builder/canvas/CanvasActionBar";

describe("CanvasActionBar", () => {
  it("renders no section tabs (they live in the header tab strip now)", () => {
    render(<CanvasActionBar nodeCountText="2 nodes" />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("renders the env/count tags and an enabled Add action CTA", async () => {
    const user = userEvent.setup();
    const onAddAction = jest.fn();
    render(
      <CanvasActionBar
        nodeCountText="2 nodes · 1 edge"
        triggerTagText="trigger: slack"
        onAddAction={onAddAction}
        canAddAction
      />,
    );
    expect(screen.getByText("env: draft")).toBeInTheDocument();
    expect(screen.getByText("trigger: slack")).toBeInTheDocument();
    expect(screen.getByText("2 nodes · 1 edge")).toBeInTheDocument();
    await user.click(screen.getByTestId("canvas-add-action-button"));
    expect(onAddAction).toHaveBeenCalledTimes(1);
  });

  it("disables the Add action CTA when canAddAction is false", () => {
    render(
      <CanvasActionBar nodeCountText="0 nodes" onAddAction={jest.fn()} canAddAction={false} />,
    );
    expect(screen.getByTestId("canvas-add-action-button")).toBeDisabled();
  });
});

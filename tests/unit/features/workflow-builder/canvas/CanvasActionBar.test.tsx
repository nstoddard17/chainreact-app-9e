/**
 * BUILDER-TABS-HEADER-1 / BUILDER-CANVAS-CHROME-TRIM-1 — CanvasActionBar is
 * now minimal canvas chrome: just the right-aligned "+ Add action" CTA. The
 * section tab segment moved to the header-level BuilderTabStrip (see
 * layout/BuilderTabs.test.tsx), and the env/trigger/node-count tag cluster
 * was removed (it restated what the header + canvas already show).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasActionBar } from "@/features/workflow-builder/canvas/CanvasActionBar";

describe("CanvasActionBar", () => {
  it("renders no section tabs (they live in the header tab strip now)", () => {
    render(<CanvasActionBar />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("renders NO env/trigger/count tags — the bar is just the Add action CTA", async () => {
    const user = userEvent.setup();
    const onAddAction = jest.fn();
    render(<CanvasActionBar onAddAction={onAddAction} canAddAction />);
    expect(screen.queryByText(/env: draft/)).toBeNull();
    expect(screen.queryByText(/trigger:/)).toBeNull();
    expect(screen.queryByText(/node/)).toBeNull();
    await user.click(screen.getByTestId("canvas-add-action-button"));
    expect(onAddAction).toHaveBeenCalledTimes(1);
  });

  it("disables the Add action CTA when canAddAction is false", () => {
    render(<CanvasActionBar onAddAction={jest.fn()} canAddAction={false} />);
    expect(screen.getByTestId("canvas-add-action-button")).toBeDisabled();
  });
});

/**
 * Tests for features/workflow-builder/canvas/EmptyCanvasState.
 *
 * EmptyCanvasState (Slice 4.BUILDER-CANVAS-1) is a leaf presentational
 * component. The canvas decides WHEN to render it (when pendingNodes is
 * empty — see WorkflowCanvas); WorkflowBuilder wires the CTA callback to
 * the existing "+ Add trigger" button via a ref bridge. This file
 * targets the leaf in isolation.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyCanvasState } from "@/features/workflow-builder/canvas/EmptyCanvasState";

describe("EmptyCanvasState", () => {
  it("renders the 'Choose a trigger' CTA, heading, and supporting copy", () => {
    render(<EmptyCanvasState />);
    expect(
      screen.getByRole("button", { name: /choose a trigger/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /choose a trigger/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/every workflow starts with a trigger/i),
    ).toBeInTheDocument();
  });

  it("invokes onAddTrigger when the CTA is clicked", async () => {
    const user = userEvent.setup();
    const onAddTrigger = jest.fn();
    render(<EmptyCanvasState onAddTrigger={onAddTrigger} />);
    await user.click(
      screen.getByRole("button", { name: /choose a trigger/i }),
    );
    expect(onAddTrigger).toHaveBeenCalledTimes(1);
  });

  it("is safe to click without an onAddTrigger handler (no throw)", async () => {
    const user = userEvent.setup();
    render(<EmptyCanvasState />);
    await user.click(
      screen.getByRole("button", { name: /choose a trigger/i }),
    );
    // No throw, no unhandled error — the assertion is "render still here".
    expect(
      screen.getByRole("button", { name: /choose a trigger/i }),
    ).toBeInTheDocument();
  });

  it("exposes a stable testid + landmark so the canvas integration test can locate it", () => {
    render(<EmptyCanvasState />);
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/empty workflow canvas/i),
    ).toBeInTheDocument();
  });
});

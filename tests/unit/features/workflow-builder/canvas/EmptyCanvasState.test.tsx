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
    // Slice 4.BUILDER-DESIGN-PARITY-1 — copy reads "begins with a trigger"
    // per the Anthropic ChainV2 empty-state body (was "starts with a
    // trigger" in CANVAS-1). The regex is loose enough to survive minor
    // copy iteration without spurious failures.
    expect(
      screen.getByText(/every workflow begins with a trigger/i),
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

/**
 * BUILDER-EMPTY-STATE-TEMPLATES-1 / BUILDER-CANVAS-CHROME-TRIM-1 — the
 * "Import from template" entry is WIRED when the builder provides the
 * callback (disabled honestly on the local-only builder), and the old
 * "Describe to AI" placeholder is gone (the React Agent rail is that entry).
 */
describe("EmptyCanvasState — templates entry + trimmed placeholders", () => {
  it("fires onImportTemplate when wired (signed-in builder)", async () => {
    const user = userEvent.setup();
    const onImportTemplate = jest.fn();
    render(<EmptyCanvasState onAddTrigger={jest.fn()} onImportTemplate={onImportTemplate} />);
    const button = screen.getByTestId("empty-canvas-import-template");
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onImportTemplate).toHaveBeenCalledTimes(1);
  });

  it("renders the template button disabled with an honest note when not wired (local-only)", () => {
    render(<EmptyCanvasState onAddTrigger={jest.fn()} />);
    const button = screen.getByTestId("empty-canvas-import-template");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/sign in/i));
  });

  it("no longer renders a 'Describe to AI' button", () => {
    render(<EmptyCanvasState onAddTrigger={jest.fn()} onImportTemplate={jest.fn()} />);
    expect(screen.queryByText(/describe to ai/i)).toBeNull();
  });
});

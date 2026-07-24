/**
 * DOC-FINAL-ACCEPTANCE-1 — the shared destructive-apply confirmation component.
 *
 * Proves the accessibility contract used by BOTH surfaces: role=alertdialog with
 * a labelled title + description, focus enters on the safe default, Escape and
 * Cancel fire onCancel (focus returns to the opener), the destructive Apply is
 * clearly marked, and the consequence is stated in TEXT (not color alone).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DestructiveApplyConfirm } from "@/features/workflow-builder/panels/DestructiveApplyConfirm";

describe("DestructiveApplyConfirm", () => {
  const cls = { removedStepCount: 2, removedConnectionCount: 1 };

  it("is an alertdialog with a labelled title + description and the shared copy", () => {
    render(
      <DestructiveApplyConfirm classification={cls} onCancel={() => {}} onConfirm={() => {}} />,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Apply destructive change?");
    expect(dialog).toHaveAttribute("aria-describedby");
    // Consequence is in text, not color alone.
    expect(screen.getByTestId("destructive-apply-removal")).toHaveTextContent(
      "Removes 2 steps and 1 connection.",
    );
    expect(screen.getByTestId("destructive-apply-cancel")).toHaveTextContent("Keep my workflow");
    expect(screen.getByTestId("destructive-apply-accept")).toHaveTextContent("Apply removal");
    // The destructive action is machine-markable (not color-only).
    expect(screen.getByTestId("destructive-apply-accept")).toHaveAttribute("data-destructive", "true");
  });

  it("focuses the safe default (Cancel) on open", () => {
    render(
      <DestructiveApplyConfirm classification={cls} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId("destructive-apply-cancel")).toHaveFocus();
  });

  it("Escape and Cancel both fire onCancel; Apply fires onConfirm", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const { rerender } = render(
      <DestructiveApplyConfirm classification={cls} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <DestructiveApplyConfirm classification={cls} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    await user.click(screen.getByTestId("destructive-apply-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(2);
    await user.click(screen.getByTestId("destructive-apply-accept"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener when it unmounts (Cancel)", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
            open
          </button>
          {open ? (
            <DestructiveApplyConfirm
              classification={cls}
              onCancel={() => setOpen(false)}
              onConfirm={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    await user.click(opener);
    // Dialog opened + focused its safe default.
    expect(screen.getByTestId("destructive-apply-cancel")).toHaveFocus();
    await user.click(screen.getByTestId("destructive-apply-cancel"));
    // Focus restored to the opener on unmount.
    expect(opener).toHaveFocus();
  });

  it("respects a custom testId prefix (distinct ids per host surface)", () => {
    render(
      <DestructiveApplyConfirm
        classification={cls}
        testIdPrefix="agent-apply-mode-destructive"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("agent-apply-mode-destructive-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("agent-apply-mode-destructive-accept")).toBeInTheDocument();
  });
});

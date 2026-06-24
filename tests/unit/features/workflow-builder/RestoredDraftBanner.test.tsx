/**
 * ANON-BUILDER-3 Scope C — post-restore next-action banner.
 *
 * Proves: correct copy per reason, dismiss hides it, and it offers NO control
 * that could auto-save/activate/run/connect (only an informational message + a
 * dismiss button).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestoredDraftBanner } from "@/features/workflow-builder/panels/RestoredDraftBanner";

const CASES: Array<[Parameters<typeof RestoredDraftBanner>[0]["reason"], RegExp]> = [
  ["save", /restored and saved.*keep editing or activate/i],
  ["activate", /restored.*review the required fields, then activate/i],
  ["run", /restored.*save\/activate or run when ready/i],
  ["connect", /restored.*connect the required app/i],
  ["ai", /restored.*continue with React Agent/i],
];

describe("RestoredDraftBanner", () => {
  it.each(CASES)("renders the correct copy for reason=%s", (reason, copy) => {
    render(<RestoredDraftBanner reason={reason} onDismiss={() => {}} />);
    const banner = screen.getByTestId("restored-draft-banner");
    expect(banner).toHaveAttribute("data-reason", reason);
    expect(banner).toHaveTextContent(copy);
  });

  it("dismiss fires the callback", async () => {
    const onDismiss = jest.fn();
    render(<RestoredDraftBanner reason="save" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByTestId("restored-draft-banner-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("offers no auto-action controls (only the dismiss button)", () => {
    render(<RestoredDraftBanner reason="activate" onDismiss={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("data-testid", "restored-draft-banner-dismiss");
    // No links either — nothing that could navigate to run/activate/connect.
    expect(screen.queryByRole("link")).toBeNull();
  });
});

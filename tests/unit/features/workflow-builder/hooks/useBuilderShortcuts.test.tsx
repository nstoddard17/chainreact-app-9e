/**
 * Tests for features/workflow-builder/hooks/useBuilderShortcuts.
 *
 * useBuilderShortcuts (Slice 4.BUILDER-UI-SHELL-1) currently owns Cmd/Ctrl+S
 * → onSave with preventDefault. Modifier guards (shift / alt) and the
 * unmount listener cleanup are part of the contract — future slices may
 * extend this hook with Esc + undo/redo, so we lock the current behavior in.
 */
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBuilderShortcuts } from "@/features/workflow-builder/hooks/useBuilderShortcuts";

function Harness({ onSave }: { onSave?: () => void }) {
  useBuilderShortcuts({ onSave });
  return null;
}

describe("useBuilderShortcuts", () => {
  it("invokes onSave on Cmd+S (mac)", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await user.keyboard("{Meta>}s{/Meta}");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("invokes onSave on Ctrl+S (windows / linux)", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await user.keyboard("{Control>}s{/Control}");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("ignores Cmd+Shift+S (falls through to whatever the browser binds)", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await user.keyboard("{Meta>}{Shift>}s{/Shift}{/Meta}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores Cmd+Alt+S", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await user.keyboard("{Meta>}{Alt>}s{/Alt}{/Meta}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores other keys with a modifier", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await user.keyboard("{Meta>}p{/Meta}");
    await user.keyboard("{Meta>}z{/Meta}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores plain S with no modifier", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    await user.keyboard("s");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("preventDefault is called so the browser's save-page dialog never fires", () => {
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    const event = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !document.dispatchEvent(event);
    expect(prevented).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("removes the listener on unmount", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    const { unmount } = render(<Harness onSave={onSave} />);
    unmount();
    await user.keyboard("{Meta>}s{/Meta}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("is safe to call without an onSave handler (still prevents default)", () => {
    render(<Harness />);
    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    expect(() => document.dispatchEvent(event)).not.toThrow();
    // browser default is still cancelled
    expect(event.defaultPrevented).toBe(true);
  });
});

/**
 * Shared helper for driving Radix Select fields (FieldMeta.type ===
 * "select") through real userEvent interaction inside RTL/jsdom.
 *
 * Background — why this exists.
 * ----------------------------------------------------------------
 * Radix Select portals its option list outside the trigger's DOM
 * subtree and calls pointer-capture APIs (`hasPointerCapture`,
 * `releasePointerCapture`, `setPointerCapture`) + `scrollIntoView`
 * which jsdom does not implement. Without those polyfills,
 * `userEvent.click` on the trigger throws and the menu never opens.
 *
 * Those polyfills live in `jest.setup.ts` (project-wide) so any test
 * can drive a Radix Select. With them in place, the natural
 * `click trigger → click option` flow works exactly as a user would
 * perform it.
 *
 * Slice 3.18 (Outlook send_email config integration test) noted that
 * Radix Select interaction was a known jsdom gap and fell back to
 * `useConfigSlice.getState().updateField(...)` for the `importance`
 * field. Slice 3.19 (this slice) closes that gap with the polyfills
 * + helper below, so future provider config integration tests can
 * drive selects through real user actions.
 *
 * The unit tests for `SelectField` (closed-state shape, multi-select
 * guard, missing-options guard) still own those branches. This helper
 * is for *integration* tests that need to flow a value through the
 * select onto the configSlice draft.
 */

import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Open a Radix Select by its accessible name, click an option by its
 * visible label, and wait for the menu to close. Throws (via RTL's
 * standard query failures / `waitFor` timeout) if either the trigger
 * or the option cannot be found.
 *
 * Usage:
 *   await selectFieldOption(user, /importance/i, "High");
 *
 * Parameters:
 *  - `user`: a `userEvent` instance from `userEvent.setup()`.
 *  - `triggerName`: accessible name (string | RegExp) of the trigger,
 *    matching `getByRole("combobox", { name: triggerName })`. The Radix
 *    Select trigger exposes `role="combobox"` even though it is
 *    technically a listbox-style picker — this matches the precedent
 *    in `SelectField.test.tsx`.
 *  - `optionLabel`: visible label (string | RegExp) of the option to
 *    pick.
 *  - `opts.container`: optional scope. Pass the modal `HTMLElement`
 *    when several selects with the same accessible name might be in
 *    the document at once (e.g. multiple action configs open). Falls
 *    back to `screen` (document scope) by default.
 *
 * Returns when the menu has closed (no `option` role remaining in the
 * document), so callers can immediately assert downstream state.
 */
export async function selectFieldOption(
  user: UserEvent,
  triggerName: string | RegExp,
  optionLabel: string | RegExp,
  opts: { container?: HTMLElement } = {},
): Promise<void> {
  const scope = opts.container ? within(opts.container) : screen;
  const trigger = scope.getByRole("combobox", { name: triggerName });
  await user.click(trigger);

  // The option list is portaled to document.body, so it lives outside
  // `scope`. Query against `screen` regardless of the container hint.
  await waitFor(() => {
    if (screen.queryAllByRole("option").length === 0) {
      throw new Error(
        `selectFieldOption: option list never opened for trigger '${String(triggerName)}'`,
      );
    }
  });

  const option = screen.getByRole("option", { name: optionLabel });
  await user.click(option);

  // Wait for Radix to tear down the portal so subsequent queries don't
  // see a stale listbox.
  await waitFor(() => {
    if (screen.queryAllByRole("option").length !== 0) {
      throw new Error("selectFieldOption: option list did not close");
    }
  });
}

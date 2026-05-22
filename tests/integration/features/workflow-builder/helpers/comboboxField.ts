/**
 * Shared helper for driving the async `ComboboxField` (Slice 3.31)
 * through real userEvent interaction inside RTL/jsdom.
 *
 * Mirrors `./selectField.ts` for Radix Select. Differences:
 *   - ComboboxField is a Popover + cmdk Command. The trigger button
 *     carries `role="combobox"`; cmdk items render with
 *     `role="option"`. Selection is `click trigger → click option`.
 *   - The list contents are driven by `useOptionsSource`, which the
 *     calling test is responsible for mocking (via the typed client
 *     at `@/lib/api/options`). The helper makes no assumption about
 *     the data source — it just clicks through whatever shows up.
 *
 * Polyfills (`hasPointerCapture` / `releasePointerCapture` /
 * `setPointerCapture` / `scrollIntoView`) already live in
 * `jest.setup.ts` for Radix Select; they cover the Popover trigger
 * too, so no extra setup is required here.
 */

import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Open a ComboboxField, optionally type a search query, click an
 * option by its visible label, and wait for the popover to tear down.
 *
 * Usage:
 *   await pickComboboxOption(user, /channel/i, "#general");
 *   await pickComboboxOption(user, /channel/i, "#general", { search: "eng" });
 *
 * Parameters:
 *  - `user`: a `userEvent` instance from `userEvent.setup()`.
 *  - `triggerName`: accessible name (string | RegExp) of the trigger,
 *    matching `getByRole("combobox", { name: triggerName })`.
 *  - `optionLabel`: visible label of the option to pick. Matched via
 *    `screen.findByRole("option", { name: optionLabel })` against the
 *    portaled popover surface.
 *  - `opts.container`: optional scope for finding the trigger. The
 *    popover itself portals to document.body so option queries always
 *    go through `screen`.
 *  - `opts.search`: optional search query typed into the popover's
 *    CommandInput before selecting. Useful when the resolver returns
 *    many items and the test wants to assert the search wiring.
 */
export async function pickComboboxOption(
  user: UserEvent,
  triggerName: string | RegExp,
  optionLabel: string | RegExp,
  opts: { container?: HTMLElement; search?: string } = {},
): Promise<void> {
  const scope = opts.container ? within(opts.container) : screen;
  const trigger = scope.getByRole("combobox", { name: triggerName });
  await user.click(trigger);

  if (opts.search !== undefined && opts.search.length > 0) {
    const searchInput = await screen.findByPlaceholderText(/search/i);
    await user.clear(searchInput);
    await user.type(searchInput, opts.search);
  }

  // The cmdk popover portals to document.body; query off `screen`.
  // For string labels we substring-match (cmdk options carry both label
  // + description in their accessible name); for RegExp we delegate to
  // the caller's pattern.
  const nameMatcher =
    typeof optionLabel === "string"
      ? new RegExp(optionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      : optionLabel;
  const option = await screen.findByRole("option", { name: nameMatcher });
  await user.click(option);

  // Wait for the popover to tear down so subsequent queries don't see
  // a stale listbox.
  await waitFor(() => {
    if (screen.queryAllByRole("option").length !== 0) {
      throw new Error("pickComboboxOption: popover did not close");
    }
  });
}

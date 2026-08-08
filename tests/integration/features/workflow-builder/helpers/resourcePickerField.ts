import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Helper for `resourcePicker`-backed config fields
 * (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
 *
 * The Google Sheets `spreadsheetId` field used to be an async combobox backed
 * by a Drive-enumerating resolver (which forced the restricted
 * `drive.metadata.readonly` scope). It is now a text input plus a "Choose from
 * Google Drive" button: the user normally picks in Google's own UI, and the
 * pick is what grants ChainReact access to that one file.
 *
 * These builder integration tests exercise the DOWNSTREAM contract (draft →
 * modal save → workflow save), so they drive the field through its
 * committed-value path — the same value the picker itself commits — and assert
 * the picker affordance is present. The picker's own flow (session minting,
 * MIME filtering, cancel, and every failure/recovery state) is covered
 * end-to-end in
 * `tests/unit/features/workflow-builder/config-modal/fields/resourcePicker.test.tsx`.
 */
export async function setResourcePickerValue(
  user: UserEvent,
  fieldName: string,
  fieldLabel: RegExp,
  value: string,
): Promise<void> {
  // The picker affordance must exist — a bare text box would mean the user has
  // to go find a provider id by hand, which is exactly what this field must
  // never require.
  expect(screen.getByTestId(`resource-picker-${fieldName}`)).toBeInTheDocument();

  const input = screen.getByRole("textbox", { name: fieldLabel });
  await user.click(input);
  // Clear first so re-picking REPLACES the previous resource (the picker
  // commits a whole value; it never appends), which is what the
  // "changing the spreadsheet drops the stale tab" cascade relies on.
  await user.clear(input);
  await user.paste(value);
  await waitFor(() => expect(input).toHaveValue(value));
}

/** Convenience wrapper for the Google Sheets spreadsheet field. */
export async function setSpreadsheetId(
  user: UserEvent,
  spreadsheetId: string,
): Promise<void> {
  await setResourcePickerValue(user, "spreadsheetId", /^spreadsheet$/i, spreadsheetId);
}

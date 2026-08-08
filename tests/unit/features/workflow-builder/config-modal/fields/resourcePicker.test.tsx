/**
 * GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2 — "Choose from Google Drive" widget.
 *
 * The picker replaces a resolver-backed dropdown whose server-side enumeration
 * required a RESTRICTED Drive scope. These tests pin the product contract: the
 * selection commits the provider's stable id, the input is never stranded, and
 * failures explain themselves.
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchPickerSession = jest.fn();
jest.mock("@/lib/api/pickerSession", () => ({
  fetchPickerSession: (...a: unknown[]) => mockFetchPickerSession(...a),
}));

const mockOpenResourcePicker = jest.fn();
jest.mock(
  "@/features/workflow-builder/config-modal/fields/googlePickerLoader",
  () => ({
    openResourcePicker: (...a: unknown[]) => mockOpenResourcePicker(...a),
  }),
);

import { ResourcePickerButton } from "@/features/workflow-builder/config-modal/fields/ResourcePickerButton";

function renderButton(onPicked = jest.fn()) {
  render(
    <ResourcePickerButton
      picker="google-sheets:spreadsheet"
      fieldLabel="Spreadsheet"
      fieldName="spreadsheetId"
      workflowId="wf-1"
      nodeId="node-1"
      onPicked={onPicked}
    />,
  );
  return onPicked;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchPickerSession.mockResolvedValue({
    ok: true,
    accessToken: "ya29.TOKEN",
    appId: "111",
    apiKey: "key",
    mimeType: "application/vnd.google-apps.spreadsheet",
  });
  mockOpenResourcePicker.mockResolvedValue({ id: "SHEET_ID_1", name: "Q3 Pipeline" });
});

describe("ResourcePickerButton", () => {
  it("commits the picked provider resource id to the field", async () => {
    const onPicked = renderButton();
    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    await waitFor(() => expect(onPicked).toHaveBeenCalledWith("SHEET_ID_1"));
  });

  it("filters the picker to spreadsheets using the server-supplied MIME type", async () => {
    renderButton();
    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    await waitFor(() => expect(mockOpenResourcePicker).toHaveBeenCalled());
    expect(mockOpenResourcePicker.mock.calls[0]![0]).toMatchObject({
      mimeType: "application/vnd.google-apps.spreadsheet",
    });
  });

  it("threads workflow + node context so the server applies the credential-sharing policy", async () => {
    renderButton();
    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    await waitFor(() => expect(mockFetchPickerSession).toHaveBeenCalled());
    expect(mockFetchPickerSession.mock.calls[0]![0]).toMatchObject({
      picker: "google-sheets:spreadsheet",
      workflowId: "wf-1",
      nodeId: "node-1",
    });
  });

  it("leaves the value untouched when the user cancels the picker", async () => {
    mockOpenResourcePicker.mockResolvedValue(null);
    const onPicked = renderButton();

    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    await waitFor(() => expect(mockOpenResourcePicker).toHaveBeenCalled());
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("explains a disconnected integration and names the recovery (Apps), not a bare failure", async () => {
    mockFetchPickerSession.mockResolvedValue({
      ok: false,
      code: "INTEGRATION_NOT_CONNECTED",
      message: "Connect your Google Sheets account to choose a file.",
    });
    const onPicked = renderButton();

    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    const err = await screen.findByTestId("resource-picker-spreadsheetId-error");
    expect(err.textContent).toMatch(/Connect your Google Sheets account/i);
    expect(err.textContent).toMatch(/Apps/);
    expect(onPicked).not.toHaveBeenCalled();
    expect(mockOpenResourcePicker).not.toHaveBeenCalled();
  });

  it("tells a non-owner to ask the workflow owner (never silently empty)", async () => {
    mockFetchPickerSession.mockResolvedValue({
      ok: false,
      code: "NOT_WORKFLOW_OWNER",
      message: "This step runs under the workflow owner's connection.",
    });
    renderButton();

    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    const err = await screen.findByTestId("resource-picker-spreadsheetId-error");
    expect(err.textContent).toMatch(/owner/i);
  });

  it("falls back to pasting the ID when the picker is not configured for the environment", async () => {
    mockFetchPickerSession.mockResolvedValue({
      ok: false,
      code: "PICKER_NOT_CONFIGURED",
      message: "not configured",
    });
    renderButton();

    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    const err = await screen.findByTestId("resource-picker-spreadsheetId-error");
    expect(err.textContent).toMatch(/paste the ID/i);
  });

  it("recovers from a picker script failure without stranding the field", async () => {
    mockOpenResourcePicker.mockRejectedValue(new Error("picker-script"));
    const onPicked = renderButton();

    await userEvent.click(screen.getByTestId("resource-picker-spreadsheetId"));

    const err = await screen.findByTestId("resource-picker-spreadsheetId-error");
    expect(err.textContent).toMatch(/Try again, or paste the ID/i);
    expect(onPicked).not.toHaveBeenCalled();
    // The button returns to an idle, clickable state.
    await waitFor(() =>
      expect(screen.getByTestId("resource-picker-spreadsheetId")).not.toBeDisabled(),
    );
  });
});

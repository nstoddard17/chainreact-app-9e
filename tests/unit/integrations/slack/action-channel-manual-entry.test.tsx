/**
 * CS-2b — the real Slack action channel field (e.g. send_channel_message)
 * renders as a searchable combobox where a power user can paste an exact id,
 * while selecting a resolver option still stores the channel id. Drives the
 * actual meta field through ComboboxField with a mocked resolver.
 */
const mockUseOptionsSource = jest.fn();
const mockRefetch = jest.fn();

jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...args: unknown[]) => mockUseOptionsSource(...args),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComboboxField } from "@/features/workflow-builder/config-modal/fields/ComboboxField";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { listActionMetasForProvider } from "@/services/discovery/_registry";
import type { FieldMeta } from "@/contracts/actionMeta";

const channelField: FieldMeta = (() => {
  const meta = listActionMetasForProvider("slack").find(
    (m) => m.key === "slack:send_channel_message",
  );
  const f = meta?.fields.find((x) => x.optionsSource === "slack:channels");
  if (!f) throw new Error("send_channel_message channel field not found");
  return f;
})();

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockRefetch.mockReset();
  useGraphSlice.getState().reset();
});

it("the real send_channel_message channel field opts into manual entry", () => {
  expect(channelField.type).toBe("combobox");
  expect(channelField.optionsSource).toBe("slack:channels");
  expect(channelField.allowManualEntry).toBe(true);
});

it("pasting an exact channel id commits it via onChange (manual entry)", async () => {
  mockUseOptionsSource.mockReturnValue({
    state: { status: "empty", items: [], hasMore: false },
    refetch: mockRefetch,
  });
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(<ComboboxField field={channelField} value="" onChange={onChange} />);
  await user.click(screen.getByRole("combobox", { name: /channel/i }));
  await user.type(await screen.findByPlaceholderText(/search channels/i), "C0PASTED99");
  await user.click(await screen.findByTestId("combobox-manual-entry"));
  expect(onChange).toHaveBeenCalledWith("C0PASTED99");
});

it("selecting a resolver option still stores the channel id (label shows #name)", async () => {
  mockUseOptionsSource.mockReturnValue({
    state: {
      status: "ready",
      items: [{ value: "C100", label: "#general" }],
      hasMore: false,
    },
    refetch: mockRefetch,
  });
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(<ComboboxField field={channelField} value="" onChange={onChange} />);
  await user.click(screen.getByRole("combobox", { name: /channel/i }));
  await user.click(await screen.findByText("#general"));
  expect(onChange).toHaveBeenCalledWith("C100");
});

it("an existing saved channel id hydrates on the trigger without crashing", () => {
  mockUseOptionsSource.mockReturnValue({
    state: { status: "ready", items: [{ value: "C100", label: "#general" }], hasMore: false },
    refetch: mockRefetch,
  });
  render(<ComboboxField field={channelField} value="C-SAVED-7" onChange={jest.fn()} />);
  expect(screen.getByRole("combobox", { name: /channel/i })).toHaveTextContent("C-SAVED-7");
});

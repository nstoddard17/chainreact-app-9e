/**
 * BUILDER-VIEW-DEFAULT-1 — the shared default-builder-view selector (Account
 * settings Profile row + builder Settings tab). Pins: loads the stored value,
 * offers the three honest options (Ask each time / Visual / Document),
 * saves optimistically ("ask" → null), and reverts with an error message
 * when the save fails.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGet = jest.fn();
const mockUpdate = jest.fn();
jest.mock("@/lib/api/accounts", () => ({
  getDefaultBuilderView: (...a: unknown[]) => mockGet(...a),
  updateDefaultBuilderView: (...a: unknown[]) => mockUpdate(...a),
}));

import { DefaultBuilderViewControl } from "@/features/account/DefaultBuilderViewControl";

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue("document");
  mockUpdate.mockReset().mockImplementation(async (v) => v);
});

describe("DefaultBuilderViewControl", () => {
  it("loads and shows the stored default with all three options", async () => {
    render(<DefaultBuilderViewControl />);
    const select = screen.getByTestId("default-builder-view-select");
    await waitFor(() => expect(select).toHaveValue("document"));
    const labels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(labels).toEqual([
      "Ask each time (on new workflows)",
      "Visual builder",
      "Document builder",
    ]);
  });

  it("shows 'Ask each time' when no default is stored (null)", async () => {
    mockGet.mockResolvedValue(null);
    render(<DefaultBuilderViewControl />);
    await waitFor(() =>
      expect(screen.getByTestId("default-builder-view-select")).toHaveValue("ask"),
    );
  });

  it("saves a change ('ask' maps to null) and confirms", async () => {
    const user = userEvent.setup();
    render(<DefaultBuilderViewControl />);
    const select = screen.getByTestId("default-builder-view-select");
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, "ask");
    expect(mockUpdate).toHaveBeenCalledWith(null);
    expect(await screen.findByTestId("default-builder-view-saved")).toBeInTheDocument();
    await user.selectOptions(select, "visual");
    expect(mockUpdate).toHaveBeenCalledWith("visual");
  });

  it("reverts and reports when the save fails", async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(new Error("offline"));
    render(<DefaultBuilderViewControl />);
    const select = screen.getByTestId("default-builder-view-select");
    await waitFor(() => expect(select).toHaveValue("document"));
    await user.selectOptions(select, "visual");
    expect(await screen.findByTestId("default-builder-view-error")).toBeInTheDocument();
    expect(select).toHaveValue("document");
  });
});

/**
 * Tests for features/account/ProfileSection (Slice 4.ACCOUNT-SETTINGS-3).
 *
 * The first functional Account-settings section: read-only email + an editable
 * display name saved via the typed client. The client is mocked — we assert the
 * save call, the success/error states, the dirty-gating, and the length cap.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSection } from "@/features/account/ProfileSection";

const mockUpdate = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  class AccountApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "VALIDATION", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    AccountApiError,
    updateDisplayName: (...a: unknown[]) => mockUpdate(...a),
  };
});

import { AccountApiError } from "@/lib/api/accounts";

beforeEach(() => mockUpdate.mockReset());

function renderProfile(initialDisplayName: string | null = null) {
  return render(
    <ProfileSection email="me@x.io" role="owner" initialDisplayName={initialDisplayName} />,
  );
}

describe("ProfileSection", () => {
  it("renders the read-only email and seeds the display-name field", () => {
    renderProfile("Ada Lovelace");
    expect(screen.getByTestId("profile-email")).toHaveTextContent("me@x.io");
    expect(screen.getByTestId("profile-display-name-input")).toHaveValue("Ada Lovelace");
  });

  it("disables Save until the value changes (dirty gating)", async () => {
    const user = userEvent.setup();
    renderProfile("Ada");
    const save = screen.getByTestId("profile-display-name-save");
    expect(save).toBeDisabled();
    await user.type(screen.getByTestId("profile-display-name-input"), "x");
    expect(save).toBeEnabled();
  });

  it("saves the trimmed value, calls the client, and shows the success state", async () => {
    mockUpdate.mockResolvedValue({ displayName: "Grace Hopper" });
    const user = userEvent.setup();
    renderProfile("");
    await user.type(screen.getByTestId("profile-display-name-input"), "  Grace Hopper  ");
    await user.click(screen.getByTestId("profile-display-name-save"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("Grace Hopper"));
    expect(await screen.findByTestId("profile-display-name-saved")).toHaveTextContent(
      /display name saved/i,
    );
    // After save the field reflects the canonical stored value and is clean again.
    expect(screen.getByTestId("profile-display-name-input")).toHaveValue("Grace Hopper");
    expect(screen.getByTestId("profile-display-name-save")).toBeDisabled();
  });

  it("can clear the name (empty → save enabled, client called with empty string)", async () => {
    mockUpdate.mockResolvedValue({ displayName: null });
    const user = userEvent.setup();
    renderProfile("Ada");
    await user.clear(screen.getByTestId("profile-display-name-input"));
    const save = screen.getByTestId("profile-display-name-save");
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(""));
    expect(screen.getByTestId("profile-display-name-input")).toHaveValue("");
  });

  it("renders the error state when the save fails", async () => {
    mockUpdate.mockRejectedValue(
      new AccountApiError("Display name must be 80 characters or fewer.", "VALIDATION", 400),
    );
    const user = userEvent.setup();
    renderProfile("");
    await user.type(screen.getByTestId("profile-display-name-input"), "Nope");
    await user.click(screen.getByTestId("profile-display-name-save"));
    expect(await screen.findByTestId("profile-display-name-error")).toHaveTextContent(
      /80 characters or fewer/i,
    );
  });

  it("caps input length at 80 characters (maxLength)", () => {
    renderProfile("");
    expect(screen.getByTestId("profile-display-name-input")).toHaveAttribute("maxlength", "80");
  });
});

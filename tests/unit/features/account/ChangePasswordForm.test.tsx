/**
 * Tests for features/account/ChangePasswordForm (4.ACCOUNT-SETTINGS-7 / SEC-2).
 *
 * Inline change-password control inside the Security section. The client is
 * mocked — we assert open/close, the confirm-mismatch + min-length gating, the
 * success (fields clear + message) and error states.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";

const mockChange = jest.fn();
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
    changePassword: (...a: unknown[]) => mockChange(...a),
  };
});

import { AccountApiError } from "@/lib/api/accounts";

beforeEach(() => mockChange.mockReset());

async function openAndFill(
  user: ReturnType<typeof userEvent.setup>,
  { current = "old-pw", next = "longenough1", confirm = "longenough1" } = {},
) {
  await user.click(screen.getByTestId("security-change-password-open"));
  if (current) await user.type(screen.getByTestId("security-current-password"), current);
  if (next) await user.type(screen.getByTestId("security-new-password"), next);
  if (confirm) await user.type(screen.getByTestId("security-confirm-password"), confirm);
}

describe("ChangePasswordForm", () => {
  it("opens the inline form from the Change password button", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    expect(screen.queryByTestId("security-change-password-form")).toBeNull();
    await user.click(screen.getByTestId("security-change-password-open"));
    expect(screen.getByTestId("security-change-password-form")).toBeInTheDocument();
  });

  it("blocks save when the confirmation doesn't match", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await openAndFill(user, { confirm: "different1" });
    expect(screen.getByTestId("security-password-mismatch")).toBeInTheDocument();
    expect(screen.getByTestId("security-change-password-save")).toBeDisabled();
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("blocks save when the new password is too short", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await openAndFill(user, { next: "short", confirm: "short" });
    expect(screen.getByTestId("security-password-tooshort")).toBeInTheDocument();
    expect(screen.getByTestId("security-change-password-save")).toBeDisabled();
  });

  it("submits and shows the success message with fields cleared", async () => {
    mockChange.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await openAndFill(user);
    expect(screen.getByTestId("security-change-password-save")).toBeEnabled();
    await user.click(screen.getByTestId("security-change-password-save"));

    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith({ currentPassword: "old-pw", newPassword: "longenough1" }),
    );
    // Form collapses, success shows, and re-opening reveals cleared fields.
    expect(await screen.findByTestId("security-password-saved")).toBeInTheDocument();
    expect(screen.queryByTestId("security-change-password-form")).toBeNull();
    await user.click(screen.getByTestId("security-change-password-open"));
    expect(screen.getByTestId("security-current-password")).toHaveValue("");
    expect(screen.getByTestId("security-new-password")).toHaveValue("");
  });

  it("renders the backend error and keeps the form open", async () => {
    mockChange.mockRejectedValue(new AccountApiError("Password confirmation failed.", "UNAUTHENTICATED", 401));
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await openAndFill(user);
    await user.click(screen.getByTestId("security-change-password-save"));
    expect(await screen.findByTestId("security-password-error")).toHaveTextContent(
      /password confirmation failed/i,
    );
    expect(screen.getByTestId("security-change-password-form")).toBeInTheDocument();
  });
});

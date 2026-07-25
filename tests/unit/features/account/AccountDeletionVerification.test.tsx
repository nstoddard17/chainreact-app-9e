/**
 * Universal account-deletion confirmation UI
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * The defect this replaces: the deletion form demanded a ChainReact password, so
 * a user who signed up with Google or an email OTP could not delete their account
 * at all. These tests assert the fix at the level that matters to the user —
 * the SAME component, the SAME steps, and NO password field, whatever identity
 * the account was created with.
 *
 * They also cover every UI state the flow must express: sending, code sent,
 * incorrect, expired, locked, resend countdown, verified, final DELETE, scheduled,
 * and email-unavailable — plus the accessibility contract (labels, aria-live,
 * paste) and the guarantee that the code never survives the flow.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDeletionVerification } from "@/features/account/AccountDeletionVerification";
import { AccountDeletionError } from "@/lib/api/accounts";

const mockSendCode = jest.fn();
const mockVerifyCode = jest.fn();
const mockRequest = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  const actual = jest.requireActual("@/lib/api/accounts");
  return {
    ...actual,
    sendAccountDeletionCode: (...a: unknown[]) => mockSendCode(...a),
    verifyAccountDeletionCode: (...a: unknown[]) => mockVerifyCode(...a),
    requestAccountDeletion: (...a: unknown[]) => mockRequest(...a),
  };
});

const SENT = {
  maskedEmail: "c••••••••@gmail.com",
  expiresAt: "2026-07-24T12:10:00.000Z",
  // Far in the future so the countdown is deterministically active.
  resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
  codeLength: 6,
  maxAttempts: 5,
};

const onDeleted = jest.fn();
const onBlocked = jest.fn();
const onCancel = jest.fn();

beforeEach(() => {
  mockSendCode.mockReset().mockResolvedValue(SENT);
  mockVerifyCode
    .mockReset()
    .mockResolvedValue({ authorizationExpiresAt: "2026-07-24T12:05:00.000Z" });
  mockRequest.mockReset().mockResolvedValue({
    deletionStatus: "pending_deletion",
    requestedAt: "2026-07-24T12:00:00.000Z",
    purgeAfter: "2026-08-23T12:00:00.000Z",
    billingCancellation: "canceled",
  });
  onDeleted.mockReset();
  onBlocked.mockReset();
  onCancel.mockReset();
});

function renderFlow() {
  return render(
    <AccountDeletionVerification
      onDeleted={onDeleted}
      onBlocked={onBlocked}
      onCancel={onCancel}
    />,
  );
}

async function sendAndEnterCode(code = "123456") {
  fireEvent.click(screen.getByTestId("account-delete-send-code"));
  const input = await screen.findByTestId("account-delete-code-input");
  fireEvent.change(input, { target: { value: code } });
  fireEvent.click(screen.getByTestId("account-delete-verify-code"));
  return input;
}

/**
 * The universal contract. The component takes NO provider input, so every
 * "account type" below renders through exactly the same code path — which is the
 * point: there is nothing left that could behave differently per provider.
 */
describe("universal across every auth provider", () => {
  it.each([
    ["password account"],
    ["Google-only (OAuth) account"],
    ["email-OTP account"],
    ["multi-identity account (password + Google)"],
  ])("%s sees the same email-code flow and NO password field", async (_label) => {
    renderFlow();

    // Step 1 is always "send a code" — never "enter your password".
    expect(screen.getByTestId("account-delete-send-code")).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('input[autocomplete="current-password"]')).toBeNull();
    // No provider-specific reauthentication affordance of any kind.
    expect(screen.queryByText(/continue with google/i)).toBeNull();
    expect(screen.queryByText(/reauthenticate/i)).toBeNull();

    await sendAndEnterCode();
    await screen.findByTestId("account-delete-confirm-input");
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("explains that it works the same however the user signs in", () => {
    renderFlow();
    expect(screen.getByTestId("account-delete-form")).toHaveTextContent(
      /works the same however you sign in/i,
    );
  });
});

describe("send / code-sent states", () => {
  it("shows a sending state, then the MASKED destination — never the full address", async () => {
    let resolveSend: (v: typeof SENT) => void = () => {};
    mockSendCode.mockImplementationOnce(
      () => new Promise((r) => { resolveSend = r; }),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    expect(screen.getByTestId("account-delete-send-code")).toHaveTextContent(/sending code/i);

    await act(async () => { resolveSend(SENT); });

    const masked = await screen.findByTestId("account-delete-masked-email");
    expect(masked).toHaveTextContent("c••••••••@gmail.com");
    expect(screen.getByTestId("account-delete-form")).not.toHaveTextContent(
      /chainreactapp@gmail\.com/,
    );
  });

  it("announces the send result in a polite live region", async () => {
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    const status = await screen.findByTestId("account-delete-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/we sent a 6-digit code/i);
    expect(status).toHaveTextContent(/c••••••••@gmail\.com/);
  });

  it("never reveals whether any other address exists", async () => {
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    await screen.findByTestId("account-delete-code-input");
    const form = screen.getByTestId("account-delete-form");
    expect(form).not.toHaveTextContent(/no account|not found|different email|another address/i);
  });

  it("labels the code input and supports a pasted code", async () => {
    const user = userEvent.setup();
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    const input = (await screen.findByLabelText(
      /verification code/i,
    )) as HTMLInputElement;
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");

    input.focus();
    await user.paste("123 456");
    expect(input.value).toBe("123 456");
    // The spaced paste is accepted, not rejected client-side — the service normalizes it.
    expect(screen.getByTestId("account-delete-verify-code")).toBeEnabled();
  });

  it("disables Resend until the throttle window elapses, and counts down", async () => {
    jest.useFakeTimers();
    try {
      renderFlow();
      fireEvent.click(screen.getByTestId("account-delete-send-code"));
      await act(async () => {});

      const resend = screen.getByTestId("account-delete-resend-code");
      expect(resend).toBeDisabled();
      expect(resend).toHaveTextContent(/resend in \d+s/i);

      await act(async () => { jest.advanceTimersByTime(61_000); });
      expect(screen.getByTestId("account-delete-resend-code")).toBeEnabled();
      expect(screen.getByTestId("account-delete-resend-code")).toHaveTextContent(/resend code/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it("re-arms the countdown from the server when a resend is refused as too soon", async () => {
    // First send lands with its throttle already elapsed, so Resend is clickable —
    // the server is still entitled to refuse (another tab may have just resent).
    mockSendCode.mockResolvedValueOnce({
      ...SENT,
      resendAvailableAt: new Date(Date.now() - 1000).toISOString(),
    });
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    await screen.findByTestId("account-delete-code-input");
    expect(screen.getByTestId("account-delete-resend-code")).toBeEnabled();

    mockSendCode.mockRejectedValueOnce(
      new AccountDeletionError("You just requested a code.", "RESEND_TOO_SOON", 429, {
        retryAfterSeconds: 45,
      }),
    );
    fireEvent.click(screen.getByTestId("account-delete-resend-code"));

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /you just requested a code/i,
    );
    expect(screen.getByTestId("account-delete-resend-code")).toBeDisabled();
  });

  it("surfaces an email-delivery failure and stays on step 1 (no code box)", async () => {
    mockSendCode.mockRejectedValueOnce(
      new AccountDeletionError(
        "We couldn't send the verification email right now. Try again in a few minutes.",
        "EMAIL_UNAVAILABLE",
        502,
      ),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /couldn't send the verification email/i,
    );
    expect(screen.queryByTestId("account-delete-code-input")).toBeNull();
    expect(screen.getByTestId("account-delete-send-code")).toBeInTheDocument();
  });

  it("surfaces the no-verified-email fail-closed message with support guidance", async () => {
    mockSendCode.mockRejectedValueOnce(
      new AccountDeletionError(
        "This account has no verified email address, so we can't send a deletion code. Verify your email address, or contact support@chainreact.app to delete your account.",
        "NO_VERIFIED_EMAIL",
        409,
      ),
    );
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /support@chainreact\.app/,
    );
  });
});

describe("verification states", () => {
  it("announces failures assertively", async () => {
    mockVerifyCode.mockRejectedValueOnce(
      new AccountDeletionError("That code isn't right.", "INVALID_CODE", 400, {
        attemptsRemaining: 4,
      }),
    );
    renderFlow();
    await sendAndEnterCode("000000");
    const alert = await screen.findByTestId("account-deletion-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent(/that code isn't right/i);
    // Still on the code step — the user can try again.
    expect(screen.getByTestId("account-delete-code-input")).toBeInTheDocument();
  });

  it("clears the entered code and re-enables resend when the code EXPIRED", async () => {
    mockVerifyCode.mockRejectedValueOnce(
      new AccountDeletionError("That code has expired. Send a new one.", "CODE_EXPIRED", 410),
    );
    renderFlow();
    await sendAndEnterCode();

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(/expired/i);
    expect((screen.getByTestId("account-delete-code-input") as HTMLInputElement).value).toBe("");
    // The only way forward is a new code, so Resend is available immediately.
    expect(screen.getByTestId("account-delete-resend-code")).toBeEnabled();
  });

  it("clears the code and re-enables resend after TOO MANY attempts", async () => {
    mockVerifyCode.mockRejectedValueOnce(
      new AccountDeletionError(
        "Too many incorrect attempts. Send a new code to try again.",
        "TOO_MANY_ATTEMPTS",
        429,
      ),
    );
    renderFlow();
    await sendAndEnterCode("000000");

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /too many incorrect attempts/i,
    );
    expect((screen.getByTestId("account-delete-code-input") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("account-delete-resend-code")).toBeEnabled();
  });

  it("moves to the VERIFIED state, announces it, and drops the code from the DOM", async () => {
    renderFlow();
    await sendAndEnterCode();

    expect(await screen.findByTestId("account-delete-verified")).toBeInTheDocument();
    expect(screen.getByTestId("account-delete-status")).toHaveTextContent(/code verified/i);
    // The code input is gone — the entered digits are not retained anywhere.
    expect(screen.queryByTestId("account-delete-code-input")).toBeNull();
    expect(screen.getByTestId("account-delete-form")).not.toHaveTextContent("123456");
  });
});

describe("final DELETE confirmation", () => {
  async function reachConfirm() {
    renderFlow();
    await sendAndEnterCode();
    return screen.findByTestId("account-delete-confirm-input");
  }

  it("requires the exact word DELETE — verification alone never deletes", async () => {
    const input = await reachConfirm();
    const confirm = screen.getByTestId("account-delete-confirm");
    expect(confirm).toBeDisabled();
    expect(mockRequest).not.toHaveBeenCalled();

    for (const bad of ["delete", "Delete", " DELETE", "DELETE ", "DELET"]) {
      fireEvent.change(input, { target: { value: bad } });
      expect(confirm).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
  });

  it("submits and reports the scheduled state upward", async () => {
    const input = await reachConfirm();
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("account-delete-confirm"));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockRequest).toHaveBeenCalledWith({ confirmText: "DELETE" });
    expect(onDeleted.mock.calls[0]![0].deletionStatus).toBe("pending_deletion");
    expect(onDeleted.mock.calls[0]![1]).toBeNull();
  });

  it("routes the owned-teams refusal to the blocker instead of claiming success", async () => {
    mockRequest.mockRejectedValueOnce(
      new AccountDeletionError("Transfer ownership first.", "ACCOUNT_HAS_OWNED_TEAMS", 409, {
        ownedAccounts: [{ id: "t1", name: "Acme", type: "team", typeLabel: "Team" }],
      }),
    );
    const input = await reachConfirm();
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("account-delete-confirm"));

    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("reports a partial billing failure as the REAL frozen state plus the warning", async () => {
    const frozen = {
      deletionStatus: "pending_deletion" as const,
      requestedAt: "t",
      purgeAfter: "t2",
      billingCancellation: "failed" as const,
    };
    mockRequest.mockRejectedValueOnce(
      new AccountDeletionError(
        "Your account is frozen, but we couldn't cancel your subscription.",
        "BILLING_CANCELLATION_FAILED",
        502,
        { deletionState: frozen },
      ),
    );
    const input = await reachConfirm();
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("account-delete-confirm"));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onDeleted.mock.calls[0]![0]).toEqual(frozen);
    expect(onDeleted.mock.calls[0]![1]).toMatch(/couldn't cancel your subscription/i);
  });

  it("restarts at 'send a code' when the authorization was already spent", async () => {
    mockRequest.mockRejectedValueOnce(
      new AccountDeletionError(
        "Verify a code sent to your email before deleting your account.",
        "VERIFICATION_REQUIRED",
        401,
      ),
    );
    const input = await reachConfirm();
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("account-delete-confirm"));

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /verify a code sent to your email/i,
    );
    expect(screen.getByTestId("account-delete-send-code")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("panel lifecycle", () => {
  it("cancelling closes the panel via the parent", () => {
    renderFlow();
    fireEvent.click(screen.getByTestId("account-delete-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not retain the code across a remount (navigation)", async () => {
    const { unmount } = renderFlow();
    await sendAndEnterCode();
    await screen.findByTestId("account-delete-confirm-input");
    unmount();

    renderFlow();
    // Fresh panel: back to step 1, nothing carried over.
    expect(screen.getByTestId("account-delete-send-code")).toBeInTheDocument();
    expect(screen.queryByTestId("account-delete-code-input")).toBeNull();
    expect(screen.getByTestId("account-delete-form")).not.toHaveTextContent("123456");
  });
});

/**
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-1 — the Danger-Zone deletion card's BILLING behavior.
 * Updated for ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1: the step-up is an emailed
 * verification code, not a password, and the billing retry has its own route.
 * Mocks the account deletion client helpers.
 *
 * Asserts what the user is actually told and shown:
 *   - deletion is visibly a DIFFERENT action from cancelling a subscription, and points at
 *     the billing surface for the "I only want to stop paying" case;
 *   - the confirmation states every consequence: immediate freeze, subscription cancelled,
 *     what is scheduled for deletion, retained anonymized records, that Team/Business data
 *     stays with those accounts, the owned-account precondition, and that cancelling the
 *     deletion restores on FREE without restarting billing;
 *   - a partial failure (frozen, but the subscription could not be cancelled) shows BOTH
 *     facts with a working retry — never a clean success and never a bare error.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AccountDeletionCard } from "@/features/account/AccountDeletionCard";
import { AccountDeletionError } from "@/lib/api/accounts";

const mockRequest = jest.fn();
const mockCancel = jest.fn();
const mockSendCode = jest.fn();
const mockVerifyCode = jest.fn();
const mockRetryBilling = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  const actual = jest.requireActual("@/lib/api/accounts");
  return {
    ...actual,
    requestAccountDeletion: (...a: unknown[]) => mockRequest(...a),
    cancelAccountDeletion: (...a: unknown[]) => mockCancel(...a),
    sendAccountDeletionCode: (...a: unknown[]) => mockSendCode(...a),
    verifyAccountDeletionCode: (...a: unknown[]) => mockVerifyCode(...a),
    retryAccountDeletionBilling: (...a: unknown[]) => mockRetryBilling(...a),
  };
});

const FROZEN_STATE = {
  deletionStatus: "pending_deletion" as const,
  requestedAt: "2026-07-24T00:00:00.000Z",
  purgeAfter: "2026-08-23T00:00:00.000Z",
  billingCancellation: "failed" as const,
};

const CODE_SENT = {
  maskedEmail: "c••••••••@gmail.com",
  expiresAt: "2026-07-24T00:10:00.000Z",
  resendAvailableAt: "2026-07-24T00:01:00.000Z",
  codeLength: 6,
  maxAttempts: 5,
};

beforeEach(() => {
  mockRequest.mockReset();
  mockCancel.mockReset();
  mockRetryBilling.mockReset();
  mockSendCode.mockReset().mockResolvedValue(CODE_SENT);
  mockVerifyCode.mockReset().mockResolvedValue({
    authorizationExpiresAt: "2026-07-24T00:06:00.000Z",
  });
});

function renderActive() {
  return render(<AccountDeletionCard initialStatus="active" initialPurgeAfter={null} />);
}

/** Walk the whole universal flow: open → send code → verify → type DELETE → confirm. */
async function submitDeletion() {
  fireEvent.click(screen.getByTestId("account-delete-open"));
  fireEvent.click(screen.getByTestId("account-delete-send-code"));
  const codeInput = await screen.findByTestId("account-delete-code-input");
  fireEvent.change(codeInput, { target: { value: "123456" } });
  fireEvent.click(screen.getByTestId("account-delete-verify-code"));
  const confirmInput = await screen.findByTestId("account-delete-confirm-input");
  fireEvent.change(confirmInput, { target: { value: "DELETE" } });
  fireEvent.click(screen.getByTestId("account-delete-confirm"));
}

describe("deletion consequences copy", () => {
  it("names deletion distinctly and points at Cancel subscription for billing-only intent", () => {
    renderActive();
    const card = screen.getByTestId("account-deletion-card");
    expect(card).toHaveTextContent(/Delete my ChainReact account/i);
    expect(card).toHaveTextContent(/not the same as cancelling your plan/i);
    expect(card).toHaveTextContent(/Cancel subscription.*Plan & billing/i);
  });

  it("states every required consequence up front", () => {
    renderActive();
    const list = screen.getByTestId("account-delete-consequences");

    expect(list).toHaveTextContent(/frozen immediately/i);
    expect(list).toHaveTextContent(/subscription is cancelled and will not renew/i);
    expect(list).toHaveTextContent(
      /workflows, runs, integrations, files, AI conversations, and account information/i,
    );
    expect(list).toHaveTextContent(/permanent deletion/i);
    expect(list).toHaveTextContent(/anonymized billing and security records are kept/i);
    expect(list).toHaveTextContent(/accounting, fraud prevention, and legal/i);
    expect(list).toHaveTextContent(/Team and Business information does not belong to you/i);
    expect(list).toHaveTextContent(/must be transferred or deleted first/i);
    expect(list).toHaveTextContent(/restores your account on the Free plan/i);
    expect(list).toHaveTextContent(/does not restart billing/i);
  });

  it("keeps the typed-DELETE step-up on the destructive action, after the code", async () => {
    renderActive();
    fireEvent.click(screen.getByTestId("account-delete-open"));
    fireEvent.click(screen.getByTestId("account-delete-send-code"));
    fireEvent.change(await screen.findByTestId("account-delete-code-input"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByTestId("account-delete-verify-code"));

    const confirmInput = await screen.findByTestId("account-delete-confirm-input");
    const confirm = screen.getByTestId("account-delete-confirm");
    expect(confirm).toBeDisabled();

    // Anything other than the exact word is refused by the UI too.
    fireEvent.change(confirmInput, { target: { value: "delete" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(confirmInput, { target: { value: " DELETE " } });
    expect(confirm).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
  });
});

describe("billing cancellation partial failure", () => {
  it("shows BOTH the frozen state and the billing warning — never a clean success", async () => {
    mockRequest.mockRejectedValueOnce(
      new AccountDeletionError(
        "Your account is frozen and scheduled for deletion, but we couldn't cancel your subscription.",
        "BILLING_CANCELLATION_FAILED",
        502,
        { deletionState: FROZEN_STATE },
      ),
    );
    renderActive();
    await submitDeletion();

    // The freeze is real, so the card moves to the pending state...
    expect(await screen.findByTestId("account-deletion-pending")).toBeInTheDocument();
    // ...AND the billing failure is shown with the protective guarantee.
    const banner = screen.getByTestId("account-deletion-billing-failed");
    expect(banner).toHaveTextContent(/couldn't cancel your subscription/i);
    expect(banner).toHaveTextContent(/may still renew/i);
    expect(banner).toHaveTextContent(
      /will not be permanently deleted while a subscription is still active/i,
    );
    expect(screen.getByTestId("account-deletion-error")).toHaveAttribute("role", "alert");
  });

  it("retries the cancellation WITHOUT a password or a new code, and clears on success", async () => {
    mockRequest.mockRejectedValueOnce(
      new AccountDeletionError(
        "Couldn't cancel your subscription.",
        "BILLING_CANCELLATION_FAILED",
        502,
        { deletionState: FROZEN_STATE },
      ),
    );
    mockRetryBilling.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      requestedAt: FROZEN_STATE.requestedAt,
      purgeAfter: FROZEN_STATE.purgeAfter,
      billingCancellation: "canceled",
    });

    renderActive();
    await submitDeletion();
    await screen.findByTestId("account-deletion-billing-failed");

    // No password box and no code box on the retry — the account is already frozen,
    // so there is no destructive transition left to authorize.
    expect(screen.queryByTestId("account-billing-retry-password")).toBeNull();
    expect(screen.queryByTestId("account-delete-code-input")).toBeNull();

    fireEvent.click(screen.getByTestId("account-billing-retry-confirm"));

    await waitFor(() =>
      expect(screen.queryByTestId("account-deletion-billing-failed")).toBeNull(),
    );
    // The retry hits the dedicated route with no arguments; it never re-issues a code.
    expect(mockRetryBilling).toHaveBeenCalledWith();
    expect(mockSendCode).toHaveBeenCalledTimes(1);
    // Still pending — the retry never un-deletes anything.
    expect(screen.getByTestId("account-deletion-pending")).toBeInTheDocument();
  });

  it("keeps the warning up when the retry ALSO fails", async () => {
    mockRequest.mockRejectedValueOnce(
      new AccountDeletionError("Couldn't cancel your subscription.", "BILLING_CANCELLATION_FAILED", 502, {
        deletionState: FROZEN_STATE,
      }),
    );
    mockRetryBilling.mockRejectedValue(
      new AccountDeletionError("Still couldn't cancel.", "BILLING_CANCELLATION_FAILED", 502, {
        deletionState: FROZEN_STATE,
      }),
    );

    renderActive();
    await submitDeletion();
    await screen.findByTestId("account-deletion-billing-failed");

    fireEvent.click(screen.getByTestId("account-billing-retry-confirm"));

    await waitFor(() => expect(mockRetryBilling).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("account-deletion-billing-failed")).toBeInTheDocument();
  });

  it("shows NO billing warning on a clean deletion", async () => {
    mockRequest.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      requestedAt: FROZEN_STATE.requestedAt,
      purgeAfter: FROZEN_STATE.purgeAfter,
      billingCancellation: "canceled",
    });
    renderActive();
    await submitDeletion();

    expect(await screen.findByTestId("account-deletion-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("account-deletion-billing-failed")).toBeNull();
  });
});

describe("pending state copy", () => {
  it("says restoration brings the account back on FREE", () => {
    render(
      <AccountDeletionCard
        initialStatus="pending_deletion"
        initialPurgeAfter="2026-08-23T00:00:00.000Z"
      />,
    );
    const pending = screen.getByTestId("account-deletion-pending");
    expect(pending).toHaveTextContent(/August 23, 2026/i);
    expect(pending).toHaveTextContent(/comes back on the Free plan/i);
  });

  it("cancelling the deletion restores without any billing action", async () => {
    mockCancel.mockResolvedValueOnce({
      deletionStatus: "active",
      requestedAt: null,
      purgeAfter: null,
    });
    render(
      <AccountDeletionCard
        initialStatus="pending_deletion"
        initialPurgeAfter="2026-08-23T00:00:00.000Z"
      />,
    );

    fireEvent.click(screen.getByTestId("account-deletion-cancel"));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    // The restore route takes no arguments and triggers no subscription request.
    expect(mockCancel).toHaveBeenCalledWith();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockRetryBilling).not.toHaveBeenCalled();
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-2 — the blocked (sole-owner) state.
 *
 * Four actions get confused constantly: cancel personal billing, leave a team, transfer team
 * ownership, delete the personal account. The blocked screen must name all four, must not
 * imply that cancelling the personal plan touches the team plan, and must not imply that
 * deleting the personal account deletes team-owned data.
 *
 * The universal email challenge did NOT weaken this: the refusal still comes from the
 * canonical deletion service at DELETION time, after the code was verified and spent.
 */
describe("blocked: user still owns Team/Business accounts", () => {
  function blockedError(owned = [
    { id: "t1", name: "Acme Team", type: "team" as const, typeLabel: "Team" },
    { id: "o1", name: "Acme Biz", type: "organization" as const, typeLabel: "Business" },
  ]) {
    return new AccountDeletionError(
      "Transfer ownership or delete the Team/Business accounts you own before deleting your personal account.",
      "ACCOUNT_HAS_OWNED_TEAMS",
      409,
      { ownedAccounts: owned },
    );
  }

  async function renderBlocked() {
    mockRequest.mockRejectedValueOnce(blockedError());
    renderActive();
    await submitDeletion();
    return screen.findByTestId("account-deletion-blocked");
  }

  it("lists each owned account with its Business/Team label (never 'Organization')", async () => {
    const panel = await renderBlocked();
    expect(within(panel).getByTestId("account-owned-t1")).toHaveTextContent("Acme Team");
    expect(within(panel).getByTestId("account-owned-o1")).toHaveTextContent("Acme Biz");
    expect(within(panel).getByTestId("account-owned-o1")).toHaveTextContent("Business");
    expect(panel).not.toHaveTextContent(/organization/i);
  });

  it("distinguishes all FOUR actions", async () => {
    const panel = await renderBlocked();
    const options = within(panel).getByTestId("account-blocked-options");
    expect(options).toHaveTextContent(/Cancel your personal subscription/i);
    expect(options).toHaveTextContent(/Transfer ownership/i);
    expect(options).toHaveTextContent(/Leave a team/i);
    expect(options).toHaveTextContent(/Delete your personal account/i);
  });

  it("never claims cancelling the personal plan cancels the team plan", async () => {
    const panel = await renderBlocked();
    expect(within(panel).getByTestId("account-blocked-options")).toHaveTextContent(
      /does not cancel a Team or Business plan/i,
    );
  });

  it("never claims deleting the personal account deletes team-owned data", async () => {
    const panel = await renderBlocked();
    expect(within(panel).getByTestId("account-blocked-options")).toHaveTextContent(
      /never deletes Team or Business data/i,
    );
  });

  it("says transferring ownership leaves the team's subscription untouched", async () => {
    const panel = await renderBlocked();
    expect(within(panel).getByTestId("account-blocked-options")).toHaveTextContent(
      /members, and subscription stay exactly as they are/i,
    );
  });

  it("offers a route to resolve it and does not present deletion as done", async () => {
    const panel = await renderBlocked();
    expect(within(panel).getByTestId("account-blocked-team-link")).toBeInTheDocument();
    // No pending/frozen state is implied by a blocked attempt.
    expect(screen.queryByTestId("account-deletion-pending")).toBeNull();
    expect(screen.queryByTestId("account-deletion-billing-failed")).toBeNull();
  });

  it("shows no ownership-transfer requirement on a normal (unblocked) deletion form", () => {
    renderActive();
    // The plain Danger-Zone card mentions the precondition, but renders no blocked panel.
    expect(screen.queryByTestId("account-deletion-blocked")).toBeNull();
    expect(screen.queryByTestId("account-blocked-options")).toBeNull();
  });
});

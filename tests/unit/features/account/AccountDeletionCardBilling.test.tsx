/**
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-1 — the Danger-Zone deletion card's BILLING behavior.
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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountDeletionCard } from "@/features/account/AccountDeletionCard";
import { AccountDeletionError } from "@/lib/api/accounts";

const mockRequest = jest.fn();
const mockCancel = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  const actual = jest.requireActual("@/lib/api/accounts");
  return {
    ...actual,
    requestAccountDeletion: (...a: unknown[]) => mockRequest(...a),
    cancelAccountDeletion: (...a: unknown[]) => mockCancel(...a),
  };
});

const FROZEN_STATE = {
  deletionStatus: "pending_deletion" as const,
  requestedAt: "2026-07-24T00:00:00.000Z",
  purgeAfter: "2026-08-23T00:00:00.000Z",
  billingCancellation: "failed" as const,
};

beforeEach(() => {
  mockRequest.mockReset();
  mockCancel.mockReset();
});

function renderActive() {
  return render(<AccountDeletionCard initialStatus="active" initialPurgeAfter={null} />);
}

/** Fill the typed phrase + password and submit. */
function submitDeletion() {
  fireEvent.click(screen.getByTestId("account-delete-open"));
  fireEvent.change(screen.getByTestId("account-delete-confirm-input"), {
    target: { value: "delete my account" },
  });
  fireEvent.change(screen.getByTestId("account-delete-password"), {
    target: { value: "pw" },
  });
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

  it("keeps the typed-phrase + password step-up on the destructive action", () => {
    renderActive();
    fireEvent.click(screen.getByTestId("account-delete-open"));
    const confirm = screen.getByTestId("account-delete-confirm");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId("account-delete-confirm-input"), {
      target: { value: "delete my account" },
    });
    expect(confirm).toBeDisabled(); // password still required

    fireEvent.change(screen.getByTestId("account-delete-password"), {
      target: { value: "pw" },
    });
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
        undefined,
        FROZEN_STATE,
      ),
    );
    renderActive();
    submitDeletion();

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

  it("retries the cancellation behind the password step-up and clears on success", async () => {
    mockRequest
      .mockRejectedValueOnce(
        new AccountDeletionError(
          "Couldn't cancel your subscription.",
          "BILLING_CANCELLATION_FAILED",
          502,
          undefined,
          FROZEN_STATE,
        ),
      )
      .mockResolvedValueOnce({
        deletionStatus: "pending_deletion",
        requestedAt: FROZEN_STATE.requestedAt,
        purgeAfter: FROZEN_STATE.purgeAfter,
        billingCancellation: "canceled",
      });

    renderActive();
    submitDeletion();
    await screen.findByTestId("account-deletion-billing-failed");

    fireEvent.click(screen.getByTestId("account-billing-retry-open"));
    const retryConfirm = screen.getByTestId("account-billing-retry-confirm");
    // Step-up preserved: no password, no retry.
    expect(retryConfirm).toBeDisabled();

    fireEvent.change(screen.getByTestId("account-billing-retry-password"), {
      target: { value: "pw" },
    });
    fireEvent.click(retryConfirm);

    await waitFor(() =>
      expect(screen.queryByTestId("account-deletion-billing-failed")).toBeNull(),
    );
    // The retry re-POSTs the (idempotent) deletion request with the canonical phrase.
    expect(mockRequest).toHaveBeenLastCalledWith({
      password: "pw",
      confirmText: "delete my account",
    });
    // Still pending — the retry never un-deletes anything.
    expect(screen.getByTestId("account-deletion-pending")).toBeInTheDocument();
  });

  it("keeps the warning up when the retry ALSO fails", async () => {
    const failure = new AccountDeletionError(
      "Couldn't cancel your subscription.",
      "BILLING_CANCELLATION_FAILED",
      502,
      undefined,
      FROZEN_STATE,
    );
    mockRequest.mockRejectedValue(failure);

    renderActive();
    submitDeletion();
    await screen.findByTestId("account-deletion-billing-failed");

    fireEvent.click(screen.getByTestId("account-billing-retry-open"));
    fireEvent.change(screen.getByTestId("account-billing-retry-password"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByTestId("account-billing-retry-confirm"));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
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
    submitDeletion();

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
  });
});

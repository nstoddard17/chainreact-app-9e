/**
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-1 — account-scoped "Cancel subscription" / "Keep plan"
 * panel for Team / Business accounts. Mocks the subscription client helpers.
 *
 * Asserts the user-visible contract: cancel and delete are different actions and this one
 * says the account stays; the effective date renders; pending / success / failure are all
 * visible; the plan is never optimistically shown as Free; an admin sees read-only state;
 * a frozen account is read-only; and no Stripe id ever appears.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SubscriptionCancelPanel } from "@/features/account/SubscriptionCancelPanel";
import { AccountApiError } from "@/lib/api/accounts";
import type { AccountSubscriptionView } from "@/lib/api/subscription";

const mockGetSubscription = jest.fn();
const mockSetAction = jest.fn();
jest.mock("@/lib/api/subscription", () => ({
  getAccountSubscription: (...a: unknown[]) => mockGetSubscription(...a),
  setAccountSubscriptionAction: (...a: unknown[]) => mockSetAction(...a),
}));

const ACCOUNT = "acct-team";

function state(over: Partial<AccountSubscriptionView> = {}): AccountSubscriptionView {
  return {
    plan: "team",
    planStatus: "active",
    hasSubscription: true,
    isCancelable: true,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-15T00:00:00Z",
    frozen: false,
    internalBilling: false,
    canManage: true,
    ...over,
  };
}

beforeEach(() => {
  mockGetSubscription.mockReset();
  mockSetAction.mockReset().mockResolvedValue({
    cancelAtPeriodEnd: true,
    effectiveAt: "2026-08-15T00:00:00Z",
    alreadyInState: false,
  });
});

it("shows the active plan and its renewal date", async () => {
  mockGetSubscription.mockResolvedValue(state());
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  expect(await screen.findByTestId("subscription-plan")).toHaveTextContent(/Team/i);
  expect(screen.getByTestId("subscription-status")).toHaveTextContent(/Active/i);
  expect(screen.getByTestId("subscription-status")).toHaveTextContent(/August 15, 2026/i);
});

it("confirms with copy that the ACCOUNT AND DATA STAY, and shows the effective date", async () => {
  mockGetSubscription
    .mockResolvedValueOnce(state())
    .mockResolvedValueOnce(state({ cancelAtPeriodEnd: true }));
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  fireEvent.click(await screen.findByTestId("subscription-cancel-open"));
  const row = screen.getByTestId("subscription-cancel-confirm-row");
  // This is the anti-ambiguity guarantee: cancelling is NOT deleting.
  expect(row).toHaveTextContent(/Your account is not deleted/i);
  expect(row).toHaveTextContent(/workflows, runs, integrations, members, and history all stay/i);
  expect(screen.getByTestId("subscription-effective-date")).toHaveTextContent(
    /August 15, 2026/i,
  );

  fireEvent.click(screen.getByTestId("subscription-cancel-confirm"));
  await waitFor(() => expect(mockSetAction).toHaveBeenCalledWith(ACCOUNT, "cancel"));
});

it("does NOT optimistically show Free — it re-reads the server state after cancelling", async () => {
  mockGetSubscription
    .mockResolvedValueOnce(state())
    .mockResolvedValueOnce(state({ cancelAtPeriodEnd: true }));
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  fireEvent.click(await screen.findByTestId("subscription-cancel-open"));
  fireEvent.click(screen.getByTestId("subscription-cancel-confirm"));

  await waitFor(() =>
    expect(screen.getByTestId("subscription-status")).toHaveTextContent(/Canceling/i),
  );
  // Plan stays Team until Stripe confirms the subscription actually ended.
  expect(screen.getByTestId("subscription-plan")).toHaveTextContent(/Team/i);
  expect(screen.getByTestId("subscription-status")).toHaveTextContent(/won't renew/i);
  expect(mockGetSubscription).toHaveBeenCalledTimes(2);
});

it("offers 'Keep plan' when cancellation is scheduled, and resumes", async () => {
  mockGetSubscription
    .mockResolvedValueOnce(state({ cancelAtPeriodEnd: true }))
    .mockResolvedValueOnce(state());
  mockSetAction.mockResolvedValue({
    cancelAtPeriodEnd: false,
    effectiveAt: null,
    alreadyInState: false,
  });
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  const resume = await screen.findByTestId("subscription-resume");
  expect(resume).toHaveTextContent(/Keep plan/i);
  fireEvent.click(resume);

  await waitFor(() => expect(mockSetAction).toHaveBeenCalledWith(ACCOUNT, "resume"));
  await waitFor(() =>
    expect(screen.getByTestId("subscription-status")).toHaveTextContent(/Active/i),
  );
  // Exactly one action is offered at a time: once resumed, "Keep plan" is replaced by the
  // cancel control again — never both at once.
  expect(screen.queryByTestId("subscription-resume")).toBeNull();
  expect(screen.getByTestId("subscription-cancel-open")).toBeInTheDocument();
});

it("offers only ONE action while cancellation is scheduled", async () => {
  mockGetSubscription.mockResolvedValue(state({ cancelAtPeriodEnd: true }));
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  await screen.findByTestId("subscription-resume");
  expect(screen.queryByTestId("subscription-cancel-open")).toBeNull();
});

it("keeps an action failure VISIBLE and actionable instead of silently reverting", async () => {
  mockGetSubscription.mockResolvedValue(state());
  mockSetAction.mockRejectedValue(
    new AccountApiError("Could not update the subscription. Please try again.", "SERVER_ERROR", 502),
  );
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  fireEvent.click(await screen.findByTestId("subscription-cancel-open"));
  fireEvent.click(screen.getByTestId("subscription-cancel-confirm"));

  const err = await screen.findByTestId("subscription-action-error");
  expect(err).toHaveTextContent(/Could not update the subscription/i);
  expect(err).toHaveAttribute("role", "alert");
  // The state is unchanged and honest — no fake "canceled".
  expect(screen.getByTestId("subscription-status")).toHaveTextContent(/Active/i);
});

it("shows a retryable load error", async () => {
  mockGetSubscription.mockRejectedValueOnce(
    new AccountApiError("Billing is not configured.", "SERVER_ERROR", 503),
  );
  mockGetSubscription.mockResolvedValueOnce(state());
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  expect(await screen.findByTestId("subscription-load-error")).toHaveTextContent(
    /Billing is not configured/i,
  );
  fireEvent.click(screen.getByTestId("subscription-retry"));
  expect(await screen.findByTestId("subscription-plan")).toBeInTheDocument();
});

it("renders READ-ONLY for an admin (canManage=false) — no cancel control", async () => {
  mockGetSubscription.mockResolvedValue(state({ canManage: false }));
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  expect(await screen.findByTestId("subscription-owner-only")).toHaveTextContent(
    /Only the account owner can cancel/i,
  );
  expect(screen.queryByTestId("subscription-cancel-open")).toBeNull();
  expect(screen.queryByTestId("subscription-resume")).toBeNull();
});

it("renders read-only when the account is frozen", async () => {
  mockGetSubscription.mockResolvedValue(state({ frozen: true }));
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen />);

  expect(await screen.findByTestId("subscription-frozen")).toHaveTextContent(
    /pending deletion/i,
  );
  expect(screen.queryByTestId("subscription-cancel-open")).toBeNull();
});

it("renders no dead control when there is no paid subscription", async () => {
  mockGetSubscription.mockResolvedValue(
    state({ isCancelable: false, hasSubscription: false, plan: "free" }),
  );
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  expect(await screen.findByTestId("subscription-none")).toHaveTextContent(
    /no active paid subscription/i,
  );
  expect(screen.queryByTestId("subscription-cancel-open")).toBeNull();
});

it("explains an internal-billing account instead of offering a cancel", async () => {
  mockGetSubscription.mockResolvedValue(state({ isCancelable: false, internalBilling: true }));
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  expect(await screen.findByTestId("subscription-none")).toHaveTextContent(
    /internal billing/i,
  );
});

it("dismissing the confirm keeps the plan and calls nothing", async () => {
  mockGetSubscription.mockResolvedValue(state());
  render(<SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />);

  fireEvent.click(await screen.findByTestId("subscription-cancel-open"));
  fireEvent.click(screen.getByTestId("subscription-cancel-dismiss"));

  expect(screen.queryByTestId("subscription-cancel-confirm-row")).toBeNull();
  expect(mockSetAction).not.toHaveBeenCalled();
});

it("never renders a Stripe id", async () => {
  mockGetSubscription.mockResolvedValue(state());
  const { container } = render(
    <SubscriptionCancelPanel accountId={ACCOUNT} frozen={false} />,
  );
  await screen.findByTestId("subscription-plan");
  expect(container.textContent ?? "").not.toMatch(/sub_|cus_|sk_|price_/);
});

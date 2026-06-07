/**
 * Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-3 / PPT-3 — personal-plan management panel.
 * Mocks the personal-billing client helpers; asserts the paid-Pro card, the period-end
 * downgrade confirm flow, the undo flow, over-limit blocking, and the Free / frozen
 * read-only states. No Stripe ids ever appear (the DTO carries none).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PersonalPlanPanel } from "@/features/account/PersonalPlanPanel";
import type { PersonalPlanStateView } from "@/lib/api/personalBilling";

const mockGetState = jest.fn();
const mockSetCancel = jest.fn();
jest.mock("@/lib/api/personalBilling", () => ({
  getPersonalBillingState: (...a: unknown[]) => mockGetState(...a),
  setPersonalCancelAtPeriodEnd: (...a: unknown[]) => mockSetCancel(...a),
}));

const ACCOUNT = "acct-1";

function state(over: Partial<PersonalPlanStateView> = {}): PersonalPlanStateView {
  return {
    isPaidPersonalPro: true,
    plan: "pro",
    planStatus: "active",
    currentPeriodEnd: "2026-07-15T00:00:00Z",
    cancelAtPeriodEnd: false,
    downgrade: { allowed: true, blockers: [] },
    ...over,
  };
}

beforeEach(() => {
  mockGetState.mockReset();
  mockSetCancel.mockReset().mockResolvedValue(true);
});

it("renders the Personal Pro card when paid Pro + active", async () => {
  mockGetState.mockResolvedValueOnce(state());
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  expect(await screen.findByTestId("personal-plan-card")).toBeInTheDocument();
  expect(screen.getByTestId("personal-plan-status")).toHaveTextContent(/Active/i);
});

it("shows 'Downgrade to Free at period end' when not canceling, and confirms with POST true", async () => {
  mockGetState.mockResolvedValueOnce(state()).mockResolvedValueOnce(state({ cancelAtPeriodEnd: true }));
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  fireEvent.click(await screen.findByTestId("personal-downgrade-open"));
  // Conservative copy in the confirm row.
  const confirmRow = screen.getByTestId("personal-downgrade-confirm-row");
  expect(confirmRow).toHaveTextContent(/No data is deleted/i);
  expect(confirmRow).toHaveTextContent(/period/i);
  fireEvent.click(screen.getByTestId("personal-downgrade-confirm"));
  await waitFor(() => expect(mockSetCancel).toHaveBeenCalledWith(ACCOUNT, true));
});

it("shows 'Keep Pro' undo when cancel_at_period_end is true, and undo POSTs false", async () => {
  mockGetState.mockResolvedValueOnce(state({ cancelAtPeriodEnd: true })).mockResolvedValueOnce(state());
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  const undo = await screen.findByTestId("personal-undo");
  expect(undo).toHaveTextContent(/Keep Pro/i);
  expect(screen.getByTestId("personal-plan-status")).toHaveTextContent(/Canceling/i);
  fireEvent.click(undo);
  await waitFor(() => expect(mockSetCancel).toHaveBeenCalledWith(ACCOUNT, false));
});

it("blocks + disables the downgrade when over Free limits, listing the blockers", async () => {
  mockGetState.mockResolvedValueOnce(
    state({ downgrade: { allowed: false, blockers: [{ kind: "folders", current: 25, limit: 10 }] } }),
  );
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  expect(await screen.findByTestId("personal-downgrade-blocked")).toBeInTheDocument();
  expect(screen.getByTestId("personal-downgrade-open")).toBeDisabled();
  expect(screen.getByTestId("personal-plan-blockers")).toHaveTextContent(/25 folders \(Free allows 10\)/i);
});

it("renders no destructive control for a Free personal account", async () => {
  mockGetState.mockResolvedValueOnce(state({ isPaidPersonalPro: false, plan: "free" }));
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  expect(await screen.findByTestId("personal-plan-free")).toHaveTextContent(/Free plan/i);
  expect(screen.queryByTestId("personal-downgrade-open")).toBeNull();
  expect(screen.queryByTestId("personal-undo")).toBeNull();
});

it("hides action controls on a frozen account (read-only)", async () => {
  mockGetState.mockResolvedValueOnce(state());
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={true} />);
  expect(await screen.findByTestId("personal-plan-frozen")).toBeInTheDocument();
  expect(screen.queryByTestId("personal-downgrade-open")).toBeNull();
  expect(screen.queryByTestId("personal-undo")).toBeNull();
});

it("shows an error + retry when the load fails", async () => {
  mockGetState.mockRejectedValueOnce(new Error("boom"));
  render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  expect(await screen.findByTestId("personal-plan-error")).toBeInTheDocument();
  mockGetState.mockResolvedValueOnce(state());
  fireEvent.click(screen.getByTestId("personal-plan-retry"));
  expect(await screen.findByTestId("personal-plan-card")).toBeInTheDocument();
});

it("never renders a Stripe customer/subscription id", async () => {
  mockGetState.mockResolvedValueOnce(state());
  const { container } = render(<PersonalPlanPanel accountId={ACCOUNT} frozen={false} />);
  await screen.findByTestId("personal-plan-card");
  expect(container.innerHTML).not.toMatch(/cus_|sub_/);
});

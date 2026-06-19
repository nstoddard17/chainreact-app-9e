/**
 * Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-4 / PPT-4 — pre-checkout Personal-Pro choice.
 * Mocks the personal-billing + checkout client helpers and injects the redirect seam.
 * Asserts: no dialog for Free / personal-self upgrade, dialog for paid-Pro team checkout,
 * Keep vs Downgrade paths, over-limit blocking (checkout still available), dismiss, and
 * fail-safe on a read error. No Stripe id ever rendered.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckoutChoiceButton } from "@/features/account/CheckoutChoiceButton";
import type { PersonalPlanStateView } from "@/lib/api/personalBilling";

const mockGetState = jest.fn();
const mockSetCancel = jest.fn();
jest.mock("@/lib/api/personalBilling", () => ({
  getPersonalBillingState: (...a: unknown[]) => mockGetState(...a),
  setPersonalCancelAtPeriodEnd: (...a: unknown[]) => mockSetCancel(...a),
}));

const mockStartCheckout = jest.fn();
jest.mock("@/lib/api/billingCheckout", () => ({
  startCheckout: (...a: unknown[]) => mockStartCheckout(...a),
}));

const TEAM = "team-1";
const PERSONAL = "personal-1";

function proState(over: Partial<PersonalPlanStateView> = {}): PersonalPlanStateView {
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

let redirect: jest.Mock;
function renderBtn(props: Partial<Parameters<typeof CheckoutChoiceButton>[0]> = {}) {
  redirect = jest.fn();
  return render(
    <CheckoutChoiceButton
      checkoutAccountId={TEAM}
      plan="team"
      personalAccountId={PERSONAL}
      label="Upgrade to Team"
      redirect={redirect}
      {...props}
    />,
  );
}

beforeEach(() => {
  mockGetState.mockReset();
  mockSetCancel.mockReset().mockResolvedValue(true);
  mockStartCheckout.mockReset().mockResolvedValue({ url: "https://stripe.test/checkout" });
});

it("no dialog when the personal account is Free — proceeds straight to checkout", async () => {
  mockGetState.mockResolvedValueOnce(proState({ isPaidPersonalPro: false, plan: "free" }));
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith(TEAM, "team"));
  expect(screen.queryByTestId("checkout-choice-dialog")).toBeNull();
  expect(redirect).toHaveBeenCalledWith("https://stripe.test/checkout");
});

it("forwards a provided interval to startCheckout (PRICING-INTERVAL-1)", async () => {
  mockGetState.mockResolvedValueOnce(proState({ isPaidPersonalPro: false, plan: "free" }));
  renderBtn({ interval: "annual" });
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith(TEAM, "team", "annual"));
});

it("shows the dialog when paid Pro + a Team checkout starts (no checkout yet)", async () => {
  mockGetState.mockResolvedValueOnce(proState());
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  expect(await screen.findByTestId("checkout-choice-dialog")).toBeInTheDocument();
  expect(mockStartCheckout).not.toHaveBeenCalled();
});

it("Keep proceeds to checkout WITHOUT calling personal cancel", async () => {
  mockGetState.mockResolvedValueOnce(proState());
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  fireEvent.click(await screen.findByTestId("checkout-choice-keep"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith(TEAM, "team"));
  expect(mockSetCancel).not.toHaveBeenCalled();
  expect(redirect).toHaveBeenCalledWith("https://stripe.test/checkout");
});

it("Downgrade calls cancel-at-period-end true, THEN checkout (in order)", async () => {
  mockGetState.mockResolvedValueOnce(proState());
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  fireEvent.click(await screen.findByTestId("checkout-choice-downgrade"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalled());
  expect(mockSetCancel).toHaveBeenCalledWith(PERSONAL, true);
  const cancelOrder = mockSetCancel.mock.invocationCallOrder[0]!;
  const checkoutOrder = mockStartCheckout.mock.invocationCallOrder[0]!;
  expect(cancelOrder).toBeLessThan(checkoutOrder);
});

it("over Free limits: downgrade is blocked but Keep/checkout stays available", async () => {
  mockGetState.mockResolvedValueOnce(
    proState({ downgrade: { allowed: false, blockers: [{ kind: "folders", current: 25, limit: 10 }] } }),
  );
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  expect(await screen.findByTestId("checkout-choice-blocked")).toBeInTheDocument();
  expect(screen.queryByTestId("checkout-choice-downgrade")).toBeNull();
  expect(screen.getByTestId("checkout-choice-blockers")).toHaveTextContent(/25 \(Free allows 10\)/);
  // Keep still works.
  fireEvent.click(screen.getByTestId("checkout-choice-keep"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith(TEAM, "team"));
});

it("dismiss leaves the user on the page and mutates nothing", async () => {
  mockGetState.mockResolvedValueOnce(proState());
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  fireEvent.click(await screen.findByTestId("checkout-choice-cancel"));
  expect(screen.queryByTestId("checkout-choice-dialog")).toBeNull();
  expect(mockStartCheckout).not.toHaveBeenCalled();
  expect(mockSetCancel).not.toHaveBeenCalled();
});

it("fails safe on a personal-plan read error — proceeds to checkout, no Stripe detail", async () => {
  mockGetState.mockRejectedValueOnce(new Error("stripe boom cus_secret"));
  renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith(TEAM, "team"));
  expect(screen.queryByTestId("checkout-choice-dialog")).toBeNull();
  expect(screen.queryByTestId("checkout-choice-error")).toBeNull();
});

it("skips the choice when upgrading the personal account itself (no personal read)", async () => {
  renderBtn({ checkoutAccountId: PERSONAL, plan: "pro" });
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith(PERSONAL, "pro"));
  expect(mockGetState).not.toHaveBeenCalled();
  expect(screen.queryByTestId("checkout-choice-dialog")).toBeNull();
});

it("never renders a Stripe customer/subscription id", async () => {
  mockGetState.mockResolvedValueOnce(proState());
  const { container } = renderBtn();
  fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
  await screen.findByTestId("checkout-choice-dialog");
  expect(container.innerHTML).not.toMatch(/cus_|sub_/);
});

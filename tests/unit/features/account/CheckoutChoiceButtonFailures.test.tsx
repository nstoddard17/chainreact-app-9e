/**
 * BILLING-CHECKOUT-PROD-1 — what the upgrade CTA does when checkout cannot succeed.
 *
 * The production incident showed a normal-looking "Start Pro free trial" button that only
 * ever produced "Could not start checkout." These tests pin the honest behavior: the
 * server's typed message is what the user reads, a retry stays possible, a double-click
 * cannot fire twice, and a server that already knows billing is unconfigured renders a
 * disabled CTA rather than a working-looking one.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckoutChoiceButton } from "@/features/account/CheckoutChoiceButton";
import { AccountApiError } from "@/lib/api/accounts";

const mockGetState = jest.fn();
jest.mock("@/lib/api/personalBilling", () => ({
  getPersonalBillingState: (...a: unknown[]) => mockGetState(...a),
  setPersonalCancelAtPeriodEnd: jest.fn(),
}));

const mockStartCheckout = jest.fn();
jest.mock("@/lib/api/billingCheckout", () => ({
  startCheckout: (...a: unknown[]) => mockStartCheckout(...a),
}));

const PERSONAL = "personal-1";
let redirect: jest.Mock;

/** Personal-account self-upgrade: no choice dialog, straight to checkout. */
function renderProCta(unavailable = false) {
  redirect = jest.fn();
  return render(
    <CheckoutChoiceButton
      checkoutAccountId={PERSONAL}
      personalAccountId={PERSONAL}
      plan="pro"
      label="Start Pro free trial"
      unavailable={unavailable}
      redirect={redirect}
    />,
  );
}

beforeEach(() => {
  mockGetState.mockReset();
  mockStartCheckout.mockReset();
});

describe("successful checkout", () => {
  it("sends the user to Stripe", async () => {
    mockStartCheckout.mockResolvedValueOnce({ url: "https://checkout.stripe.test/s" });
    renderProCta();
    fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
    await waitFor(() =>
      expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.test/s"),
    );
  });
});

describe("the server reports a billing failure", () => {
  it.each([
    [
      "billing unavailable",
      503,
      "Billing checkout is temporarily unavailable. Your account was not changed. Please try again later.",
    ],
    [
      "a temporary Stripe failure",
      502,
      "Stripe could not start checkout right now. Your account was not changed. Please try again.",
    ],
    [
      "an ineligible trial",
      409,
      "This account is not eligible for another free trial.",
    ],
    [
      "insufficient permissions",
      403,
      "Only an account owner or billing administrator can change this plan.",
    ],
  ])("shows the server's own message for %s", async (_label, status, message) => {
    mockStartCheckout.mockRejectedValueOnce(
      new AccountApiError(message, status >= 500 ? "SERVER_ERROR" : "FORBIDDEN", status),
    );
    renderProCta();
    fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
    expect(await screen.findByTestId("checkout-choice-error")).toHaveTextContent(message);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lets the user try again after a retryable failure", async () => {
    mockStartCheckout
      .mockRejectedValueOnce(new AccountApiError("Try again.", "SERVER_ERROR", 502))
      .mockResolvedValueOnce({ url: "https://checkout.stripe.test/s" });
    renderProCta();
    const btn = screen.getByTestId("checkout-choice-trigger");

    fireEvent.click(btn);
    await screen.findByTestId("checkout-choice-error");
    // The button must be usable again, not stuck in the pending state.
    await waitFor(() => expect(btn).not.toBeDisabled());

    fireEvent.click(btn);
    await waitFor(() =>
      expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.test/s"),
    );
    expect(mockStartCheckout).toHaveBeenCalledTimes(2);
  });

  it("does not start a second checkout while one is already in flight", async () => {
    mockStartCheckout.mockImplementation(
      () => new Promise(() => {}), // never settles — the request is pending
    );
    renderProCta();
    const btn = screen.getByTestId("checkout-choice-trigger");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(mockStartCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("the server already knows billing is not configured", () => {
  it("renders a disabled, honestly-labelled CTA instead of one that can only fail", () => {
    renderProCta(true);
    const btn = screen.getByTestId("checkout-choice-trigger");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Billing temporarily unavailable");
    expect(screen.getByTestId("checkout-unavailable-note")).toHaveTextContent(
      "Your account was not changed",
    );
  });

  it("never calls the checkout API even if the click is forced", () => {
    renderProCta(true);
    fireEvent.click(screen.getByTestId("checkout-choice-trigger"));
    expect(mockStartCheckout).not.toHaveBeenCalled();
  });

  it("does not reveal which configuration is missing", () => {
    renderProCta(true);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/STRIPE_|PLATFORM_|price_|sk_/);
  });
});

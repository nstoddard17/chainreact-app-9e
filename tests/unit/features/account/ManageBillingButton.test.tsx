/**
 * Slice 4.PLATFORM-BILLING-UI-1 — Manage billing (Stripe Customer Portal) button. Mocks the
 * portal client helper and injects the redirect seam. Asserts: opens the portal + redirects,
 * honest "no customer yet" copy on 409 (not an error), generic error on other failures
 * (never raw Stripe detail), frozen disables the trigger, and no Stripe id is ever rendered.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManageBillingButton } from "@/features/account/ManageBillingButton";
import { AccountApiError } from "@/lib/api/accounts";

const mockPortal = jest.fn();
jest.mock("@/lib/api/billingCheckout", () => ({
  startBillingPortal: (...a: unknown[]) => mockPortal(...a),
}));

let redirect: jest.Mock;
function renderBtn(props: Partial<Parameters<typeof ManageBillingButton>[0]> = {}) {
  redirect = jest.fn();
  return render(<ManageBillingButton accountId="acct-1" redirect={redirect} {...props} />);
}

beforeEach(() => mockPortal.mockReset());

it("opens the portal and redirects to the returned url", async () => {
  mockPortal.mockResolvedValueOnce({ url: "https://stripe.test/portal" });
  renderBtn();
  fireEvent.click(screen.getByTestId("manage-billing-trigger"));
  await waitFor(() => expect(mockPortal).toHaveBeenCalledWith("acct-1"));
  expect(redirect).toHaveBeenCalledWith("https://stripe.test/portal");
});

it("shows honest 'start a paid plan first' copy on 409 (no customer) — not an error", async () => {
  mockPortal.mockRejectedValueOnce(
    new AccountApiError("Start a subscription first.", "CONFLICT", 409),
  );
  renderBtn();
  fireEvent.click(screen.getByTestId("manage-billing-trigger"));
  expect(await screen.findByTestId("manage-billing-no-customer")).toHaveTextContent(
    /after you start a paid plan/i,
  );
  expect(screen.queryByTestId("manage-billing-error")).toBeNull();
  expect(redirect).not.toHaveBeenCalled();
});

it("shows a generic error (never raw Stripe detail) when a non-API error is thrown", async () => {
  mockPortal.mockRejectedValueOnce(new Error("stripe exploded cus_secret123"));
  renderBtn();
  fireEvent.click(screen.getByTestId("manage-billing-trigger"));
  const err = await screen.findByTestId("manage-billing-error");
  expect(err).toHaveTextContent(/Couldn.t open the billing portal/i);
  expect(err.textContent).not.toMatch(/cus_/);
  expect(redirect).not.toHaveBeenCalled();
});

it("does nothing and disables the trigger when frozen", () => {
  renderBtn({ frozen: true });
  const btn = screen.getByTestId("manage-billing-trigger");
  expect(btn).toBeDisabled();
  fireEvent.click(btn);
  expect(mockPortal).not.toHaveBeenCalled();
});

it("never renders a Stripe customer/subscription id", () => {
  const { container } = renderBtn();
  expect(container.innerHTML).not.toMatch(/cus_|sub_/);
});

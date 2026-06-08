/**
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-5 / CS-BD-3 — BusinessDowngradePanel.
 * Mocks the downgrade client helper + injects the completion seam. Asserts the destructive
 * warnings, the export-first download link, the confirm-before-submit gate, the POST on confirm,
 * the completion (reload) seam, generic error handling, and no Stripe id in the DOM.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BusinessDowngradePanel } from "@/features/account/BusinessDowngradePanel";
import { AccountApiError } from "@/lib/api/accounts";

const mockDowngrade = jest.fn();
jest.mock("@/lib/api/billingCheckout", () => ({
  startBusinessDowngrade: (...a: unknown[]) => mockDowngrade(...a),
}));

const ACCOUNT = "acct-org-1";
let onComplete: jest.Mock;

function renderPanel(props: Partial<Parameters<typeof BusinessDowngradePanel>[0]> = {}) {
  onComplete = jest.fn();
  return render(<BusinessDowngradePanel accountId={ACCOUNT} onComplete={onComplete} {...props} />);
}

beforeEach(() => {
  mockDowngrade.mockReset().mockResolvedValue({ alreadyTeam: false, removedMembers: 2, flattenedFolders: 1 });
});

it("shows the destructive warnings (members removed, personal creds, folders flattened, workflows kept)", () => {
  renderPanel();
  const warnings = screen.getByTestId("business-downgrade-warnings");
  expect(warnings).toHaveTextContent(/All other members are removed/i);
  expect(warnings).toHaveTextContent(/including admins/i);
  expect(warnings).toHaveTextContent(/personal app connections are disconnected/i);
  expect(warnings).toHaveTextContent(/may need reconnecting/i);
  expect(warnings).toHaveTextContent(/folders are removed/i);
  expect(warnings).toHaveTextContent(/workflows are.*kept/i);
  expect(warnings).toHaveTextContent(/Uncategorized/i);
  expect(warnings).toHaveTextContent(/Trash \(restorable for 7 days\)/i);
  expect(warnings).toHaveTextContent(/nothing moves to your personal account/i);
});

it("offers a workflow export download link to the downgrade-purpose bulk export route", () => {
  renderPanel();
  const link = screen.getByTestId("business-downgrade-export");
  // CS-XT-3: the downgrade export bypasses the normal bulk-export tier gate.
  expect(link).toHaveAttribute(
    "href",
    `/api/accounts/${ACCOUNT}/workflows/export?purpose=downgrade`,
  );
});

it("requires the confirm checkbox before the destructive button is enabled / POSTs", async () => {
  renderPanel();
  const submit = screen.getByTestId("business-downgrade-submit");
  expect(submit).toBeDisabled();
  fireEvent.click(submit); // ignored while disabled
  expect(mockDowngrade).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("business-downgrade-confirm"));
  expect(submit).not.toBeDisabled();
  fireEvent.click(submit);
  await waitFor(() => expect(mockDowngrade).toHaveBeenCalledWith(ACCOUNT));
  await waitFor(() => expect(onComplete).toHaveBeenCalled());
});

it("shows a generic error and does NOT complete when the downgrade fails", async () => {
  mockDowngrade.mockRejectedValueOnce(new AccountApiError("Could not complete the downgrade. Please try again.", "SERVER_ERROR", 500));
  renderPanel();
  fireEvent.click(screen.getByTestId("business-downgrade-confirm"));
  fireEvent.click(screen.getByTestId("business-downgrade-submit"));
  expect(await screen.findByTestId("business-downgrade-error")).toHaveTextContent(/Could not complete the downgrade/i);
  expect(onComplete).not.toHaveBeenCalled();
});

it("never surfaces a raw error (non-API throw → generic copy)", async () => {
  mockDowngrade.mockRejectedValueOnce(new Error("offboarding boom cus_secret"));
  renderPanel();
  fireEvent.click(screen.getByTestId("business-downgrade-confirm"));
  fireEvent.click(screen.getByTestId("business-downgrade-submit"));
  const err = await screen.findByTestId("business-downgrade-error");
  expect(err).toHaveTextContent(/Couldn.t downgrade to Team/i);
  expect(err.textContent).not.toMatch(/cus_|boom/);
});

it("disables the action when frozen", () => {
  renderPanel({ frozen: true });
  expect(screen.getByTestId("business-downgrade-submit")).toBeDisabled();
  expect(screen.getByTestId("business-downgrade-confirm")).toBeDisabled();
});

it("renders no Stripe customer/subscription id", () => {
  const { container } = renderPanel();
  expect(container.innerHTML).not.toMatch(/cus_|sub_/);
});

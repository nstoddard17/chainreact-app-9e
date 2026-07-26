/**
 * REACT-AGENT-REVIEW-RECOVERY-MERGE-1 — the config rail is now a NAVIGATION DESTINATION.
 *
 * Before the merge, a user reached a provider picker by opening a step themselves. The review tray
 * now sends them straight to a specific field after selecting an issue, so whatever that field
 * renders when its resolver fails IS the recovery experience. This pins the two providers from the
 * original bug report at that landing point:
 *
 *   - Typeform (`personal` credential): ownership states must stay truthful — never a "temporary
 *     failure", never a Retry that cannot fix ownership, and never a fetch of another user's
 *     personal integration. The CREATOR's own missing connection gets an actionable link; a
 *     NON-owner gets no action, because there is none they can take.
 *   - Mailchimp (`account` credential): reconnect must point at the correct account-scoped
 *     integration, not a bare Apps page.
 */
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComboboxField } from "@/features/workflow-builder/config-modal/fields/ComboboxField";
import type { FieldMeta } from "@/contracts/actionMeta";

const typeformField = {
  name: "formId",
  label: "Form",
  type: "combobox",
  required: true,
  optionsSource: "typeform:forms",
} as FieldMeta;

const mailchimpField = {
  name: "audience_id",
  label: "Audience",
  type: "combobox",
  required: true,
  optionsSource: "mailchimp:audiences",
} as FieldMeta;

function renderField(field: FieldMeta) {
  return render(<ComboboxField field={field} value="" error={undefined} onChange={() => {}} />);
}

beforeEach(() => mockFetchOptionsSource.mockReset());

describe("Typeform ownership states at the config-rail landing", () => {
  it("a NON-owner sees the ownership reason, no Retry, and no action that cannot help", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "typeform:forms",
      code: "NOT_WORKFLOW_OWNER",
      message:
        "This step runs under the workflow owner's typeform connection. Ask the owner to set it up.",
    });
    renderField(typeformField);

    const note = await screen.findByTestId("combobox-owner-gated");
    expect(note).toHaveTextContent(/workflow owner/i);
    // Not described as a transient network/provider problem.
    expect(note).not.toHaveTextContent(/try again|temporarily unavailable|network/i);
    // Retry cannot fix an ownership rule, so it is not offered.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    // Nor a connect link — this user cannot connect someone else's personal integration.
    expect(screen.queryByTestId("combobox-owner-connect-link")).not.toBeInTheDocument();
    // The picker is inert: no options were fetched into it.
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("the CREATOR's own missing connection gets an account-scoped connect action", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "typeform:forms",
      code: "OWNER_MUST_CONNECT",
      message: "Connect typeform to configure and run this workflow.",
    });
    renderField(typeformField);

    expect(await screen.findByTestId("combobox-owner-must-connect")).toBeInTheDocument();
    const link = screen.getByTestId("combobox-owner-connect-link");
    expect(link).toHaveAttribute("href", "/apps?provider=typeform");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("never leaks a token, scope list, or provider body in an ownership state", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "typeform:forms",
      code: "NOT_WORKFLOW_OWNER",
      message: "This step runs under the workflow owner's typeform connection.",
    });
    const { container } = renderField(typeformField);
    await screen.findByTestId("combobox-owner-gated");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/tf_live_|access_token|Bearer |forms:read/);
    expect(text).not.toMatch(/@/); // no owner email / account identity
  });
});

describe("Mailchimp reconnect scoping at the config-rail landing", () => {
  it("a disconnected integration deep-links to the account-scoped Mailchimp connection", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "mailchimp:audiences",
      code: "INTEGRATION_DISCONNECTED",
      message: "No active mailchimp integration. Connect mailchimp first.",
    });
    const user = userEvent.setup();
    renderField(mailchimpField);
    // These states render inside the picker's own list, so open it the way a user would.
    await user.click(screen.getByRole("combobox"));

    const link = await screen.findByTestId("combobox-disconnected-link");
    expect(link).toHaveAttribute("href", "/apps?provider=mailchimp");
  });

  it("a rejected token deep-links to the same account-scoped connection", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "mailchimp:audiences",
      code: "PROVIDER_REAUTH_REQUIRED",
      message: "Reconnect Mailchimp and try again.",
    });
    const user = userEvent.setup();
    renderField(mailchimpField);
    await user.click(screen.getByRole("combobox"));

    const link = await screen.findByTestId("combobox-reconnect-link");
    expect(link).toHaveAttribute("href", "/apps?provider=mailchimp");
  });

  it("a transient provider failure is NOT presented as a reconnect", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "mailchimp:audiences",
      code: "PROVIDER_ERROR",
      message: "Couldn't load Mailchimp audiences. Try again.",
    });
    const { container } = renderField(mailchimpField);
    await waitFor(() => expect(mockFetchOptionsSource).toHaveBeenCalled());
    // Reconnecting would not fix a provider outage, so no reconnect affordance is shown; the retry
    // lives in the picker's own list (exercised by the ComboboxField suite).
    expect(screen.queryByTestId("combobox-disconnected-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combobox-reconnect-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combobox-owner-connect-link")).not.toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/mc-secret|api_key/i);
  });
});

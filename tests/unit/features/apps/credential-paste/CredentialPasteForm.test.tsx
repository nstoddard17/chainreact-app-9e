/**
 * @jest-environment jsdom
 *
 * UI tests for the provider-neutral credential-paste connect form
 * (FLEETIO-1). Uses a FIXTURE field set — nothing Fleetio-specific — to
 * prove the form is metadata-driven.
 *
 * Business rules protected:
 *   - Fields render from provider metadata (labels, masking, help); the form
 *     hardcodes no provider fields.
 *   - Empty required fields block submit (no half-filled POST).
 *   - Secrets exist only in component state + the single POST body — never
 *     in localStorage/sessionStorage.
 *   - Loading / invalid-credential / transient-error states render, and an
 *     invalid-credential error keeps the non-secret guide visible.
 *   - Success navigates via the server-provided redirect.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = { submitProviderCredentials: jest.fn() };
jest.mock("@/lib/api/credentialPaste", () => {
  const actual = jest.requireActual("@/lib/api/credentialPaste");
  return {
    ...actual,
    submitProviderCredentials: (...a: unknown[]) => api.submitProviderCredentials(...a),
  };
});

import { CredentialPasteForm } from "@/features/apps/credential-paste/CredentialPasteForm";
import { CredentialPasteApiError } from "@/lib/api/credentialPaste";

const FIELDS = [
  {
    id: "apiKey",
    label: "API key",
    secret: true,
    required: true,
    help: "Settings → Manage API Keys",
  },
  { id: "accountToken", label: "Account token", secret: true, required: true },
] as const;

const GUIDE = {
  intro: "Connect with an API key from your provider settings.",
  steps: ["Open Settings", "Create a key"],
  note: "Use a least-privilege user.",
};

function renderForm(state: string | null = "state-1") {
  return render(
    <CredentialPasteForm
      provider="fixture"
      displayName="Fixture App"
      fields={[...FIELDS]}
      guide={GUIDE}
      state={state}
    />,
  );
}

beforeEach(() => {
  api.submitProviderCredentials.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("CredentialPasteForm — metadata-driven rendering", () => {
  it("renders every declared field masked, with labels, help, and the guide", () => {
    renderForm();
    const apiKeyInput = screen.getByTestId("credential-input-apiKey");
    const tokenInput = screen.getByTestId("credential-input-accountToken");
    expect(apiKeyInput).toHaveAttribute("type", "password");
    expect(tokenInput).toHaveAttribute("type", "password");
    expect(screen.getByText("Settings → Manage API Keys")).toBeInTheDocument();
    expect(screen.getByText(GUIDE.intro)).toBeInTheDocument();
    expect(screen.getByText(GUIDE.note)).toBeInTheDocument();
  });

  it("reveal toggle switches a secret field to text and back", async () => {
    const user = userEvent.setup();
    renderForm();
    const input = screen.getByTestId("credential-input-apiKey");
    await user.click(screen.getByTestId("credential-reveal-apiKey"));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByTestId("credential-reveal-apiKey"));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("CredentialPasteForm — submit gating", () => {
  it("blocks submit while required fields are empty", async () => {
    renderForm();
    expect(screen.getByTestId("credential-paste-submit")).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByTestId("credential-input-apiKey"), "key-1");
    expect(screen.getByTestId("credential-paste-submit")).toBeDisabled();
    await user.type(screen.getByTestId("credential-input-accountToken"), "tok-1");
    expect(screen.getByTestId("credential-paste-submit")).toBeEnabled();
    expect(api.submitProviderCredentials).not.toHaveBeenCalled();
  });

  it("shows a start-again error when the state param is missing", async () => {
    renderForm(null);
    const user = userEvent.setup();
    await user.type(screen.getByTestId("credential-input-apiKey"), "key-1");
    await user.type(screen.getByTestId("credential-input-accountToken"), "tok-1");
    await user.click(screen.getByTestId("credential-paste-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/start again/i);
    expect(api.submitProviderCredentials).not.toHaveBeenCalled();
  });
});

describe("CredentialPasteForm — submit outcomes", () => {
  it("POSTs the trimmed field set once and navigates to the server redirect", async () => {
    api.submitProviderCredentials.mockResolvedValueOnce({ redirect: "/apps?integration=connected" });
    const replace = jest.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      value: { ...original, replace },
      writable: true,
    });

    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByTestId("credential-input-apiKey"), "  key-secret-1  ");
    await user.type(screen.getByTestId("credential-input-accountToken"), "tok-secret-2");
    await user.click(screen.getByTestId("credential-paste-submit"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apps?integration=connected"));
    expect(api.submitProviderCredentials).toHaveBeenCalledTimes(1);
    expect(api.submitProviderCredentials).toHaveBeenCalledWith("fixture", {
      state: "state-1",
      credentials: { apiKey: "key-secret-1", accountToken: "tok-secret-2" },
    });

    // Secrets never touch browser storage.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    Object.defineProperty(window, "location", { value: original, writable: true });
  });

  it("surfaces an invalid-credential (400) error humanized, keeping the guide visible", async () => {
    api.submitProviderCredentials.mockRejectedValueOnce(
      new CredentialPasteApiError(400, "invalid API key"),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByTestId("credential-input-apiKey"), "bad");
    await user.type(screen.getByTestId("credential-input-accountToken"), "tok");
    await user.click(screen.getByTestId("credential-paste-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid API key/);
    // Non-secret context survives the error.
    expect(screen.getByText(GUIDE.intro)).toBeInTheDocument();
    expect(screen.getByTestId("credential-paste-submit")).toBeEnabled();
  });

  it("surfaces a transient provider failure (502) as retryable with no fake success", async () => {
    api.submitProviderCredentials.mockRejectedValueOnce(
      new CredentialPasteApiError(502, "credential_ingest_failed"),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByTestId("credential-input-apiKey"), "key");
    await user.type(screen.getByTestId("credential-input-accountToken"), "tok");
    await user.click(screen.getByTestId("credential-paste-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be reached|try again/i);
  });

  it("surfaces an expired state (400 invalid state) as start-again", async () => {
    api.submitProviderCredentials.mockRejectedValueOnce(
      new CredentialPasteApiError(400, "invalid state"),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByTestId("credential-input-apiKey"), "key");
    await user.type(screen.getByTestId("credential-input-accountToken"), "tok");
    await user.click(screen.getByTestId("credential-paste-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/expired|start again/i);
  });
});

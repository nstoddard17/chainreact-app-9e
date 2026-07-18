/**
 * @jest-environment jsdom
 *
 * UI tests for the generic machine-credential connect panel. The client API is
 * mocked so we drive the FORM (fill → validate → connect → error), the
 * CONNECTED CARD (safe metadata, rotate, disconnect-with-confirm), and prove
 * secrets are never rehydrated or displayed. Uses a fixture provider — NOT ADP.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  validateMachineCertificate: jest.fn(),
  connectMachineCredential: jest.fn(),
  disconnectMachineCredential: jest.fn(),
};
jest.mock("@/lib/api/machineCredentials", () => {
  const actual = jest.requireActual("@/lib/api/machineCredentials");
  return {
    ...actual,
    validateMachineCertificate: (...a: unknown[]) => api.validateMachineCertificate(...a),
    connectMachineCredential: (...a: unknown[]) => api.connectMachineCredential(...a),
    disconnectMachineCredential: (...a: unknown[]) => api.disconnectMachineCredential(...a),
  };
});

import { MachineCredentialPanel } from "@/features/apps/machine-credentials/MachineCredentialPanel";
import type { MachineCredentialDto } from "@/lib/api/machineCredentials";

const ENVIRONMENTS = [
  { value: "iat", label: "Sandbox (IAT)" },
  { value: "prod", label: "Production" },
];

const CONNECTED: MachineCredentialDto = {
  id: "cred-1",
  provider: "dev-fixture",
  label: "Fixture",
  connectedByUserId: "u1",
  certFingerprint256: "AB:CD:EF",
  certSubject: "CN=fixture-subject",
  certNotAfter: "2126-01-01T00:00:00Z",
  certExpired: false,
  certExpiringSoon: false,
  metadata: { environment: "iat" },
  rotatedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function renderPanel(initial: MachineCredentialDto | null = null) {
  return render(
    <MachineCredentialPanel
      provider="dev-fixture"
      providerDisplayName="Dev Fixture"
      environments={ENVIRONMENTS}
      initialCredential={initial}
    />,
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("mc-client-id"), "cid");
  await user.type(screen.getByTestId("mc-client-secret"), "SUPER-SECRET");
  await user.type(screen.getByTestId("mc-cert"), "-----BEGIN CERTIFICATE-----x-----END CERTIFICATE-----");
  await user.type(screen.getByTestId("mc-key"), "-----BEGIN PRIVATE KEY-----y-----END PRIVATE KEY-----");
}

beforeEach(() => jest.clearAllMocks());

describe("connect form", () => {
  it("submit is disabled until every field is filled", async () => {
    const user = userEvent.setup();
    renderPanel(null);
    expect(screen.getByTestId("mc-submit")).toBeDisabled();
    await fillForm(user);
    expect(screen.getByTestId("mc-submit")).toBeEnabled();
  });

  it("pre-submit validate shows safe cert metadata", async () => {
    const user = userEvent.setup();
    api.validateMachineCertificate.mockResolvedValue({
      ok: true,
      cert: {
        subject: "CN=fixture-subject",
        fingerprint256: "AB:CD",
        validFrom: "2026-01-01T00:00:00Z",
        validTo: "2126-01-01T00:00:00Z",
        expired: false,
        notYetValid: false,
        keyMatches: true,
        keyError: null,
      },
    });
    renderPanel(null);
    await user.type(screen.getByTestId("mc-cert"), "CERTPEM");
    await user.type(screen.getByTestId("mc-key"), "KEYPEM");
    await user.click(screen.getByTestId("mc-validate"));
    await waitFor(() => expect(screen.getByTestId("mc-cert-subject")).toHaveTextContent("CN=fixture-subject"));
    expect(screen.getByTestId("mc-cert-verdict")).toHaveTextContent(/valid/i);
  });

  it("shows a friendly error (from the code) and no secret on connect failure", async () => {
    const user = userEvent.setup();
    const { MachineCredentialApiError } = jest.requireActual("@/lib/api/machineCredentials");
    api.connectMachineCredential.mockRejectedValue(new MachineCredentialApiError("certificate_expired", 400));
    renderPanel(null);
    await fillForm(user);
    await user.click(screen.getByTestId("mc-submit"));
    await waitFor(() => expect(screen.getByTestId("mc-error")).toBeInTheDocument());
    expect(screen.getByTestId("mc-error")).toHaveTextContent(/expired/i);
    // The typed error message is a code, not the secret.
    expect(screen.getByTestId("mc-error").textContent).not.toContain("SUPER-SECRET");
  });

  it("on success swaps to the connected card and does NOT rehydrate the secret", async () => {
    const user = userEvent.setup();
    api.connectMachineCredential.mockResolvedValue(CONNECTED);
    renderPanel(null);
    await fillForm(user);
    await user.click(screen.getByTestId("mc-submit"));
    await waitFor(() => expect(screen.getByTestId("mc-connected")).toBeInTheDocument());
    // The password field is gone (connected view); the secret is nowhere in the DOM.
    expect(screen.queryByTestId("mc-client-secret")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("SUPER-SECRET");
  });
});

describe("connected card", () => {
  it("renders only safe metadata (subject, fingerprint, expiry, dates)", () => {
    renderPanel(CONNECTED);
    expect(screen.getByTestId("mc-connected-env")).toHaveTextContent("Sandbox (IAT)");
    expect(screen.getByTestId("mc-connected-subject")).toHaveTextContent("CN=fixture-subject");
    expect(screen.getByTestId("mc-connected-rotated")).toHaveTextContent("Never");
    // No secret-bearing testids exist in the connected view.
    expect(screen.queryByTestId("mc-client-secret")).not.toBeInTheDocument();
  });

  it("shows an Expired badge when the cert is expired", () => {
    renderPanel({ ...CONNECTED, certExpired: true });
    expect(screen.getByTestId("mc-badge-expired")).toBeInTheDocument();
  });

  it("rotate opens the form again (secret entry, not rehydrated)", async () => {
    const user = userEvent.setup();
    renderPanel(CONNECTED);
    await user.click(screen.getByTestId("mc-rotate-open"));
    expect(screen.getByTestId("mc-rotate")).toBeInTheDocument();
    // A fresh, empty secret field — never pre-filled.
    expect((screen.getByTestId("mc-client-secret") as HTMLInputElement).value).toBe("");
  });

  it("disconnect requires confirmation and then calls the API", async () => {
    const user = userEvent.setup();
    api.disconnectMachineCredential.mockResolvedValue({ disconnected: true });
    renderPanel(CONNECTED);
    await user.click(screen.getByTestId("mc-disconnect-open"));
    expect(screen.getByTestId("mc-confirm")).toBeInTheDocument();
    expect(api.disconnectMachineCredential).not.toHaveBeenCalled(); // not yet
    await user.click(screen.getByTestId("mc-confirm-disconnect"));
    await waitFor(() => expect(api.disconnectMachineCredential).toHaveBeenCalledWith("dev-fixture"));
    // Back to the connect form (disconnected).
    await waitFor(() => expect(screen.getByTestId("mc-form")).toBeInTheDocument());
  });
});

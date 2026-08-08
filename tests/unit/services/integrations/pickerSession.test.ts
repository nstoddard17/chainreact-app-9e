/**
 * @jest-environment node
 *
 * GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2 — picker-session security contract.
 *
 * This is the ONLY path that returns a provider access token to a browser, so
 * the tests here are the boundary: who may mint one, for what, and what the
 * response may never contain.
 */
const mockGetActiveForExecution = jest.fn();
const mockEnsurePersonalAccount = jest.fn();
const mockDecideOptionsCredential = jest.fn();
const mockResolveWorkflowCreatorContext = jest.fn();
const mockResolveEffectiveNodeOwner = jest.fn();
const mockCredentialSharingForProvider = jest.fn();
const mockRefresh = jest.fn();
const mockDecryptToken = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActiveForExecution(...a),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));
jest.mock("@/services/options/credentialPolicy", () => ({
  decideOptionsCredential: (...a: unknown[]) => mockDecideOptionsCredential(...a),
}));
jest.mock("@/services/options/workflowCreatorContext", () => ({
  resolveWorkflowCreatorContext: (...a: unknown[]) =>
    mockResolveWorkflowCreatorContext(...a),
}));
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  resolveEffectiveNodeOwner: (...a: unknown[]) => mockResolveEffectiveNodeOwner(...a),
}));
jest.mock("@/core/integrations/credentialSharing", () => ({
  credentialSharingForProvider: (...a: unknown[]) => mockCredentialSharingForProvider(...a),
}));
jest.mock("@/services/oauth/dispatcher", () => ({
  refresh: (...a: unknown[]) => mockRefresh(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecryptToken(...a),
}));

import { createPickerSession } from "@/services/integrations/pickerSession";

const OLD_ENV = { ...process.env };

function integrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    provider: "google-sheets",
    providerAccountId: "user@example.test",
    accessTokenEncrypted: "ENCRYPTED",
    refreshTokenEncrypted: "ENCRYPTED-REFRESH",
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scopes: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_GOOGLE_PICKER_APP_ID: "111222333",
    NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: "browser-key",
  };
  mockCredentialSharingForProvider.mockReturnValue("personal");
  mockResolveWorkflowCreatorContext.mockResolvedValue(null);
  mockDecideOptionsCredential.mockReturnValue({ kind: "legacy" });
  mockEnsurePersonalAccount.mockResolvedValue({ id: "acct-1" });
  mockGetActiveForExecution.mockResolvedValue(integrationRow());
  mockDecryptToken.mockReturnValue("ya29.PLAINTEXT");
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe("createPickerSession — happy path", () => {
  it("returns ONLY the access token + public picker identifiers (never the refresh token or ciphertext)", async () => {
    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });

    expect(result).toEqual({
      ok: true,
      accessToken: "ya29.PLAINTEXT",
      appId: "111222333",
      apiKey: "browser-key",
      mimeType: "application/vnd.google-apps.spreadsheet",
    });

    // Serialized response must never carry refresh material or ciphertext.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("ENCRYPTED-REFRESH");
    expect(serialized).not.toContain("ENCRYPTED");
    expect(serialized).not.toContain("refreshToken");
  });

  it("filters the picker to spreadsheets only", async () => {
    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });
    expect(result).toMatchObject({
      ok: true,
      mimeType: "application/vnd.google-apps.spreadsheet",
    });
  });
});

describe("createPickerSession — authorization", () => {
  it("refuses a non-owner BEFORE any credential lookup (no token minted for another member's private connection)", async () => {
    mockDecideOptionsCredential.mockReturnValue({ kind: "not-owner" });

    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "other-member",
      workflowId: "wf-1",
      nodeId: "node-1",
    });

    expect(result).toMatchObject({ ok: false, code: "NOT_WORKFLOW_OWNER" });
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });

  it("pins the creator's credential for a personal-provider workflow node", async () => {
    mockResolveWorkflowCreatorContext.mockResolvedValue({ workflowId: "wf-1" });
    mockResolveEffectiveNodeOwner.mockResolvedValue("owner-user");
    mockDecideOptionsCredential.mockReturnValue({
      kind: "personal-creator",
      accountId: "acct-9",
      connectedByUserId: "owner-user",
    });

    await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "owner-user",
      workflowId: "wf-1",
      nodeId: "node-1",
    });

    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-9", "google-sheets", null, {
      connectedByUserId: "owner-user",
    });
  });

  it("reports a typed not-connected state when there is no integration", async () => {
    mockGetActiveForExecution.mockResolvedValue(null);
    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });
    expect(result).toMatchObject({ ok: false, code: "INTEGRATION_NOT_CONNECTED" });
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });
});

describe("createPickerSession — token freshness", () => {
  it("refreshes an expired access token before handing one to the browser", async () => {
    mockGetActiveForExecution.mockResolvedValue(
      integrationRow({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    mockRefresh.mockResolvedValue({
      integration: integrationRow({ accessTokenEncrypted: "FRESH" }),
    });
    mockDecryptToken.mockReturnValue("ya29.FRESH");

    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, accessToken: "ya29.FRESH" });
  });

  it("maps a failed refresh to a reconnect prompt, not a stale token", async () => {
    mockGetActiveForExecution.mockResolvedValue(
      integrationRow({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    mockRefresh.mockRejectedValue(new Error("invalid_grant"));

    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });

    expect(result).toMatchObject({ ok: false, code: "PROVIDER_REAUTH_REQUIRED" });
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });

  it("does not refresh a token that is still comfortably valid", async () => {
    await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("createPickerSession — configuration", () => {
  it("reports PICKER_NOT_CONFIGURED (and mints nothing) when the public picker identifiers are unset", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;

    const result = await createPickerSession({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: null,
      nodeId: null,
    });

    expect(result).toMatchObject({ ok: false, code: "PICKER_NOT_CONFIGURED" });
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });
});

/**
 * @jest-environment node
 *
 * Tests for the `diagnoseProviderConnection` capability (Slice 4.MCP-STAGE-2B-2
 * CS-2 extraction) and `diagnoseWorkflowConnections` (2B-4 composition).
 *
 * Called DIRECTLY (no HTTP, no gate) — the gate is the route's job. These prove
 * the capability owns membership authz + personal-provider provenance + the
 * stored-state read + the REAL `deriveConnectionDiagnosis`, and never leaks
 * token/identity/metadata. Only the leaf boundaries are mocked: the integrations
 * repo, the membership check, the workflow service-role read, and the manifest
 * registry. `decideOptionsCredential` + `credentialSharingForProvider` +
 * `deriveConnectionDiagnosis` run for real.
 */

const mockGetActive = jest.fn();
const mockGetById = jest.fn();
const mockCountActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetById(...a),
  countActiveByAccountProviderServiceRole: (...a: unknown[]) => mockCountActive(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

import {
  diagnoseProviderConnection,
  noAccountAccessDto,
} from "@/services/diagnostics/integrationConnection";

const ACCT = "acct-team";

function manifest(over: Record<string, unknown> = {}) {
  return {
    id: "slack",
    displayName: "Slack",
    isEnabled: true,
    refreshable: true,
    scopes: { required: ["channels:read", "groups:read"], optional: [], deprecated: [] },
    ...over,
  };
}

const slackRow = (over: Record<string, unknown> = {}) => ({
  id: "int-1",
  accountId: ACCT,
  connectedByUserId: "creator-1",
  provider: "slack",
  providerAccountId: "T01",
  displayName: "WS",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["channels:read", "groups:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  ...over,
});

const creator = (over: Record<string, unknown> = {}) => ({
  workflowId: "wf",
  createdByUserId: "u1",
  accountId: ACCT,
  ...over,
});

beforeEach(() => {
  mockGetActive.mockReset();
  mockGetById.mockReset();
  mockCountActive.mockReset();
  mockCountActive.mockResolvedValue(1);
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  mockGetWorkflow.mockReset();
  mockGetProvider.mockReset();
  mockGetProvider.mockReturnValue(manifest());
});

// ─────────────────── diagnoseProviderConnection — status mapping ───────────────────
describe("diagnoseProviderConnection — status mapping", () => {
  it("CONNECTED — account provider, active, scopes satisfied, account-wide count", async () => {
    mockGetActive.mockResolvedValue(slackRow());
    mockCountActive.mockResolvedValue(3);
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "slack",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(dto).toMatchObject({
      ok: true,
      status: "CONNECTED",
      credentialClass: "account",
      activeConnectionCount: 3,
      hasActiveRow: true,
      scopesSatisfied: true,
    });
    expect(mockCountActive).toHaveBeenCalledWith(ACCT, "slack");
  });

  it("DISCONNECTED — no active row", async () => {
    mockGetActive.mockResolvedValue(null);
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "slack",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(dto).toMatchObject({ ok: false, status: "DISCONNECTED", hasActiveRow: false });
  });

  it("MISSING_SCOPES — gap names only in this arm", async () => {
    mockGetActive.mockResolvedValue(slackRow({ scopes: ["channels:read"] }));
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "slack",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(dto).toMatchObject({
      status: "MISSING_SCOPES",
      missingScopeCount: 1,
      missingScopes: ["groups:read"],
    });
  });

  it("PROVIDER_DISABLED / PROVIDER_UNKNOWN are represented by safe codes", async () => {
    mockGetProvider.mockReturnValue(manifest({ isEnabled: false }));
    mockGetActive.mockResolvedValue(slackRow());
    const disabled = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "slack",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(disabled.status).toBe("PROVIDER_DISABLED");

    mockGetProvider.mockReturnValue(undefined);
    const unknown = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "bogus",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(unknown.status).toBe("PROVIDER_UNKNOWN");
    expect(mockGetActive).toHaveBeenCalledTimes(1); // unknown provider fetched nothing
  });
});

// ─────────────────── diagnoseProviderConnection — authz / provenance ───────────────────
describe("diagnoseProviderConnection — authz walls fetch nothing", () => {
  it("NO_ACCOUNT_ACCESS — non-member, no integration fetch", async () => {
    mockIsMember.mockResolvedValue(false);
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "slack",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(dto.status).toBe("NO_ACCOUNT_ACCESS");
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockCountActive).not.toHaveBeenCalled();
  });

  it("NOT_WORKFLOW_OWNER — personal provider, non-creator, no credential fetch", async () => {
    mockGetProvider.mockReturnValue(manifest({ id: "gmail" }));
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "gmail",
      accountId: ACCT,
      workflowCreator: creator({ createdByUserId: "creator-42" }),
    });
    expect(dto.status).toBe("NOT_WORKFLOW_OWNER");
    expect(dto.credentialClass).toBe("personal");
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("personal provider, creator → pinned lookup, personal count scoped (no account-wide count)", async () => {
    mockGetProvider.mockReturnValue(
      manifest({ id: "gmail", scopes: { required: [], optional: [], deprecated: [] } }),
    );
    mockGetActive.mockResolvedValue(
      slackRow({ provider: "gmail", connectedByUserId: "u1", scopes: [] }),
    );
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "gmail",
      accountId: ACCT,
      workflowCreator: creator({ createdByUserId: "u1" }),
    });
    expect(dto.status).toBe("CONNECTED");
    expect(mockGetActive).toHaveBeenCalledWith(ACCT, "gmail", null, { connectedByUserId: "u1" });
    expect(mockCountActive).not.toHaveBeenCalled();
    expect(dto.activeConnectionCount).toBe(1);
  });

  it("personal provider, no workflow → pinned to the SUBJECT's own connection", async () => {
    mockGetProvider.mockReturnValue(
      manifest({ id: "gmail", scopes: { required: [], optional: [], deprecated: [] } }),
    );
    mockGetActive.mockResolvedValue(
      slackRow({ provider: "gmail", connectedByUserId: "u1", scopes: [] }),
    );
    await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "gmail",
      accountId: ACCT,
      workflowCreator: null,
    });
    expect(mockGetActive).toHaveBeenCalledWith(ACCT, "gmail", null, { connectedByUserId: "u1" });
    expect(mockCountActive).not.toHaveBeenCalled();
  });

  it("personal pinned row owned by ANOTHER member reads as disconnected", async () => {
    mockGetProvider.mockReturnValue(manifest({ id: "gmail" }));
    mockGetById.mockResolvedValue(slackRow({ provider: "gmail", connectedByUserId: "someone-else" }));
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "gmail",
      accountId: ACCT,
      workflowCreator: creator({ createdByUserId: "u1" }),
      integrationId: "int-1",
    });
    expect(dto.status).toBe("DISCONNECTED");
  });
});

// ─────────────────── noAccountAccessDto ───────────────────
describe("noAccountAccessDto", () => {
  it("returns a NO_ACCOUNT_ACCESS DTO echoing the account, no fetch", async () => {
    const dto = noAccountAccessDto("gmail", null);
    expect(dto).toMatchObject({
      ok: false,
      status: "NO_ACCOUNT_ACCESS",
      provider: "gmail",
      accountId: null,
      credentialClass: "personal",
    });
    expect(mockGetActive).not.toHaveBeenCalled();
  });
});

// ─────────────────── no-leak ───────────────────
describe("diagnoseProviderConnection — no-leak", () => {
  it("never serializes token blobs, identity, label, metadata, full scopes, or exact expiry", async () => {
    const EXP = "2027-01-01T00:00:00.000Z";
    mockGetActive.mockResolvedValue({
      id: "int-1",
      accountId: ACCT,
      connectedByUserId: "creator-SECRET-42",
      provider: "slack",
      providerAccountId: "T01SECRET",
      displayName: "Acme Secret Workspace",
      accessTokenEncrypted: "enc:VERYSECRETCIPHER",
      refreshTokenEncrypted: "enc:REFRESHSECRET",
      accessTokenExpiresAt: EXP,
      scopes: ["channels:read", "groups:read", "chat:write"],
      accountMetadata: { team: "AcmeSecretTeam" },
      disconnectedAt: null,
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    });
    const dto = await diagnoseProviderConnection({
      subjectUserId: "u1",
      provider: "slack",
      accountId: ACCT,
      workflowCreator: null,
    });
    const json = JSON.stringify(dto);
    for (const forbidden of [
      "VERYSECRETCIPHER",
      "REFRESHSECRET",
      "enc:",
      "creator-SECRET-42",
      "T01SECRET",
      "Acme Secret Workspace",
      "AcmeSecretTeam",
      "chat:write",
      EXP,
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const key of [
      "accessTokenEncrypted",
      "refreshTokenEncrypted",
      "connectedByUserId",
      "providerAccountId",
      "displayName",
      "accountMetadata",
    ]) {
      expect(dto).not.toHaveProperty(key);
    }
  });
});

/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/integration-connection/route.ts`
 * (Slice 4.MCP-STAGE-2B-2, CS-2).
 *
 * The route runs the REAL `deriveConnectionDiagnosis` + `decideOptionsCredential`
 * + `credentialSharingForProvider` (so mapping + provenance are genuine); only the
 * leaf boundaries are mocked: the integrations repo, the membership check, the
 * workflow lookup, and the provider-manifest registry. No `requireUser` — the
 * machine bearer gates, the subject is the explicit `userId`.
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
  // CHECK-ACTIONS-3: the connection diagnosis resolves the caller's role to compute
  // `canReconnect`. Not asserted here; default to owner so the existing status-mapping
  // and no-leak cases are unaffected.
  getRoleServiceRole: () => Promise.resolve("owner"),
}));

const mockGetWorkflowById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetWorkflowById(...a),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/integration-connection/route";

const GOOD_TOKEN = "diag-conn-token-0123456789abcdef";

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

beforeEach(() => {
  mockGetActive.mockReset();
  mockGetById.mockReset();
  mockCountActive.mockReset();
  mockCountActive.mockResolvedValue(1);
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true); // member by default
  mockGetWorkflowById.mockReset();
  mockGetProvider.mockReset();
  mockGetProvider.mockReturnValue(manifest()); // slack, enabled, refreshable
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/integration-connection", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const ACCT = "acct-team";
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

// ───────────────────────────── Gate ─────────────────────────────
describe("integration-connection — gate", () => {
  it("404 when disabled (even with a valid bearer)", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    expect((await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).status).toBe(404);
  });
  it("404 in production without allow flag", async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = "production";
    const res = await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }));
    // @ts-expect-error restore
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(404);
  });
  it("401 on missing/wrong bearer", async () => {
    expect((await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }, null))).status).toBe(401);
    expect((await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }, "wrong"))).status).toBe(401);
  });
  it("never echoes the token in a gate body", async () => {
    const res = await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }, "wrong"));
    expect(await res.text()).not.toContain(GOOD_TOKEN);
  });
});

// ───────────────────────── Input validation ─────────────────────────
describe("integration-connection — input validation", () => {
  it("400 when provider missing/malformed", async () => {
    expect((await POST(req({ userId: "u1", accountId: ACCT }))).status).toBe(400);
    expect((await POST(req({ provider: "Bad Provider", userId: "u1", accountId: ACCT }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ provider: "slack", accountId: ACCT }))).status).toBe(400);
  });
  it("400 when neither accountId nor workflowId given", async () => {
    expect((await POST(req({ provider: "slack", userId: "u1" }))).status).toBe(400);
  });
  it("400 when accountId contradicts the workflow's account", async () => {
    mockGetWorkflowById.mockResolvedValue({ id: "wf", createdByUserId: "u1", accountId: "acct-other" });
    expect(
      (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT, workflowId: "wf" }))).status,
    ).toBe(400);
  });
});

// ───────────────────── Per-status mapping ─────────────────────
describe("integration-connection — status mapping", () => {
  it("CONNECTED — account provider, active, scopes satisfied", async () => {
    mockGetActive.mockResolvedValue(slackRow());
    mockCountActive.mockResolvedValue(2);
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({
      ok: true,
      status: "CONNECTED",
      credentialClass: "account",
      activeConnectionCount: 2,
      hasActiveRow: true,
      scopesSatisfied: true,
    });
  });

  it("DISCONNECTED — no active row", async () => {
    mockGetActive.mockResolvedValue(null);
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({ ok: false, status: "DISCONNECTED", hasActiveRow: false });
  });

  it("PROVIDER_DISABLED — manifest disabled", async () => {
    mockGetProvider.mockReturnValue(manifest({ isEnabled: false }));
    mockGetActive.mockResolvedValue(slackRow());
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({ status: "PROVIDER_DISABLED", providerEnabled: false });
  });

  it("RECONNECT_REQUIRED — expired + non-refreshable", async () => {
    mockGetProvider.mockReturnValue(manifest({ refreshable: false }));
    mockGetActive.mockResolvedValue(slackRow({ accessTokenExpiresAt: "2000-01-01T00:00:00Z" }));
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({ status: "RECONNECT_REQUIRED", tokenExpired: true, refreshable: false });
  });

  it("TOKEN_EXPIRED — expired + refreshable", async () => {
    mockGetProvider.mockReturnValue(manifest({ refreshable: true }));
    mockGetActive.mockResolvedValue(slackRow({ accessTokenExpiresAt: "2000-01-01T00:00:00Z" }));
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({ status: "TOKEN_EXPIRED", tokenExpired: true, refreshable: true });
  });

  it("MISSING_SCOPES — gap names returned only in this arm", async () => {
    mockGetActive.mockResolvedValue(slackRow({ scopes: ["channels:read"] }));
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({
      status: "MISSING_SCOPES",
      missingScopeCount: 1,
      missingScopes: ["groups:read"],
    });
  });

  it("PROVIDER_UNKNOWN — unregistered provider (no row fetch)", async () => {
    mockGetProvider.mockReturnValue(undefined);
    const dto = await (await POST(req({ provider: "bogus", userId: "u1", accountId: ACCT }))).json();
    expect(dto).toMatchObject({ status: "PROVIDER_UNKNOWN" });
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("omits missingScopes outside the MISSING_SCOPES arm", async () => {
    mockGetActive.mockResolvedValue(slackRow());
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto).not.toHaveProperty("missingScopes");
  });
});

// ─────────────── Authorization / provenance (no fetch) ───────────────
describe("integration-connection — authz walls fetch nothing", () => {
  it("NO_ACCOUNT_ACCESS — non-member, no integration fetch", async () => {
    mockIsMember.mockResolvedValue(false);
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    expect(dto.status).toBe("NO_ACCOUNT_ACCESS");
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockCountActive).not.toHaveBeenCalled();
  });

  it("NO_ACCOUNT_ACCESS — workflowId that does not resolve, no fetch", async () => {
    mockGetWorkflowById.mockResolvedValue(null);
    const dto = await (await POST(req({ provider: "gmail", userId: "u1", workflowId: "wf-x" }))).json();
    expect(dto.status).toBe("NO_ACCOUNT_ACCESS");
    expect(mockIsMember).not.toHaveBeenCalled();
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("NOT_WORKFLOW_OWNER — personal provider, non-creator, no credential fetch", async () => {
    mockGetProvider.mockReturnValue(manifest({ id: "gmail" }));
    mockGetWorkflowById.mockResolvedValue({ id: "wf", createdByUserId: "creator-42", accountId: ACCT });
    const dto = await (await POST(req({ provider: "gmail", userId: "u1", workflowId: "wf" }))).json();
    expect(dto.status).toBe("NOT_WORKFLOW_OWNER");
    expect(dto.credentialClass).toBe("personal");
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("personal provider, creator → pinned lookup (connectedByUserId = creator)", async () => {
    mockGetProvider.mockReturnValue(manifest({ id: "gmail", scopes: { required: [], optional: [], deprecated: [] } }));
    mockGetWorkflowById.mockResolvedValue({ id: "wf", createdByUserId: "u1", accountId: ACCT });
    mockGetActive.mockResolvedValue(slackRow({ provider: "gmail", connectedByUserId: "u1", scopes: [] }));
    const dto = await (await POST(req({ provider: "gmail", userId: "u1", workflowId: "wf" }))).json();
    expect(dto.status).toBe("CONNECTED");
    expect(mockGetActive).toHaveBeenCalledWith(ACCT, "gmail", null, { connectedByUserId: "u1" });
  });

  it("personal provider, no workflow → pinned to the SUBJECT's own connection", async () => {
    mockGetProvider.mockReturnValue(manifest({ id: "gmail", scopes: { required: [], optional: [], deprecated: [] } }));
    mockGetActive.mockResolvedValue(slackRow({ provider: "gmail", connectedByUserId: "u1", scopes: [] }));
    await POST(req({ provider: "gmail", userId: "u1", accountId: ACCT }));
    expect(mockGetActive).toHaveBeenCalledWith(ACCT, "gmail", null, { connectedByUserId: "u1" });
    // Personal count is scoped to the resolved connection, not account-wide.
    expect(mockCountActive).not.toHaveBeenCalled();
  });
});

// ───────────────── integrationId cross-account isolation ─────────────────
describe("integration-connection — integrationId pin", () => {
  it("a row from another account is indistinguishable from disconnected", async () => {
    mockGetById.mockResolvedValue(null); // exact (accountId, integrationId) miss
    const dto = await (
      await POST(req({ provider: "slack", userId: "u1", accountId: ACCT, integrationId: "int-other" }))
    ).json();
    expect(dto.status).toBe("DISCONNECTED");
    expect(mockGetById).toHaveBeenCalledWith(ACCT, "int-other");
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("a soft-disconnected pinned row → DISCONNECTED", async () => {
    mockGetById.mockResolvedValue(slackRow({ disconnectedAt: "2026-05-02T00:00:00Z" }));
    const dto = await (
      await POST(req({ provider: "slack", userId: "u1", accountId: ACCT, integrationId: "int-1" }))
    ).json();
    expect(dto.status).toBe("DISCONNECTED");
  });

  it("personal pinned row owned by ANOTHER member reads as disconnected", async () => {
    mockGetProvider.mockReturnValue(manifest({ id: "gmail" }));
    mockGetById.mockResolvedValue(slackRow({ provider: "gmail", connectedByUserId: "someone-else" }));
    const dto = await (
      await POST(req({ provider: "gmail", userId: "u1", accountId: ACCT, integrationId: "int-1" }))
    ).json();
    expect(dto.status).toBe("DISCONNECTED");
  });
});

// ───────────────────────── No-leak ─────────────────────────
describe("integration-connection — no-leak", () => {
  it("never serializes token blobs, connectedByUserId, providerAccountId, label, metadata, full scopes, or exact expiry", async () => {
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
    const dto = await (await POST(req({ provider: "slack", userId: "u1", accountId: ACCT }))).json();
    const json = JSON.stringify(dto);
    for (const forbidden of [
      "VERYSECRETCIPHER",
      "REFRESHSECRET",
      "enc:",
      "creator-SECRET-42",
      "T01SECRET",
      "Acme Secret Workspace",
      "AcmeSecretTeam",
      "chat:write", // a GRANTED scope not in required → must never appear
      EXP, // exact expiry timestamp
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

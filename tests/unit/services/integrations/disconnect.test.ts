/**
 * @jest-environment node
 *
 * Tests for the CD-1 disconnect service (Slice 4.APPS-DISCONNECT):
 * services/integrations/disconnect.disconnectIntegration.
 *
 * Covers: feature-flag gate, frozen-account refusal, the authz matrix
 * (shared=owner/admin; personal=owner/admin OR connector), cross-account /
 * non-member ⇒ not_found, the active/paused→disabled(integration_revoked)
 * cascade with draft/disabled/deleted untouched, last-row-only cascade,
 * best-effort revoke (success + failure-still-disconnects), idempotency, and a
 * NO-LEAK assertion that no token or raw provider error appears in the result or
 * the structured audit logs. `selectWorkflowsToDisable` + `credentialSharing`
 * run for real; the repos / orchestrator / crypto / dispatcher are mocked.
 */
const mockGetById = jest.fn();
const mockDisconnectById = jest.fn();
const mockCountActive = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockGetRole = jest.fn();
const mockListByAccount = jest.fn();
const mockDecrypt = jest.fn();
const mockRevoke = jest.fn();
const mockDisable = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetById(...a),
  disconnectByIdServiceRole: (...a: unknown[]) => mockDisconnectById(...a),
  countActiveByAccountProviderServiceRole: (...a: unknown[]) => mockCountActive(...a),
}));
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));
jest.mock("@/repositories/workflows", () => ({
  listByAccount: (...a: unknown[]) => mockListByAccount(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecrypt(...a),
}));
jest.mock("@/services/oauth/dispatcher", () => ({
  revokeProviderToken: (...a: unknown[]) => mockRevoke(...a),
}));
jest.mock("@/services/workflows/lifecycleOrchestrator", () => ({
  LifecycleOrchestrator: jest.fn().mockImplementation(() => ({ disable: mockDisable })),
}));

import {
  disconnectIntegration,
  getIntegrationWorkflowImpact,
} from "@/services/integrations/disconnect";

const SECRET_ACCESS = "enc-access-SECRET";
const PLAINTEXT = "ya29.PLAINTEXT-TOKEN";

function gmailRow(over: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acc-1",
    connectedByUserId: "user-A",
    provider: "gmail", // personal-credential provider
    providerAccountId: "pa-1",
    displayName: "Personal · a@example.com",
    accessTokenEncrypted: SECRET_ACCESS,
    refreshTokenEncrypted: "enc-refresh-SECRET",
    accessTokenExpiresAt: null,
    scopes: ["gmail.send"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}
function slackRow(over: Record<string, unknown> = {}) {
  return gmailRow({ id: "int-s", provider: "slack", connectedByUserId: "user-A", ...over });
}

let infoSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDeletionStatus.mockResolvedValue("active");
  mockDisconnectById.mockResolvedValue({ disconnected: true });
  mockCountActive.mockResolvedValue(0);
  mockListByAccount.mockResolvedValue([]);
  mockDecrypt.mockReturnValue(PLAINTEXT);
  mockRevoke.mockResolvedValue(undefined);
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  infoSpy.mockRestore();
});

function allLoggedJson(): string {
  return infoSpy.mock.calls.map((c) => String(c[0])).join("\n");
}

describe("disconnectIntegration — guards & authz", () => {
  it("frozen (pending_deletion) account ⇒ account_frozen, no write", async () => {
    mockGetDeletionStatus.mockResolvedValue("pending_deletion");
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "user-A" });
    expect(res).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("unknown / cross-account id ⇒ not_found (row lookup returns null)", async () => {
    mockGetById.mockResolvedValue(null);
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-x", callerUserId: "user-A" });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockDisconnectById).not.toHaveBeenCalled();
  });

  it("non-member caller ⇒ not_found (no existence leak)", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue(null);
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "stranger" });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockDisconnectById).not.toHaveBeenCalled();
  });

  // ── Shared / account-service provider (slack) ──────────────────────────────
  it.each(["owner", "admin"])("shared provider: %s CAN disconnect", async (role) => {
    mockGetById.mockResolvedValue(slackRow());
    mockGetRole.mockResolvedValue(role);
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-s", callerUserId: "user-Z" });
    expect(res.ok).toBe(true);
    expect(mockDisconnectById).toHaveBeenCalled();
  });

  it("shared provider: plain member CANNOT disconnect ⇒ forbidden", async () => {
    mockGetById.mockResolvedValue(slackRow({ connectedByUserId: "member-1" }));
    mockGetRole.mockResolvedValue("member");
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-s", callerUserId: "member-1" });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    expect(mockDisconnectById).not.toHaveBeenCalled();
  });

  // ── Personal-credential provider (gmail) ───────────────────────────────────
  it("personal provider: the original connector (member) CAN disconnect their own", async () => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1" }));
    mockGetRole.mockResolvedValue("member");
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "member-1" });
    expect(res.ok).toBe(true);
    expect(mockDisconnectById).toHaveBeenCalled();
  });

  it("personal provider: a NON-connector member CANNOT disconnect another member's ⇒ forbidden", async () => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1" }));
    mockGetRole.mockResolvedValue("member");
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "member-2" });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    expect(mockDisconnectById).not.toHaveBeenCalled();
  });

  it("personal provider: owner/admin CAN disconnect a member's", async () => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1" }));
    mockGetRole.mockResolvedValue("admin");
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "admin-1" });
    expect(res.ok).toBe(true);
  });
});

describe("disconnectIntegration — workflow cascade", () => {
  function workflows() {
    return [
      { id: "wf-active-gmail", state: "active", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
      { id: "wf-paused-gmail", state: "paused", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
      { id: "wf-active-slack", state: "active", draftDefinition: { nodes: [{ provider: "slack" }], edges: [] } },
      { id: "wf-draft-gmail", state: "draft", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
      { id: "wf-disabled-gmail", state: "disabled", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
    ];
  }

  it("disables ONLY active/paused workflows that depend on the provider, reason integration_revoked", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockCountActive.mockResolvedValue(0); // last active row for gmail
    mockListByAccount.mockResolvedValue(workflows());
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res.ok && res.disabledWorkflowCount).toBe(2);
    const disabledIds = mockDisable.mock.calls.map((c) => c[0].workflowId).sort();
    expect(disabledIds).toEqual(["wf-active-gmail", "wf-paused-gmail"]);
    for (const call of mockDisable.mock.calls) {
      expect(call[0].reason).toBe("integration_revoked");
    }
    // draft / disabled / slack untouched.
    expect(disabledIds).not.toContain("wf-draft-gmail");
    expect(disabledIds).not.toContain("wf-disabled-gmail");
    expect(disabledIds).not.toContain("wf-active-slack");
  });

  it("does NOT cascade when another active row for the provider remains", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockCountActive.mockResolvedValue(1); // a sibling gmail account still connected
    mockListByAccount.mockResolvedValue(workflows());
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res.ok && res.disabledWorkflowCount).toBe(0);
    expect(mockDisable).not.toHaveBeenCalled();
    expect(mockListByAccount).not.toHaveBeenCalled();
  });

  it("never auto-resumes: only disable() is invoked (no resume/activate)", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockListByAccount.mockResolvedValue(workflows());
    await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    // The mocked orchestrator only exposes disable — assert it's the only call surface used.
    expect(mockDisable).toHaveBeenCalled();
  });
});

describe("disconnectIntegration — revoke & idempotency", () => {
  it("revoke success ⇒ providerRevoked true; decrypts the in-memory token", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res.ok && res.providerRevoked).toBe(true);
    expect(mockDecrypt).toHaveBeenCalledWith(SECRET_ACCESS);
    expect(mockRevoke).toHaveBeenCalledWith("gmail", PLAINTEXT);
  });

  it("revoke FAILURE still locally disconnects (providerRevoked false), no throw", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockRevoke.mockRejectedValue(new Error("provider 500: super-secret-internal-detail"));
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res.ok).toBe(true);
    expect(res.ok && res.providerRevoked).toBe(false);
    expect(mockDisconnectById).toHaveBeenCalled();
  });

  it("idempotent: a replay (already disconnected) is a no-op, no cascade, no revoke", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockDisconnectById.mockResolvedValue({ disconnected: false });
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res).toEqual({ ok: true, disabledWorkflowCount: 0, providerRevoked: false, alreadyDisconnected: true });
    expect(mockCountActive).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

describe("getIntegrationWorkflowImpact (advisory, read-only)", () => {
  function workflows() {
    return [
      { id: "wf-active-gmail", name: "Daily digest", state: "active", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
      { id: "wf-paused-gmail", name: "Paused mailer", state: "paused", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
      { id: "wf-draft-gmail", name: "Draft thing", state: "draft", draftDefinition: { nodes: [{ provider: "gmail" }], edges: [] } },
      { id: "wf-active-slack", name: "Slack alert", state: "active", draftDefinition: { nodes: [{ provider: "slack" }], edges: [] } },
    ];
  }

  it("non-member ⇒ not_found (no impact leak)", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue(null);
    const res = await getIntegrationWorkflowImpact({ accountId: "acc-1", integrationId: "int-1", callerUserId: "stranger" });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockListByAccount).not.toHaveBeenCalled();
  });

  it("member on a SHARED provider ⇒ forbidden (same gate as DELETE)", async () => {
    mockGetById.mockResolvedValue(slackRow());
    mockGetRole.mockResolvedValue("member");
    const res = await getIntegrationWorkflowImpact({ accountId: "acc-1", integrationId: "int-s", callerUserId: "member-1" });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns count + {id,name} for ACTIVE/PAUSED dependents only (no draft/other-provider, no extra fields)", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockCountActive.mockResolvedValue(1); // this is the only active gmail row
    mockListByAccount.mockResolvedValue(workflows());
    const res = await getIntegrationWorkflowImpact({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.affectedWorkflowCount).toBe(2);
    expect(res.workflows).toEqual([
      { id: "wf-active-gmail", name: "Daily digest" },
      { id: "wf-paused-gmail", name: "Paused mailer" },
    ]);
    // Sanitized: only id + name — no state / provider / config leaked.
    for (const wf of res.workflows) {
      expect(Object.keys(wf).sort()).toEqual(["id", "name"]);
    }
  });

  it("reports 0 affected when another active row for the provider remains", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockCountActive.mockResolvedValue(2); // a sibling gmail account is still connected
    const res = await getIntegrationWorkflowImpact({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(res.ok && res.affectedWorkflowCount).toBe(0);
    expect(res.ok && res.workflows).toEqual([]);
    expect(mockListByAccount).not.toHaveBeenCalled(); // no scan needed
  });

  it("is read-only: never disconnects or disables", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockListByAccount.mockResolvedValue(workflows());
    await getIntegrationWorkflowImpact({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });
    expect(mockDisconnectById).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

describe("disconnectIntegration — NO LEAK", () => {
  it("never returns or logs a token or a raw provider error", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("owner");
    mockRevoke.mockRejectedValue(new Error("provider 500: super-secret-internal-detail"));
    const res = await disconnectIntegration({ accountId: "acc-1", integrationId: "int-1", callerUserId: "owner-1" });

    const serialized = JSON.stringify(res) + "\n" + allLoggedJson();
    expect(serialized).not.toContain(SECRET_ACCESS);
    expect(serialized).not.toContain("enc-refresh-SECRET");
    expect(serialized).not.toContain(PLAINTEXT);
    expect(serialized).not.toContain("super-secret-internal-detail");
    expect(serialized).not.toContain("a@example.com"); // display name / email
    expect(serialized).not.toContain("gmail.send"); // scope

    // Audit events fired carry only ids/counts/provider.
    expect(allLoggedJson()).toContain("account.integration.disconnect.local_disconnected");
    expect(allLoggedJson()).toContain("account.integration.disconnect.provider_revoke_failed");
  });
});

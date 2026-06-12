/**
 * @jest-environment node
 *
 * Tests for the CS-2 connection-sharing service
 * (services/integrations/connectionSharing.setIntegrationSharingScope).
 *
 * Covers: flag gate (OFF ⇒ no I/O, no mutation), frozen-account refusal, the
 * authz matrix (SHARE = connector only; UNSHARE = connector OR owner/admin
 * safety), cross-account / non-member / disconnected ⇒ not_found, account-
 * provider rejection, the changed flag, the disconnected-mid-flight race, the
 * admin-safety audit event, and a NO-LEAK assertion that no token / email /
 * scope / connector id appears in the result or the structured audit logs.
 * `credentialSharing` + `sharingScope` run for real; repos + the flag are mocked.
 */
const mockGetById = jest.fn();
const mockSetScope = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockGetRole = jest.fn();
const mockFlag = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetById(...a),
  setSharingScopeByIdServiceRole: (...a: unknown[]) => mockSetScope(...a),
}));
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));
jest.mock("@/services/integrations/connectionSharingFlags", () => ({
  isConnectionSharingEnabled: () => mockFlag(),
}));

import { setIntegrationSharingScope } from "@/services/integrations/connectionSharing";

const SECRET_ACCESS = "enc-access-SECRET";
const CONNECTOR = "user-A-connector-id";

function gmailRow(over: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acc-1",
    connectedByUserId: CONNECTOR,
    provider: "gmail", // personal
    providerAccountId: "pa-secret-1",
    displayName: "Personal · a@example.com",
    accessTokenEncrypted: SECRET_ACCESS,
    refreshTokenEncrypted: "enc-refresh-SECRET",
    accessTokenExpiresAt: null,
    scopes: ["gmail.send"],
    accountMetadata: {},
    disconnectedAt: null,
    integrationSharingScope: null, // unset = private_to_connector
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}
function slackRow(over: Record<string, unknown> = {}) {
  return gmailRow({ id: "int-s", provider: "slack", ...over });
}

let infoSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true); // feature ON for most tests
  mockGetDeletionStatus.mockResolvedValue("active");
  mockSetScope.mockResolvedValue({ updated: true });
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => infoSpy.mockRestore());

function allLoggedJson(): string {
  return infoSpy.mock.calls.map((c) => String(c[0])).join("\n");
}

describe("setIntegrationSharingScope — flag gate", () => {
  it("flag OFF ⇒ not_enabled, ZERO I/O and no mutation", async () => {
    mockFlag.mockReturnValue(false);
    const res = await setIntegrationSharingScope({
      accountId: "acc-1",
      integrationId: "int-1",
      callerUserId: CONNECTOR,
      scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "not_enabled" });
    expect(mockGetDeletionStatus).not.toHaveBeenCalled();
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockSetScope).not.toHaveBeenCalled();
  });
});

describe("setIntegrationSharingScope — guards (no existence leak)", () => {
  it("frozen account ⇒ account_frozen, no row lookup, no mutation", async () => {
    mockGetDeletionStatus.mockResolvedValue("pending_deletion");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: CONNECTOR, scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it("unknown / cross-account id ⇒ not_found", async () => {
    mockGetById.mockResolvedValue(null);
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-x", callerUserId: CONNECTOR, scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it("non-member caller ⇒ not_found (no existence leak)", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue(null);
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: "stranger", scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it("disconnected row ⇒ not_found, never mutated", async () => {
    mockGetById.mockResolvedValue(gmailRow({ disconnectedAt: "2026-06-01T00:00:00Z" }));
    mockGetRole.mockResolvedValue("member");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: CONNECTOR, scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it("disconnected mid-flight (updated:false) ⇒ not_found", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("member");
    mockSetScope.mockResolvedValue({ updated: false });
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: CONNECTOR, scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("setIntegrationSharingScope — account provider not shareable", () => {
  it.each(["shared_with_account", "private_to_connector"] as const)(
    "account provider (slack) + %s ⇒ account_provider_not_shareable, no mutation",
    async (scope) => {
      mockGetById.mockResolvedValue(slackRow());
      mockGetRole.mockResolvedValue("owner");
      const res = await setIntegrationSharingScope({
        accountId: "acc-1", integrationId: "int-s", callerUserId: CONNECTOR, scope,
      });
      expect(res).toEqual({ ok: false, reason: "account_provider_not_shareable" });
      expect(mockSetScope).not.toHaveBeenCalled();
    },
  );
});

describe("setIntegrationSharingScope — SHARE (connector only)", () => {
  it("the connector CAN share their own active personal connection", async () => {
    mockGetById.mockResolvedValue(gmailRow());
    mockGetRole.mockResolvedValue("member");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: CONNECTOR, scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: true, scope: "shared_with_account", changed: true });
    expect(mockSetScope).toHaveBeenCalledWith({ integrationId: "int-1", scope: "shared_with_account" });
    expect(allLoggedJson()).toContain("account.integration.sharing.shared");
  });

  it("already shared ⇒ changed:false (idempotent), still writes", async () => {
    mockGetById.mockResolvedValue(gmailRow({ integrationSharingScope: "shared_with_account" }));
    mockGetRole.mockResolvedValue("member");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: CONNECTOR, scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: true, scope: "shared_with_account", changed: false });
  });

  it.each(["owner", "admin"])("a NON-connector %s CANNOT silently share a member's connection ⇒ forbidden", async (role) => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1" }));
    mockGetRole.mockResolvedValue(role);
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: "admin-z", scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it("a non-connector plain member CANNOT share another member's connection ⇒ forbidden", async () => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1" }));
    mockGetRole.mockResolvedValue("member");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: "member-2", scope: "shared_with_account",
    });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    expect(mockSetScope).not.toHaveBeenCalled();
  });
});

describe("setIntegrationSharingScope — UNSHARE", () => {
  it("the connector CAN unshare their own connection (clears to NULL)", async () => {
    mockGetById.mockResolvedValue(gmailRow({ integrationSharingScope: "shared_with_account" }));
    mockGetRole.mockResolvedValue("member");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: CONNECTOR, scope: "private_to_connector",
    });
    expect(res).toEqual({ ok: true, scope: "private_to_connector", changed: true });
    expect(mockSetScope).toHaveBeenCalledWith({ integrationId: "int-1", scope: null });
    expect(allLoggedJson()).toContain("account.integration.sharing.unshared");
    expect(allLoggedJson()).not.toContain("admin_unshared");
  });

  it.each(["owner", "admin"])("a non-connector %s CAN unshare as a framed admin-safety action (audit-logged)", async (role) => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1", integrationSharingScope: "shared_with_account" }));
    mockGetRole.mockResolvedValue(role);
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: "admin-z", scope: "private_to_connector",
    });
    expect(res).toEqual({ ok: true, scope: "private_to_connector", changed: true });
    expect(mockSetScope).toHaveBeenCalledWith({ integrationId: "int-1", scope: null });
    const logged = allLoggedJson();
    expect(logged).toContain("account.integration.sharing.admin_unshared");
    expect(logged).toContain(`"actorRole":"${role}"`);
  });

  it("a non-connector plain member CANNOT unshare another member's connection ⇒ forbidden", async () => {
    mockGetById.mockResolvedValue(gmailRow({ connectedByUserId: "member-1", integrationSharingScope: "shared_with_account" }));
    mockGetRole.mockResolvedValue("member");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: "member-2", scope: "private_to_connector",
    });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
    expect(mockSetScope).not.toHaveBeenCalled();
  });
});

describe("setIntegrationSharingScope — NO LEAK", () => {
  it("never returns or logs a token / email / scope / connector id", async () => {
    mockGetById.mockResolvedValue(gmailRow({ integrationSharingScope: "shared_with_account" }));
    mockGetRole.mockResolvedValue("owner");
    const res = await setIntegrationSharingScope({
      accountId: "acc-1", integrationId: "int-1", callerUserId: "admin-z", scope: "private_to_connector",
    });
    const serialized = JSON.stringify(res) + "\n" + allLoggedJson();
    expect(serialized).not.toContain(SECRET_ACCESS);
    expect(serialized).not.toContain("enc-refresh-SECRET");
    expect(serialized).not.toContain("a@example.com");
    expect(serialized).not.toContain("gmail.send");
    expect(serialized).not.toContain("pa-secret-1"); // provider_account_id
    expect(serialized).not.toContain(CONNECTOR); // connector id
  });
});

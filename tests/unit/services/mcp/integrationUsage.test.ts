/**
 * canActorUseIntegrationForMcp tests (Slice 4.PUBLIC-MCP-USAGE-1).
 *
 * The reusable MCP integration-usage gate, with mocked repos + flag. Proves the
 * full ordered chain: opaque cross-account not_found → membership (offboarding) →
 * identity-usage policy. No DB.
 */

const mockGetById = jest.fn();
const mockGetRole = jest.fn();
const mockFlag = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetById(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));
jest.mock("@/services/integrations/connectionSharingFlags", () => ({
  isConnectionSharingEnabled: () => mockFlag(),
}));

import { canActorUseIntegrationForMcp } from "@/services/mcp/integrationUsage";

const ACCOUNT = "acct-A";
const ACTOR = "user-A";

function integration(over: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: ACCOUNT,
    provider: "gmail",
    connectedByUserId: ACTOR,
    integrationSharingScope: null,
    displayName: "a@company.com",
    disconnectedAt: null,
    needsReconnectAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRole.mockResolvedValue("member");
  mockFlag.mockReturnValue(false);
});

describe("services/mcp/integrationUsage — canActorUseIntegrationForMcp", () => {
  it("allows the connector to use their own member-connected identity", async () => {
    mockGetById.mockResolvedValue(integration({ connectedByUserId: ACTOR }));
    const r = await canActorUseIntegrationForMcp({
      actorUserId: ACTOR,
      accountId: ACCOUNT,
      integrationId: "int-1",
      purpose: "run_workflow",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.integration).toEqual({
      id: "int-1",
      provider: "gmail",
      displayName: "a@company.com",
      status: "connected",
    });
  });

  it("denies a co-member's private mailbox with a typed reason", async () => {
    mockGetById.mockResolvedValue(integration({ connectedByUserId: "someone-else" }));
    const r = await canActorUseIntegrationForMcp({
      actorUserId: ACTOR,
      accountId: ACCOUNT,
      integrationId: "int-1",
      purpose: "configure_workflow",
    });
    expect(r).toMatchObject({ ok: false, reason: "integration_not_allowed_for_actor" });
    if (!r.ok) expect(r.detail).toBeTruthy();
  });

  it("allows a shared service integration for a non-connector member", async () => {
    mockGetById.mockResolvedValue(integration({ provider: "slack", connectedByUserId: "someone-else" }));
    const r = await canActorUseIntegrationForMcp({
      actorUserId: ACTOR,
      accountId: ACCOUNT,
      integrationId: "int-1",
      purpose: "configure_workflow",
    });
    expect(r.ok).toBe(true);
  });

  it("returns opaque not_found for an integration in another account (repo filters account)", async () => {
    mockGetById.mockResolvedValue(null); // getByIdForAccountServiceRole filtered it out
    const r = await canActorUseIntegrationForMcp({
      actorUserId: ACTOR,
      accountId: ACCOUNT,
      integrationId: "int-from-B",
      purpose: "read",
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
    // Membership + policy are never consulted once the row is not in the account.
    expect(mockGetRole).not.toHaveBeenCalled();
  });

  it("denies (not_a_member) before the usage policy when the actor was offboarded", async () => {
    mockGetById.mockResolvedValue(integration({ connectedByUserId: ACTOR }));
    mockGetRole.mockResolvedValue(null); // actor removed from the account
    const r = await canActorUseIntegrationForMcp({
      actorUserId: ACTOR,
      accountId: ACCOUNT,
      integrationId: "int-1",
      purpose: "run_workflow",
    });
    // Even though the actor is the connector, membership is checked FIRST.
    expect(r).toEqual({ ok: false, reason: "not_a_member" });
  });

  it("honors flag-gated explicit sharing for a non-connector personal identity", async () => {
    mockGetById.mockResolvedValue(
      integration({ connectedByUserId: "someone-else", integrationSharingScope: "shared_with_account" }),
    );

    // Flag OFF → still denied.
    mockFlag.mockReturnValue(false);
    expect((await canActorUseIntegrationForMcp({
      actorUserId: ACTOR, accountId: ACCOUNT, integrationId: "int-1", purpose: "configure_workflow",
    })).ok).toBe(false);

    // Flag ON → allowed.
    mockFlag.mockReturnValue(true);
    expect((await canActorUseIntegrationForMcp({
      actorUserId: ACTOR, accountId: ACCOUNT, integrationId: "int-1", purpose: "configure_workflow",
    })).ok).toBe(true);
  });
});

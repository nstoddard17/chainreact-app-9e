/**
 * @jest-environment node
 *
 * Tests for app/apps/_shared.ts (Slice 4.APPS-PAGE-1).
 *
 * Pins the route-DTO safety contract:
 *   - Only the documented fields leave the server.
 *   - Token columns NEVER appear in the projected items.
 *   - providerAccountId, accountMetadata, scopes, expiry columns NEVER
 *     appear — even when present on the IntegrationRecord.
 *   - Disabled / experimental providers are filtered.
 *   - Categories derive from the local truthful map; unmapped → "Other".
 *
 * The mapper is pure (no I/O) — tests can call it directly with crafted
 * inputs.
 */

import {
  buildCategoryList,
  toAppCatalogItem,
  resolveAppCatalog,
} from "@/app/apps/_shared";
import type { IntegrationRecord } from "@/repositories/integrations";

// Mock the registry so the test isn't coupled to V2's real provider count.
jest.mock("@/integrations/_registry", () => ({
  listProviders: jest.fn(),
  getProvider: jest.fn(),
  providerIconUrl: (id: string) => `/integrations/${id}.svg`,
}));

import { listProviders } from "@/integrations/_registry";
const mockList = listProviders as unknown as jest.Mock;

function mkProvider(over: Partial<{
  id: string;
  displayName: string;
  isEnabled: boolean;
  isExperimental: boolean;
  capabilities: { oauth: boolean };
}> = {}) {
  return {
    id: "slack",
    displayName: "Slack",
    isEnabled: true,
    isExperimental: false,
    capabilities: { oauth: true },
    ...over,
  };
}

function mkRecord(over: Partial<IntegrationRecord> = {}): IntegrationRecord {
  return {
    id: "int-1",
    accountId: "acct-user-1",
    connectedByUserId: "user-1",
    provider: "slack",
    providerAccountId: "T-WORKSPACE-12345",
    displayName: "Acme · marcus@example.com",
    accessTokenEncrypted: "ENC.SHOULD.NEVER.LEAK",
    refreshTokenEncrypted: "ENC.SHOULD.NEVER.LEAK",
    accessTokenExpiresAt: "2026-12-01T00:00:00Z",
    scopes: ["chat:write", "channels:read"],
    accountMetadata: { teamId: "T-WORKSPACE-12345", planId: "pro" },
    disconnectedAt: null,
    createdAt: "2026-04-15T12:00:00Z",
    updatedAt: "2026-05-30T12:00:00Z",
    ...over,
  };
}

describe("toAppCatalogItem — route-DTO safety contract", () => {
  it("emits exactly the documented top-level fields, nothing else", () => {
    const item = toAppCatalogItem(mkProvider(), [mkRecord()]);
    expect(Object.keys(item).sort()).toEqual([
      "accounts",
      "canConnect",
      "category",
      "description",
      "firstConnectedAt",
      "iconUrl",
      "isConnected",
      "name",
      "providerId",
      "supportsMultipleAccounts",
    ]);
  });

  it("each account exposes only id + displayName + connectedAt + canDisconnect + canReconnect — no tokens, no providerAccountId, no metadata, no scopes, no expiry, no connectedByUserId", () => {
    const item = toAppCatalogItem(mkProvider(), [mkRecord()]);
    expect(item.accounts).toHaveLength(1);
    for (const acc of item.accounts) {
      // 4.APPS-RECONNECT adds `canReconnect`; CS-5a adds sharingStatus +
      // sharedWithAccount + canShare + canUnshare — all boolean/enum, still NO identity.
      expect(Object.keys(acc).sort()).toEqual([
        "canDisconnect",
        "canReconnect",
        "canShare",
        "canUnshare",
        "connectedAt",
        "displayName",
        "id",
        "sharedWithAccount",
        "sharingStatus",
      ]);
    }
    // The provenance input to canDisconnect / canReconnect must never be emitted.
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("connectedByUserId");
    expect(serialized).not.toContain("user-1"); // the mkRecord connectedByUserId value
  });

  it("encrypted token columns do NOT appear anywhere in the projected item, deeply", () => {
    const item = toAppCatalogItem(mkProvider(), [mkRecord()]);
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("ENC.SHOULD.NEVER.LEAK");
    expect(serialized).not.toContain("accessTokenEncrypted");
    expect(serialized).not.toContain("refreshTokenEncrypted");
    expect(serialized).not.toContain("accessTokenExpiresAt");
  });

  it("accountMetadata + providerAccountId + scopes do NOT appear in the projected item", () => {
    const item = toAppCatalogItem(mkProvider(), [
      mkRecord({
        providerAccountId: "WORKSPACE-SECRET-ID-9999",
        accountMetadata: { teamId: "should-not-leak", admin_token: "xoxa-secret" },
        scopes: ["should-not-leak"],
      }),
    ]);
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain("WORKSPACE-SECRET-ID-9999");
    expect(serialized).not.toContain("admin_token");
    expect(serialized).not.toContain("xoxa-secret");
    expect(serialized).not.toContain("providerAccountId");
    expect(serialized).not.toContain("accountMetadata");
    expect(serialized).not.toContain("scopes");
  });
});

describe("toAppCatalogItem — flags + derived fields", () => {
  it("isConnected is true with at least one account, false with none", () => {
    expect(toAppCatalogItem(mkProvider(), [mkRecord()]).isConnected).toBe(true);
    expect(toAppCatalogItem(mkProvider(), []).isConnected).toBe(false);
  });

  it("canConnect = manifest.isEnabled && capabilities.oauth", () => {
    expect(
      toAppCatalogItem(mkProvider({ isEnabled: false }), []).canConnect,
    ).toBe(false);
    expect(
      toAppCatalogItem(
        mkProvider({ capabilities: { oauth: false } }),
        [],
      ).canConnect,
    ).toBe(false);
    expect(toAppCatalogItem(mkProvider(), []).canConnect).toBe(true);
  });

  it("accounts sort oldest-first (primary connection first), firstConnectedAt mirrors that", () => {
    const item = toAppCatalogItem(mkProvider(), [
      mkRecord({ id: "newer", createdAt: "2026-05-01T00:00:00Z" }),
      mkRecord({ id: "older", createdAt: "2026-01-01T00:00:00Z" }),
      mkRecord({ id: "middle", createdAt: "2026-03-01T00:00:00Z" }),
    ]);
    expect(item.accounts.map((a) => a.id)).toEqual(["older", "middle", "newer"]);
    expect(item.firstConnectedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("firstConnectedAt is null when there are no accounts", () => {
    expect(toAppCatalogItem(mkProvider(), []).firstConnectedAt).toBe(null);
  });

  it("category falls back to 'Other' for an unmapped provider id", () => {
    const item = toAppCatalogItem(mkProvider({ id: "newly-added-provider" }), []);
    expect(item.category).toBe("Other");
  });

  it("iconUrl uses /integrations/<id>.svg via the registry helper", () => {
    const item = toAppCatalogItem(mkProvider({ id: "slack" }), []);
    expect(item.iconUrl).toBe("/integrations/slack.svg");
  });
});

describe("toAppCatalogItem — canDisconnect derivation (CD-3)", () => {
  const enabled = (over: Partial<{ callerUserId: string; callerRole: "owner" | "admin" | "member" | null }>) => ({
    callerUserId: "user-1",
    callerRole: "owner" as const,
    ...over,
  });

  it("is false when no context is provided", () => {
    const item = toAppCatalogItem(mkProvider({ id: "slack" }), [mkRecord({ provider: "slack" })]);
    expect(item.accounts[0]?.canDisconnect).toBe(false);
  });

  it("SHARED provider (slack): owner/admin can, plain member cannot", () => {
    const rec = [mkRecord({ provider: "slack", connectedByUserId: "user-1" })];
    expect(
      toAppCatalogItem(mkProvider({ id: "slack" }), rec, enabled({ callerRole: "owner" })).accounts[0]?.canDisconnect,
    ).toBe(true);
    expect(
      toAppCatalogItem(mkProvider({ id: "slack" }), rec, enabled({ callerRole: "admin" })).accounts[0]?.canDisconnect,
    ).toBe(true);
    // A member CANNOT disconnect a shared provider even if they connected it.
    expect(
      toAppCatalogItem(mkProvider({ id: "slack" }), rec, enabled({ callerRole: "member", callerUserId: "user-1" })).accounts[0]?.canDisconnect,
    ).toBe(false);
  });

  it("PERSONAL provider (gmail): the connector OR owner/admin can; a non-connector member cannot", () => {
    const connectedByMember = [mkRecord({ provider: "gmail", connectedByUserId: "member-7" })];
    // The connector (member-7) can disconnect their own.
    expect(
      toAppCatalogItem(mkProvider({ id: "gmail" }), connectedByMember, enabled({ callerRole: "member", callerUserId: "member-7" })).accounts[0]?.canDisconnect,
    ).toBe(true);
    // A different member cannot.
    expect(
      toAppCatalogItem(mkProvider({ id: "gmail" }), connectedByMember, enabled({ callerRole: "member", callerUserId: "member-OTHER" })).accounts[0]?.canDisconnect,
    ).toBe(false);
    // Owner can disconnect a member's personal credential.
    expect(
      toAppCatalogItem(mkProvider({ id: "gmail" }), connectedByMember, enabled({ callerRole: "owner", callerUserId: "owner-1" })).accounts[0]?.canDisconnect,
    ).toBe(true);
  });

  it("4.APPS-RECONNECT — canReconnect mirrors canDisconnect (same per-account credential rule)", () => {
    const cases = [
      { provider: "slack", role: "owner" as const, caller: "user-1", connectedBy: "user-1" },
      { provider: "slack", role: "member" as const, caller: "user-1", connectedBy: "user-1" },
      { provider: "gmail", role: "member" as const, caller: "member-7", connectedBy: "member-7" },
      { provider: "gmail", role: "member" as const, caller: "member-OTHER", connectedBy: "member-7" },
      { provider: "gmail", role: "owner" as const, caller: "owner-1", connectedBy: "member-7" },
    ];
    for (const c of cases) {
      const acc = toAppCatalogItem(
        mkProvider({ id: c.provider }),
        [mkRecord({ provider: c.provider, connectedByUserId: c.connectedBy })],
        enabled({ callerRole: c.role, callerUserId: c.caller }),
      ).accounts[0]!;
      expect(acc.canReconnect).toBe(acc.canDisconnect);
    }
    // And with no context, both are false (control never renders).
    const noCtx = toAppCatalogItem(mkProvider({ id: "slack" }), [mkRecord({ provider: "slack" })]).accounts[0]!;
    expect(noCtx.canReconnect).toBe(false);
  });
});

describe("CS-5a — sharing DTO fields", () => {
  const FLAG = "ENABLE_CONNECTION_SHARING";
  const enabled = (over: Partial<{ callerUserId: string; callerRole: "owner" | "admin" | "member" | null }> = {}) => ({
    callerUserId: "user-1",
    callerRole: "member" as const,
    ...over,
  });
  function acct(over: { provider: string; connectedBy?: string; scope?: string | null; displayName?: string | null }, ctx: ReturnType<typeof enabled>) {
    return toAppCatalogItem(
      mkProvider({ id: over.provider }),
      [mkRecord({
        provider: over.provider,
        connectedByUserId: over.connectedBy ?? "user-1",
        integrationSharingScope: over.scope ?? null,
        ...(over.displayName !== undefined ? { displayName: over.displayName } : {}),
      })],
      ctx,
    ).accounts[0]!;
  }

  afterEach(() => delete process.env[FLAG]);

  it("flag OFF → not_applicable, all sharing booleans false (no behavior change)", () => {
    const a = acct({ provider: "gmail" }, enabled());
    expect(a.sharingStatus).toBe("not_applicable");
    expect(a.sharedWithAccount).toBe(false);
    expect(a.canShare).toBe(false);
    expect(a.canUnshare).toBe(false);
  });

  describe("flag ON", () => {
    beforeEach(() => { process.env[FLAG] = "true"; });

    it("account provider (slack) → not_applicable, no toggle", () => {
      const a = acct({ provider: "slack" }, enabled({ callerRole: "owner" }));
      expect(a.sharingStatus).toBe("not_applicable");
      expect(a.canShare).toBe(false);
      expect(a.canUnshare).toBe(false);
    });

    it("personal PRIVATE row → connector can share; non-connector cannot", () => {
      const asConnector = acct({ provider: "gmail", connectedBy: "user-1" }, enabled({ callerUserId: "user-1" }));
      expect(asConnector.sharingStatus).toBe("private_to_connector");
      expect(asConnector.sharedWithAccount).toBe(false);
      expect(asConnector.canShare).toBe(true);
      expect(asConnector.canUnshare).toBe(false);

      // Owner/admin who is NOT the connector cannot share another member's identity.
      const asOwner = acct({ provider: "gmail", connectedBy: "member-7" }, enabled({ callerRole: "owner", callerUserId: "owner-1" }));
      expect(asOwner.canShare).toBe(false);

      const asOtherMember = acct({ provider: "gmail", connectedBy: "member-7" }, enabled({ callerRole: "member", callerUserId: "member-OTHER" }));
      expect(asOtherMember.canShare).toBe(false);
    });

    it("personal SHARED row → shared status; connector AND owner/admin can unshare", () => {
      const asConnector = acct({ provider: "gmail", connectedBy: "user-1", scope: "shared_with_account" }, enabled({ callerUserId: "user-1" }));
      expect(asConnector.sharingStatus).toBe("shared_with_account");
      expect(asConnector.sharedWithAccount).toBe(true);
      expect(asConnector.canUnshare).toBe(true);
      expect(asConnector.canShare).toBe(false);

      const asOwner = acct({ provider: "gmail", connectedBy: "member-7", scope: "shared_with_account" }, enabled({ callerRole: "owner", callerUserId: "owner-1" }));
      expect(asOwner.canUnshare).toBe(true); // admin-safety removal

      const asOtherMember = acct({ provider: "gmail", connectedBy: "member-7", scope: "shared_with_account" }, enabled({ callerRole: "member", callerUserId: "member-OTHER" }));
      expect(asOtherMember.canUnshare).toBe(false);
    });

    it("NO LEAK: sharing fields never carry connector id / raw scope / provider_account_id / metadata", () => {
      // displayName (the row's own OAuth label) is a pre-existing exposed field —
      // set it neutral here so the assertion isolates what the SHARING fields add.
      const a = acct(
        { provider: "gmail", connectedBy: "member-7", scope: "shared_with_account", displayName: "Gmail" },
        enabled({ callerRole: "owner", callerUserId: "owner-1" }),
      );
      const serialized = JSON.stringify(a);
      expect(serialized).not.toContain("member-7"); // connector id
      expect(serialized).not.toContain("T-WORKSPACE-12345"); // provider_account_id / metadata
      expect(serialized).not.toContain("chat:write"); // scope
      // Only the safe enum/booleans are present.
      expect(a.sharingStatus).toBe("shared_with_account");
    });
  });
});

describe("resolveAppCatalog — visibility filter", () => {
  it("drops disabled and experimental providers", () => {
    mockList.mockReturnValue([
      mkProvider({ id: "slack" }),
      mkProvider({ id: "discord", isEnabled: false }),
      mkProvider({ id: "future-provider", isExperimental: true }),
      mkProvider({ id: "stripe" }),
    ]);
    const items = resolveAppCatalog([]);
    expect(items.map((i) => i.providerId)).toEqual(["slack", "stripe"]);
  });

  it("groups integration records by provider and keeps providers with no rows in the catalog", () => {
    mockList.mockReturnValue([
      mkProvider({ id: "slack" }),
      mkProvider({ id: "stripe" }),
    ]);
    const items = resolveAppCatalog([
      mkRecord({ provider: "slack", id: "int-a" }),
      mkRecord({ provider: "slack", id: "int-b", createdAt: "2026-05-01T00:00:00Z" }),
    ]);
    const slack = items.find((i) => i.providerId === "slack");
    const stripe = items.find((i) => i.providerId === "stripe");
    expect(slack?.accounts).toHaveLength(2);
    expect(slack?.isConnected).toBe(true);
    expect(stripe?.accounts).toHaveLength(0);
    expect(stripe?.isConnected).toBe(false);
  });
});

describe("buildCategoryList", () => {
  it("emits 'All apps' + only categories that have at least one provider", () => {
    mockList.mockReturnValue([
      mkProvider({ id: "slack" }), // Communication
      mkProvider({ id: "stripe" }), // Payments
    ]);
    const items = resolveAppCatalog([]);
    const cats = buildCategoryList(items);
    expect(cats.map((c) => c.id)).toEqual(["All", "Communication", "Payments"]);
    expect(cats[0]?.count).toBe(2);
    expect(cats[1]?.count).toBe(1);
    expect(cats[2]?.count).toBe(1);
  });

  it("'All apps' count equals the visible catalog size", () => {
    mockList.mockReturnValue([
      mkProvider({ id: "slack" }),
      mkProvider({ id: "stripe" }),
      mkProvider({ id: "newly-added" }),
    ]);
    const items = resolveAppCatalog([]);
    const cats = buildCategoryList(items);
    expect(cats[0]).toEqual({ id: "All", label: "All apps", count: 3 });
  });
});

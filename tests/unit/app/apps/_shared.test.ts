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
    userId: "user-1",
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

  it("each account exposes only id + displayName + connectedAt — no tokens, no providerAccountId, no metadata, no scopes, no expiry", () => {
    const item = toAppCatalogItem(mkProvider(), [mkRecord()]);
    expect(item.accounts).toHaveLength(1);
    for (const acc of item.accounts) {
      expect(Object.keys(acc).sort()).toEqual([
        "connectedAt",
        "displayName",
        "id",
      ]);
    }
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

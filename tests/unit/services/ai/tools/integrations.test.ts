/**
 * @jest-environment node
 *
 * Tests for services/ai/tools/integrations.ts (Slice 4.AI-2).
 *
 * The connected-integrations view must expose availability only — NEVER token
 * material. The no-leak assertions are the load-bearing tests here.
 */
const mockListActiveByUser = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  listActiveByUser: (...args: unknown[]) => mockListActiveByUser(...args),
}));
jest.mock("@/integrations/_registry", () => ({
  getProvider: (id: string) => (id === "slack" ? { tokenScope: "workspace" } : { tokenScope: "user" }),
}));

import { getConnectedIntegrationsForAI } from "@/services/ai/tools/integrations";
import { isSecretKey } from "@/services/ai/tools/redact";
import type { IntegrationRecord } from "@/repositories/integrations";

function makeRecord(overrides: Partial<IntegrationRecord> = {}): IntegrationRecord {
  return {
    id: "int-1",
    userId: "u1",
    provider: "slack",
    providerAccountId: "T123",
    displayName: "My Slack Team",
    accessTokenEncrypted: "ENC_ACCESS_SECRET",
    refreshTokenEncrypted: "ENC_REFRESH_SECRET",
    accessTokenExpiresAt: null,
    scopes: ["channels:read", "chat:write"],
    accountMetadata: { email: "owner@example.com", botToken: "BOT_SECRET" },
    disconnectedAt: null,
    createdAt: "2026-05-25T00:00:00Z",
    updatedAt: "2026-05-25T00:00:00Z",
    ...overrides,
  };
}

function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v) => collectKeys(v, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectKeys(v, out);
    }
  }
  return out;
}

beforeEach(() => mockListActiveByUser.mockReset());

describe("getConnectedIntegrationsForAI", () => {
  it("returns an availability view with allow-listed fields only", async () => {
    mockListActiveByUser.mockResolvedValue([makeRecord()]);
    const result = await getConnectedIntegrationsForAI("u1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.integrations).toEqual([
      {
        provider: "slack",
        connected: true,
        accountLabel: "My Slack Team",
        accountScope: "workspace",
        scopeCount: 2,
      },
    ]);
  });

  it("NEVER leaks token material or account metadata (keys + raw values)", async () => {
    mockListActiveByUser.mockResolvedValue([makeRecord()]);
    const result = await getConnectedIntegrationsForAI("u1");
    if (!result.ok) throw new Error("expected ok");

    // No secret-shaped object key anywhere in the view.
    for (const key of collectKeys(result.data)) {
      expect(isSecretKey(key)).toBe(false);
    }
    // No raw secret VALUE leaks through (encrypted tokens, bot token, PII email).
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain("ENC_ACCESS_SECRET");
    expect(serialized).not.toContain("ENC_REFRESH_SECRET");
    expect(serialized).not.toContain("BOT_SECRET");
    expect(serialized).not.toContain("owner@example.com");
  });

  it("handles a user with no integrations", async () => {
    mockListActiveByUser.mockResolvedValue([]);
    const result = await getConnectedIntegrationsForAI("u1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.integrations).toEqual([]);
  });

  it("returns multiple entries for multiple accounts", async () => {
    mockListActiveByUser.mockResolvedValue([
      makeRecord({ id: "a", provider: "slack" }),
      makeRecord({ id: "b", provider: "gmail", displayName: null, scopes: [] }),
    ]);
    const result = await getConnectedIntegrationsForAI("u1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.integrations).toHaveLength(2);
    expect(result.data.integrations[1]).toEqual({
      provider: "gmail",
      connected: true,
      accountLabel: null,
      accountScope: "user",
      scopeCount: 0,
    });
  });

  it("returns SERVER_ERROR when the repository throws", async () => {
    mockListActiveByUser.mockRejectedValue(new Error("db down"));
    const result = await getConnectedIntegrationsForAI("u1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SERVER_ERROR");
    expect(result.message).not.toContain("db down");
  });
});

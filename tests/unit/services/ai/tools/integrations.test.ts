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
    accountId: "acct-u1",
    connectedByUserId: "u1",
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

  describe("currentUserId resolution (AI-17)", () => {
    it("exposes Slack's authedUserId as currentUserId on the view (and only that field — never the team id, never the bot id, never tokens)", async () => {
      mockListActiveByUser.mockResolvedValue([
        makeRecord({
          provider: "slack",
          accountMetadata: {
            teamId: "T123",
            teamName: "Acme Workspace",
            botUserId: "B999BOT",
            appId: "A000APP",
            authedUserId: "U01ABC23DEF",
          },
        }),
      ]);
      const result = await getConnectedIntegrationsForAI("u1");
      if (!result.ok) throw new Error("expected ok");
      expect(result.data.integrations).toHaveLength(1);
      const slack = result.data.integrations[0]!;
      expect(slack.currentUserId).toBe("U01ABC23DEF");
      // The other metadata fields must NOT leak — only the authed-user id is
      // mapped, and it's mapped to a generic field name, NOT carried as a
      // free-form metadata blob.
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toContain("T123");
      expect(serialized).not.toContain("B999BOT");
      expect(serialized).not.toContain("A000APP");
      expect(serialized).not.toContain("authedUserId"); // the source key isn't echoed
    });

    it("omits currentUserId when Slack's authed_user.id wasn't captured (pre-AI-17 rows / re-auth-from-app context)", async () => {
      mockListActiveByUser.mockResolvedValue([
        makeRecord({
          provider: "slack",
          accountMetadata: {
            teamId: "T123",
            teamName: "Acme",
            botUserId: "B999BOT",
            // authedUserId intentionally absent
          },
        }),
      ]);
      const result = await getConnectedIntegrationsForAI("u1");
      if (!result.ok) throw new Error("expected ok");
      expect(result.data.integrations[0]).not.toHaveProperty("currentUserId");
    });

    it("omits currentUserId when Slack's authedUserId is an empty string (defensive — never propagates invalid ids)", async () => {
      mockListActiveByUser.mockResolvedValue([
        makeRecord({
          provider: "slack",
          accountMetadata: { authedUserId: "" },
        }),
      ]);
      const result = await getConnectedIntegrationsForAI("u1");
      if (!result.ok) throw new Error("expected ok");
      expect(result.data.integrations[0]).not.toHaveProperty("currentUserId");
    });

    it("does NOT expose currentUserId for non-Slack providers today (Gmail / GitHub / Notion / etc. — until each gets a per-provider mapping)", async () => {
      mockListActiveByUser.mockResolvedValue([
        makeRecord({
          provider: "gmail",
          accountMetadata: {
            email: "owner@example.com",
            authedUserId: "should-not-surface-from-non-slack-provider",
          },
        }),
      ]);
      const result = await getConnectedIntegrationsForAI("u1");
      if (!result.ok) throw new Error("expected ok");
      expect(result.data.integrations[0]).not.toHaveProperty("currentUserId");
    });

    it("the currentUserId never has a secret-shaped key in its surrounding structure", async () => {
      mockListActiveByUser.mockResolvedValue([
        makeRecord({
          provider: "slack",
          accountMetadata: { authedUserId: "U01ABC23DEF", botToken: "BOT_SECRET" },
        }),
      ]);
      const result = await getConnectedIntegrationsForAI("u1");
      if (!result.ok) throw new Error("expected ok");
      for (const key of collectKeys(result.data)) {
        expect(isSecretKey(key)).toBe(false);
      }
      const serialized = JSON.stringify(result.data);
      expect(serialized).not.toContain("BOT_SECRET");
    });
  });
});

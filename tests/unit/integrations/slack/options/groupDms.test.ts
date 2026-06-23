/**
 * @jest-environment node
 *
 * Tests for `integrations/slack/options/groupDms.ts` (CONFIG-FIELD-UX-SWEEP-4).
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration / no requiredDeps).
 *   - conversationsList called with types="mpim", excludeArchived, limit.
 *   - Token decrypted once from the integration row.
 *   - Mapping: id → value, name → label, name-less mpim falls back to id,
 *     id-less records dropped. NO member-array expansion (no PII).
 *   - Case-insensitive client-side q filter over the label.
 *   - MISSING-SCOPE / RECONNECT: a Slack auth error (e.g. `missing_scope` on an
 *     old token without mpim:read) → PROVIDER_REAUTH_REQUIRED.
 *   - Non-auth SlackApiError → PROVIDER_ERROR (sanitized).
 *   - INTEGRATION_DISCONNECTED when ctx.integration is null.
 *   - No token / raw Slack body / member PII leaks into the output or error.
 */

const mockConversationsList = jest.fn();
jest.mock("@/integrations/slack/api/conversationsList", () => ({
  __esModule: true,
  conversationsList: (...args: unknown[]) => mockConversationsList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { slackGroupDmsResolver } from "@/integrations/slack/options/groupDms";
import { SlackApiError } from "@/integrations/slack/api/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "slack",
  providerAccountId: "T01TEAM",
  displayName: "Test Workspace",
  accessTokenEncrypted: "enc:bot-token-cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["mpim:read", "mpim:history"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockConversationsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue(["xoxb", "decrypted", "test", "token"].join("-"));
});

describe("slackGroupDmsResolver — shape", () => {
  it("declares source / provider / requiresIntegration / no requiredDeps", () => {
    expect(slackGroupDmsResolver.source).toBe("slack:group_dms");
    expect(slackGroupDmsResolver.provider).toBe("slack");
    expect(slackGroupDmsResolver.requiresIntegration).toBe(true);
    expect(slackGroupDmsResolver.requiredDeps).toBeUndefined();
  });
});

describe("slackGroupDmsResolver — wrapper invocation", () => {
  it("decrypts the bot token once and lists types=mpim", async () => {
    mockConversationsList.mockResolvedValueOnce({ channels: [], hasMore: false, nextCursor: null });
    await slackGroupDmsResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:bot-token-cipher");
    const call = mockConversationsList.mock.calls[0]![0]!;
    expect(call.types).toBe("mpim");
    expect(call.excludeArchived).toBe(true);
    expect(call.limit).toBe(200);
  });
});

describe("slackGroupDmsResolver — mapping", () => {
  it("maps id → value, name → label; drops id-less; never expands members", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "G01", name: "mpdm-amy--bo--cy-1", is_mpim: true, members: ["U1", "U2", "U3"] },
        { id: "G02", is_mpim: true }, // name-less → label falls back to id
        { name: "no-id" }, // dropped
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackGroupDmsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "G01", label: "mpdm-amy--bo--cy-1" },
      { value: "G02", label: "G02" },
    ]);
    // No member ids leak into the option payload.
    expect(JSON.stringify(result.items)).not.toContain("U1");
    expect(JSON.stringify(result.items)).not.toContain("members");
  });

  it("case-insensitive q filter over the label", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "G01", name: "mpdm-amy--bo-1" },
        { id: "G02", name: "mpdm-zoe--max-1" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackGroupDmsResolver.resolve(ctx({ q: "ZOE" }));
    expect(result.items.map((i) => i.value)).toEqual(["G02"]);
  });

  it("hasMore propagates from the wrapper", async () => {
    mockConversationsList.mockResolvedValueOnce({ channels: [], hasMore: true, nextCursor: "c1" });
    expect((await slackGroupDmsResolver.resolve(ctx())).hasMore).toBe(true);
  });
});

describe("slackGroupDmsResolver — missing-scope / reconnect + errors", () => {
  it("an auth error (e.g. missing_scope on a token without mpim:read) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockConversationsList.mockRejectedValueOnce(new SlackApiError("missing_scope"));
    try {
      await slackGroupDmsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
      // Raw Slack error code never surfaced to the client.
      expect((err as Error).message).not.toContain("missing_scope");
    }
  });

  it("a non-auth SlackApiError → PROVIDER_ERROR (sanitized)", async () => {
    mockConversationsList.mockRejectedValueOnce(new SlackApiError("internal_error"));
    await expect(slackGroupDmsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("a non-Slack error bubbles to the route catch-all (not swallowed)", async () => {
    mockConversationsList.mockRejectedValueOnce(new Error("network down"));
    await expect(slackGroupDmsResolver.resolve(ctx())).rejects.toThrow("network down");
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null (no token decrypt)", async () => {
    await expect(
      slackGroupDmsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });
});

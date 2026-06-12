/**
 * @jest-environment node
 *
 * Tests for `integrations/slack/options/channels.ts` — Slice 3.32.
 *
 * Pin:
 *   - Wrapper invocation shape (types / excludeArchived / limit).
 *   - Token decryption is invoked once with the integration's
 *     encrypted access token.
 *   - Channel mapping: id → value, name → `#label`, name-less channel
 *     falls back to id, purpose.value → description (when non-empty,
 *     after trim), id-less records dropped.
 *   - Case-insensitive client-side `q` filtering over the label.
 *   - hasMore propagates from the wrapper.
 *   - SlackApiError → OptionsResolverError("PROVIDER_ERROR", sanitized).
 *   - Non-Slack throw bubbles to the route's catch-all.
 *   - Defensive INTEGRATION_DISCONNECTED throw when `ctx.integration`
 *     is null (route guards but the throw is the contract).
 *   - No token / raw Slack body leaks into the error message.
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

import { slackChannelsResolver } from "@/integrations/slack/options/channels";
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
  scopes: ["channels:read", "groups:read", "files:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockConversationsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("xoxb-decrypted-test-token");
});

describe("slackChannelsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(slackChannelsResolver.source).toBe("slack:channels");
    expect(slackChannelsResolver.provider).toBe("slack");
    expect(slackChannelsResolver.requiresIntegration).toBe(true);
    expect(slackChannelsResolver.requiredDeps).toBeUndefined();
  });
});

describe("slackChannelsResolver — wrapper invocation", () => {
  it("decrypts the bot token from the integration row exactly once", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });
    await slackChannelsResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:bot-token-cipher");
  });

  it("calls conversationsList with types=public+private, excludeArchived=true, limit=200", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });
    await slackChannelsResolver.resolve(ctx());
    expect(mockConversationsList).toHaveBeenCalledTimes(1);
    expect(mockConversationsList).toHaveBeenCalledWith({
      botToken: "xoxb-decrypted-test-token",
      types: "public_channel,private_channel",
      excludeArchived: true,
      limit: 200,
    });
  });
});

describe("slackChannelsResolver — mapping", () => {
  it("maps channels to {value:id, label:#name, description:purpose.value}", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        {
          id: "C01",
          name: "general",
          purpose: { value: "Company-wide announcements" },
        },
        {
          id: "C02",
          name: "random",
          purpose: { value: "Non-work banter." },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "C01",
        label: "#general",
        description: "Company-wide announcements",
      },
      {
        value: "C02",
        label: "#random",
        description: "Non-work banter.",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to raw id as label when channel name is missing", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "D01HIDDEN", name: "" }],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "D01HIDDEN", label: "D01HIDDEN" }]);
  });

  it("omits description when purpose.value is missing / non-string / empty after trim", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "alpha", purpose: undefined },
        { id: "C2", name: "beta", purpose: { value: undefined } },
        { id: "C3", name: "gamma", purpose: { value: 42 } },
        { id: "C4", name: "delta", purpose: { value: "   " } },
        { id: "C5", name: "epsilon", purpose: { value: "  Trimmed.  " } },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "C1", label: "#alpha" },
      { value: "C2", label: "#beta" },
      { value: "C3", label: "#gamma" },
      { value: "C4", label: "#delta" },
      { value: "C5", label: "#epsilon", description: "Trimmed." },
    ]);
  });

  it("drops channels missing a usable id", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "kept" },
        { id: "", name: "dropped-empty-id" },
        { name: "dropped-no-id" },
        { id: 42, name: "dropped-non-string-id" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "C1", label: "#kept" }]);
  });

  it("propagates hasMore=true from the wrapper", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "C1", name: "a" }],
      hasMore: true,
      nextCursor: "cursor-2",
    });
    const result = await slackChannelsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("slackChannelsResolver — q filtering", () => {
  it("filters case-insensitively on the rendered label", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "general" },
        { id: "C2", name: "engineering" },
        { id: "C3", name: "random" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx({ q: "Eng" }));
    expect(result.items.map((i) => i.value)).toEqual(["C2"]);
  });

  it("returns the unfiltered list when q is empty", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "general" },
        { id: "C2", name: "random" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx({ q: "" }));
    expect(result.items).toHaveLength(2);
  });

  it("returns an empty list when q matches nothing", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "C1", name: "general" }],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsResolver.resolve(ctx({ q: "zzz" }));
    expect(result.items).toEqual([]);
  });
});

describe("slackChannelsResolver — error sanitization", () => {
  it.each([
    "invalid_auth",
    "token_revoked",
    "token_expired",
    "account_inactive",
    "missing_scope",
    "not_authed",
  ])(
    "maps auth/scope-class SlackApiError '%s' to OptionsResolverError(PROVIDER_REAUTH_REQUIRED) — sanitized, reconnect-oriented",
    async (slackCode) => {
      mockConversationsList.mockRejectedValueOnce(new SlackApiError(slackCode));
      let thrown: unknown;
      try {
        await slackChannelsResolver.resolve(ctx());
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(OptionsResolverError);
      const optErr = thrown as OptionsResolverError;
      expect(optErr.code).toBe("PROVIDER_REAUTH_REQUIRED");
      // No-leak: the raw Slack error code + token never reach the message.
      expect(optErr.message).not.toMatch(new RegExp(slackCode, "i"));
      expect(optErr.message).not.toMatch(/xoxb/i);
      // Reconnect-oriented copy, not the generic retry string.
      expect(optErr.message).toMatch(/reconnect/i);
      expect(optErr.message).not.toMatch(/try again/i);
    },
  );

  it("maps a NON-auth SlackApiError (ratelimited) to OptionsResolverError(PROVIDER_ERROR) with the generic retry message", async () => {
    mockConversationsList.mockRejectedValueOnce(new SlackApiError("ratelimited"));
    let thrown: unknown;
    try {
      await slackChannelsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("PROVIDER_ERROR");
    // No-leak: raw code + token never surface; copy stays the generic retry.
    expect(optErr.message).not.toMatch(/ratelimited/i);
    expect(optErr.message).not.toMatch(/xoxb/i);
    expect(optErr.message).toMatch(/couldn't load slack channels/i);
  });

  it("propagates non-SlackApiError throws so the route maps them to SERVER_ERROR", async () => {
    const networkErr = new TypeError("fetch failed");
    mockConversationsList.mockRejectedValueOnce(networkErr);
    await expect(slackChannelsResolver.resolve(ctx())).rejects.toBe(networkErr);
  });

  it("throws OptionsResolverError(INTEGRATION_DISCONNECTED) when ctx.integration is null (defensive)", async () => {
    let thrown: unknown;
    try {
      await slackChannelsResolver.resolve(ctx({ integration: null }));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("INTEGRATION_DISCONNECTED");
    // No wrapper invocation when the integration is missing.
    expect(mockConversationsList).not.toHaveBeenCalled();
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });
});

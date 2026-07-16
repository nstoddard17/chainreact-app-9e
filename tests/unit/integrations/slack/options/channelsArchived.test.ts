/**
 * @jest-environment node
 *
 * Tests for `integrations/slack/options/channelsArchived.ts` — RESOLVERS-1.
 *
 * Pin:
 *   - Wrapper invocation shape (types / excludeArchived: FALSE / limit).
 *   - ONLY `is_archived: true` conversations survive (active channels and
 *     records without the flag are dropped).
 *   - Channel mapping mirrors `slack:channels` (id → value, name → `#label`,
 *     id fallback, purpose.value → description, id-less dropped).
 *   - Case-insensitive client-side `q` filtering over the label.
 *   - hasMore propagates from the wrapper.
 *   - Auth-class SlackApiError → PROVIDER_REAUTH_REQUIRED; other SlackApiError
 *     → PROVIDER_ERROR — both sanitized (no raw Slack code / token).
 *   - Non-Slack throw bubbles to the route's catch-all.
 *   - INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch).
 *   - Meta wiring: unarchive_channel.channel uses the new source with
 *     manual entry, and its copy no longer claims archived channels can't
 *     be picked.
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

import { slackChannelsArchivedResolver } from "@/integrations/slack/options/channelsArchived";
import { slackUnarchiveChannelMeta } from "@/integrations/slack/actions/channels/unarchiveChannel.meta";
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
  scopes: ["channels:read", "groups:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
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
  mockDecryptToken.mockReturnValue(["xoxb", "decrypted", "test", "token"].join("-"));
});

describe("slackChannelsArchivedResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(slackChannelsArchivedResolver.source).toBe("slack:channels_archived");
    expect(slackChannelsArchivedResolver.provider).toBe("slack");
    expect(slackChannelsArchivedResolver.requiresIntegration).toBe(true);
    expect(slackChannelsArchivedResolver.requiredDeps).toBeUndefined();
  });
});

describe("slackChannelsArchivedResolver — wrapper invocation", () => {
  it("decrypts the bot token from the integration row exactly once", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });
    await slackChannelsArchivedResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:bot-token-cipher");
  });

  it("calls conversationsList with types=public+private, excludeArchived=FALSE, limit=200", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });
    await slackChannelsArchivedResolver.resolve(ctx());
    expect(mockConversationsList).toHaveBeenCalledTimes(1);
    expect(mockConversationsList).toHaveBeenCalledWith({
      botToken: ["xoxb", "decrypted", "test", "token"].join("-"),
      types: "public_channel,private_channel",
      excludeArchived: false,
      limit: 200,
    });
  });
});

describe("slackChannelsArchivedResolver — archived-only filtering + mapping", () => {
  it("keeps ONLY is_archived:true channels; maps to {value:id, label:#name, description}", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C01", name: "general", is_archived: false },
        {
          id: "C02",
          name: "old-project",
          is_archived: true,
          purpose: { value: "Sunset 2025 project." },
        },
        { id: "C03", name: "no-flag" },
        { id: "C04", name: "legacy", is_archived: true },
        { id: "C05", name: "truthy-string", is_archived: "true" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "C02",
        label: "#old-project",
        description: "Sunset 2025 project.",
      },
      { value: "C04", label: "#legacy" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to raw id as label when the archived channel has no name", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "G01HIDDEN", name: "", is_archived: true }],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "G01HIDDEN", label: "G01HIDDEN" }]);
  });

  it("drops archived channels missing a usable id", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "kept", is_archived: true },
        { id: "", name: "dropped-empty-id", is_archived: true },
        { name: "dropped-no-id", is_archived: true },
        { id: 42, name: "dropped-non-string-id", is_archived: true },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "C1", label: "#kept" }]);
  });

  it("omits description when purpose.value is missing / non-string / empty after trim", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "alpha", is_archived: true, purpose: undefined },
        { id: "C2", name: "beta", is_archived: true, purpose: { value: 42 } },
        { id: "C3", name: "gamma", is_archived: true, purpose: { value: "   " } },
        { id: "C4", name: "delta", is_archived: true, purpose: { value: "  Kept.  " } },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "C1", label: "#alpha" },
      { value: "C2", label: "#beta" },
      { value: "C3", label: "#gamma" },
      { value: "C4", label: "#delta", description: "Kept." },
    ]);
  });

  it("propagates hasMore=true from the wrapper (archived channels may sit on later pages)", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "C1", name: "a", is_archived: true }],
      hasMore: true,
      nextCursor: "cursor-2",
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("slackChannelsArchivedResolver — q filtering", () => {
  it("filters case-insensitively on the rendered label", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "old-general", is_archived: true },
        { id: "C2", name: "old-engineering", is_archived: true },
        { id: "C3", name: "sunset-random", is_archived: true },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx({ q: "Eng" }));
    expect(result.items.map((i) => i.value)).toEqual(["C2"]);
  });

  it("returns an empty list when q matches nothing", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "C1", name: "legacy", is_archived: true }],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx({ q: "zzz" }));
    expect(result.items).toEqual([]);
  });
});

describe("slackChannelsArchivedResolver — error sanitization", () => {
  it.each(["invalid_auth", "token_revoked", "missing_scope", "http_401", "http_403"])(
    "maps auth/scope-class SlackApiError '%s' to PROVIDER_REAUTH_REQUIRED (sanitized)",
    async (slackCode) => {
      mockConversationsList.mockRejectedValueOnce(new SlackApiError(slackCode));
      const thrown = await slackChannelsArchivedResolver.resolve(ctx()).catch((e) => e);
      expect(thrown).toBeInstanceOf(OptionsResolverError);
      const optErr = thrown as OptionsResolverError;
      expect(optErr.code).toBe("PROVIDER_REAUTH_REQUIRED");
      expect(optErr.message).not.toMatch(new RegExp(slackCode, "i"));
      expect(optErr.message).not.toMatch(/xoxb/i);
      expect(optErr.message).toMatch(/reconnect/i);
    },
  );

  it.each(["ratelimited", "http_500", "internal_error", "no_permission"])(
    "maps NON-auth SlackApiError '%s' to PROVIDER_ERROR with the generic retry message",
    async (slackCode) => {
      mockConversationsList.mockRejectedValueOnce(new SlackApiError(slackCode));
      const thrown = await slackChannelsArchivedResolver.resolve(ctx()).catch((e) => e);
      expect(thrown).toBeInstanceOf(OptionsResolverError);
      const optErr = thrown as OptionsResolverError;
      expect(optErr.code).toBe("PROVIDER_ERROR");
      expect(optErr.message).not.toMatch(new RegExp(slackCode, "i"));
      expect(optErr.message).not.toMatch(/xoxb/i);
      expect(optErr.message).toMatch(/couldn't load archived slack channels/i);
    },
  );

  it("propagates non-SlackApiError throws so the route maps them to SERVER_ERROR", async () => {
    const networkErr = new TypeError("fetch failed");
    mockConversationsList.mockRejectedValueOnce(networkErr);
    await expect(slackChannelsArchivedResolver.resolve(ctx())).rejects.toBe(networkErr);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch, no decrypt)", async () => {
    const thrown = await slackChannelsArchivedResolver
      .resolve(ctx({ integration: null }))
      .catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockConversationsList).not.toHaveBeenCalled();
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });

  it("labels carry channel names only — never emails or tokens (no-PII pin)", async () => {
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        {
          id: "C9",
          name: "archived-chan",
          is_archived: true,
          creator: "U123",
          topic: { value: "owner: marcus@example.com" },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackChannelsArchivedResolver.resolve(ctx());
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toMatch(/@example\.com/);
    expect(serialized).not.toMatch(/U123/);
    expect(serialized).not.toMatch(/xoxb/);
  });
});

describe("unarchive_channel meta wiring (RESOLVERS-1)", () => {
  it("channel field is a combobox on slack:channels_archived with manual entry", () => {
    const channel = slackUnarchiveChannelMeta.fields.find((f) => f.name === "channel");
    expect(channel).toBeDefined();
    expect(channel!.type).toBe("combobox");
    expect(channel!.optionsSource).toBe("slack:channels_archived");
    expect(channel!.allowManualEntry).toBe(true);
    expect(channel!.required).toBe(true);
  });

  it("copy no longer claims the picker can't show archived channels", () => {
    const channel = slackUnarchiveChannelMeta.fields.find((f) => f.name === "channel");
    const copy = `${slackUnarchiveChannelMeta.description} ${channel!.description ?? ""}`;
    expect(copy).not.toMatch(/do not appear in the channel picker/i);
    expect(copy).not.toMatch(/only surfaces non-archived/i);
    expect(copy).toMatch(/archived/i);
  });
});

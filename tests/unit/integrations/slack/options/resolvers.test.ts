/**
 * @jest-environment node
 *
 * slack options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockConversationsList = jest.fn();
const mockDecryptToken = jest.fn<string, [string]>();
const mockUsersList = jest.fn();

jest.mock("@/integrations/slack/api/conversationsList", () => ({
  __esModule: true,
  conversationsList: (...args: unknown[]) => mockConversationsList(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

jest.mock("@/integrations/slack/api/usersList", () => ({
  __esModule: true,
  usersList: (...args: unknown[]) => mockUsersList(...args),
}));

import { slackChannelsResolver } from "@/integrations/slack/options/channels";
import { SlackApiError } from "@/integrations/slack/api/errors";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { slackChannelsArchivedResolver } from "@/integrations/slack/options/channelsArchived";
import { slackUnarchiveChannelMeta } from "@/integrations/slack/actions/channels/unarchiveChannel.meta";
import { slackGroupDmsResolver } from "@/integrations/slack/options/groupDms";
import { slackUsersResolver } from "@/integrations/slack/options/users";

// ---------------------------------------------------------------------------
// Merged from the former channels.test.ts
// Tests for `integrations/slack/options/channels.ts` — Slice 3.32.
// Pin:
// - Wrapper invocation shape (types / excludeArchived / limit).
// - Token decryption is invoked once with the integration's
// encrypted access token.
// - Channel mapping: id → value, name → `#label`, name-less channel
// falls back to id, purpose.value → description (when non-empty,
// after trim), id-less records dropped.
// - Case-insensitive client-side `q` filtering over the label.
// - hasMore propagates from the wrapper.
// - SlackApiError → OptionsResolverError("PROVIDER_ERROR", sanitized).
// - Non-Slack throw bubbles to the route's catch-all.
// - Defensive INTEGRATION_DISCONNECTED throw when `ctx.integration`
// is null (route guards but the throw is the contract).
// - No token / raw Slack body leaks into the error message.
// ---------------------------------------------------------------------------
describe("channels (options)", () => {

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
  mockDecryptToken.mockReturnValue((["xoxb", "decrypted", "test", "token"].join("-")));
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
      botToken: (["xoxb", "decrypted", "test", "token"].join("-")),
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
    // V2-READY-26 — transport-level auth failures (a revoked/expired token Slack
    // returned as a non-2xx HTTP status, surfaced by slackApiRequest as
    // `http_<status>`) must ALSO map to reconnect, not the generic retry.
    "http_401",
    "http_403",
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

  it.each([
    "ratelimited",
    // V2-READY-26 — transient transport failures stay generic (a retry may clear
    // them); they must NOT be promoted to reconnect.
    "http_429",
    "http_500",
    "http_503",
    "internal_error",
    // V2-READY-30B — policy/access denials. NOT reconnect (re-auth can't fix a
    // permission/EKM block); the picker must NOT mark needs_reconnect_at for them.
    "no_permission",
    "ekm_access_denied",
  ])(
    "maps a NON-auth/transient SlackApiError '%s' to OptionsResolverError(PROVIDER_ERROR) with the generic retry message",
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
      expect(optErr.code).toBe("PROVIDER_ERROR");
      // No-leak: raw code + token never surface; copy stays the generic retry.
      expect(optErr.message).not.toMatch(new RegExp(slackCode, "i"));
      expect(optErr.message).not.toMatch(/xoxb/i);
      expect(optErr.message).toMatch(/couldn't load slack channels/i);
    },
  );

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

});

// ---------------------------------------------------------------------------
// Merged from the former channelsArchived.test.ts
// Tests for `integrations/slack/options/channelsArchived.ts` — RESOLVERS-1.
// Pin:
// - Wrapper invocation shape (types / excludeArchived: FALSE / limit).
// - ONLY `is_archived: true` conversations survive (active channels and
// records without the flag are dropped).
// - Channel mapping mirrors `slack:channels` (id → value, name → `#label`,
// id fallback, purpose.value → description, id-less dropped).
// - Case-insensitive client-side `q` filtering over the label.
// - hasMore propagates from the wrapper.
// - Auth-class SlackApiError → PROVIDER_REAUTH_REQUIRED; other SlackApiError
// → PROVIDER_ERROR — both sanitized (no raw Slack code / token).
// - Non-Slack throw bubbles to the route's catch-all.
// - INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch).
// - Meta wiring: unarchive_channel.channel uses the new source with
// manual entry, and its copy no longer claims archived channels can't
// be picked.
// ---------------------------------------------------------------------------
describe("channelsArchived (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former groupDms.test.ts
// Tests for `integrations/slack/options/groupDms.ts` (CONFIG-FIELD-UX-SWEEP-4).
// Pin:
// - Shape (source / provider / requiresIntegration / no requiredDeps).
// - conversationsList called with types="mpim", excludeArchived, limit.
// - Token decrypted once from the integration row.
// - Mapping: id → value, name → label, name-less mpim falls back to id,
// id-less records dropped. NO member-array expansion (no PII).
// - Case-insensitive client-side q filter over the label.
// - MISSING-SCOPE / RECONNECT: a Slack auth error (e.g. `missing_scope` on an
// old token without mpim:read) → PROVIDER_REAUTH_REQUIRED.
// - Non-auth SlackApiError → PROVIDER_ERROR (sanitized).
// - INTEGRATION_DISCONNECTED when ctx.integration is null.
// - No token / raw Slack body / member PII leaks into the output or error.
// ---------------------------------------------------------------------------
describe("groupDms (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former users.test.ts
// Tests for `integrations/slack/options/users.ts` (CONFIG-FIELD-UX-SWEEP).
// Pin:
// - Wrapper invocation (limit 200), token decrypted once.
// - Mapping: id → value, display name → `@label` (display_name →
// real_name → name precedence), name-less → id fallback, deleted
// members dropped, id-less dropped.
// - NEVER surfaces email (no-leak — V2 omits users:read.email).
// - Case-insensitive client-side `q` filtering over the label.
// - SlackApiError sanitization mirrors slack:channels.
// - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
// ---------------------------------------------------------------------------
describe("users (options)", () => {

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
  scopes: ["users:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockUsersList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue(["xoxb", "decrypted", "token"].join("-"));
});

describe("slackUsersResolver — shape + invocation", () => {
  it("declares the canonical source / provider / requiresIntegration", () => {
    expect(slackUsersResolver.source).toBe("slack:users");
    expect(slackUsersResolver.provider).toBe("slack");
    expect(slackUsersResolver.requiresIntegration).toBe(true);
    expect(slackUsersResolver.requiredDeps).toBeUndefined();
  });

  it("decrypts the bot token once and calls usersList with limit 200", async () => {
    mockUsersList.mockResolvedValueOnce({ users: [], hasMore: false, nextCursor: null });
    await slackUsersResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:bot-token-cipher");
    expect(mockUsersList).toHaveBeenCalledWith({
      botToken: ["xoxb", "decrypted", "token"].join("-"),
      limit: 200,
    });
  });
});

describe("slackUsersResolver — mapping", () => {
  it("maps to {value:id, label:@name} with display_name → real_name → name precedence", async () => {
    mockUsersList.mockResolvedValueOnce({
      users: [
        { id: "U1", name: "jdoe", real_name: "John Doe", profile: { display_name: "Johnny" } },
        { id: "U2", name: "asmith", real_name: "Alice Smith", profile: { display_name: "" } },
        { id: "U3", name: "bob", profile: {} },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "U1", label: "@Johnny" },
      { value: "U2", label: "@Alice Smith" },
      { value: "U3", label: "@bob" },
    ]);
  });

  it("drops deleted members and id-less records; name-less falls back to the id", async () => {
    mockUsersList.mockResolvedValueOnce({
      users: [
        { id: "U1", name: "kept" },
        { id: "U2", name: "gone", deleted: true },
        { name: "no-id" },
        { id: "", name: "empty-id" },
        { id: "U5" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "U1", label: "@kept" },
      { value: "U5", label: "U5" },
    ]);
  });

  it("NEVER surfaces an email even when present on the record (no-leak)", async () => {
    mockUsersList.mockResolvedValueOnce({
      users: [
        { id: "U1", name: "jdoe", profile: { display_name: "Johnny", email: "secret@corp.com" } },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const result = await slackUsersResolver.resolve(ctx());
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toMatch(/secret@corp\.com/);
    expect(result.items).toEqual([{ value: "U1", label: "@Johnny" }]);
  });

  it("filters case-insensitively on the rendered label; propagates hasMore", async () => {
    mockUsersList.mockResolvedValueOnce({
      users: [
        { id: "U1", name: "general" },
        { id: "U2", name: "engineer" },
      ],
      hasMore: true,
      nextCursor: "c2",
    });
    const result = await slackUsersResolver.resolve(ctx({ q: "ENG" }));
    expect(result.items.map((i) => i.value)).toEqual(["U2"]);
    expect(result.hasMore).toBe(true);
  });
});

describe("slackUsersResolver — error sanitization", () => {
  it("maps auth-class SlackApiError to PROVIDER_REAUTH_REQUIRED (sanitized, reconnect copy)", async () => {
    mockUsersList.mockRejectedValueOnce(new SlackApiError("invalid_auth"));
    let thrown: unknown;
    try {
      await slackUsersResolver.resolve(ctx());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const err = thrown as OptionsResolverError;
    expect(err.code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(err.message).not.toMatch(/invalid_auth/i);
    expect(err.message).not.toMatch(/xoxb/i);
    expect(err.message).toMatch(/reconnect/i);
  });

  it("maps a non-auth SlackApiError to PROVIDER_ERROR with the generic users copy", async () => {
    mockUsersList.mockRejectedValueOnce(new SlackApiError("ratelimited"));
    let thrown: unknown;
    try {
      await slackUsersResolver.resolve(ctx());
    } catch (e) {
      thrown = e;
    }
    const err = thrown as OptionsResolverError;
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/ratelimited/i);
    expect(err.message).toMatch(/couldn't load slack users/i);
  });

  it("propagates non-SlackApiError throws (route → SERVER_ERROR)", async () => {
    const networkErr = new TypeError("fetch failed");
    mockUsersList.mockRejectedValueOnce(networkErr);
    await expect(slackUsersResolver.resolve(ctx())).rejects.toBe(networkErr);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no wrapper call)", async () => {
    let thrown: unknown;
    try {
      await slackUsersResolver.resolve(ctx({ integration: null }));
    } catch (e) {
      thrown = e;
    }
    expect((thrown as OptionsResolverError).code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockUsersList).not.toHaveBeenCalled();
    expect(mockDecryptToken).not.toHaveBeenCalled();
  });
});

});

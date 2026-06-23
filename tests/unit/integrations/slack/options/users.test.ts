/**
 * @jest-environment node
 *
 * Tests for `integrations/slack/options/users.ts` (CONFIG-FIELD-UX-SWEEP).
 *
 * Pin:
 *   - Wrapper invocation (limit 200), token decrypted once.
 *   - Mapping: id → value, display name → `@label` (display_name →
 *     real_name → name precedence), name-less → id fallback, deleted
 *     members dropped, id-less dropped.
 *   - NEVER surfaces email (no-leak — V2 omits users:read.email).
 *   - Case-insensitive client-side `q` filtering over the label.
 *   - SlackApiError sanitization mirrors slack:channels.
 *   - Defensive INTEGRATION_DISCONNECTED when ctx.integration is null.
 */

const mockUsersList = jest.fn();
jest.mock("@/integrations/slack/api/usersList", () => ({
  __esModule: true,
  usersList: (...args: unknown[]) => mockUsersList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { slackUsersResolver } from "@/integrations/slack/options/users";
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

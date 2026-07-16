/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-teams/options/chats.ts` — RESOLVERS-1.
 * Chat picker for `send_chat_message.chatId` (un-deferred with Marcus's
 * sign-off): topic when set, else participant display names (≤3 + "…"),
 * else the chat id. Labels carry display names ONLY — never emails,
 * never message content.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftTeamsChatsResolver } from "@/integrations/microsoft-teams/options/chats";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-teams",
  providerAccountId: "ada@contoso.com",
  displayName: "Ada (Teams)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: ["offline_access", "Chat.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-14T00:00:00Z",
  updatedAt: "2026-07-14T00:00:00Z",
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

function chats(list: unknown[], nextLink: string | null = null) {
  return { chats: list, nextLink };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftTeamsChatsResolver — shape", () => {
  it("is the account-scoped chats root (no deps) and requires an integration", () => {
    expect(microsoftTeamsChatsResolver.source).toBe("microsoft-teams:chats");
    expect(microsoftTeamsChatsResolver.provider).toBe("microsoft-teams");
    expect(microsoftTeamsChatsResolver.requiresIntegration).toBe(true);
    expect(microsoftTeamsChatsResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftTeamsChatsResolver — labeling", () => {
  it("uses the topic when set, else joins member displayNames; description = chat type", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      chats([
        {
          id: "19:named@thread.v2",
          topic: "Launch planning",
          chatType: "group",
          members: [{ displayName: "Ada" }, { displayName: "Grace" }],
        },
        {
          id: "19:dm@thread.v2",
          topic: null,
          chatType: "oneOnOne",
          members: [{ displayName: "Ada" }, { displayName: "Linus" }],
        },
      ]),
    );
    const result = await microsoftTeamsChatsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "19:named@thread.v2",
        label: "Launch planning",
        description: "Group chat",
      },
      {
        value: "19:dm@thread.v2",
        label: "Ada, Linus",
        description: "1:1 chat",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("caps the member-name label at 3 names + ellipsis, skipping blank names", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      chats([
        {
          id: "19:big@thread.v2",
          topic: "",
          chatType: "group",
          members: [
            { displayName: "Ada" },
            { displayName: "  " },
            { displayName: "Grace" },
            { displayName: "Linus" },
            { displayName: "Margaret" },
          ],
        },
      ]),
    );
    const result = await microsoftTeamsChatsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("Ada, Grace, Linus…");
  });

  it("falls back to the chat id when there is no topic and no member names; skips id-less chats; unknown chatType → no description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      chats([
        { id: "19:bare@thread.v2", topic: null, chatType: "unknownFutureValue", members: [] },
        { topic: "No id", chatType: "group", members: [] },
      ]),
    );
    const result = await microsoftTeamsChatsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "19:bare@thread.v2", label: "19:bare@thread.v2" },
    ]);
  });

  it("labels NEVER carry member emails or message content (display names only)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      chats([
        {
          id: "19:dm@thread.v2",
          topic: null,
          chatType: "oneOnOne",
          members: [
            { displayName: "Ada", email: "ada@contoso.com" },
            { displayName: "Linus", email: "linus@contoso.com" },
          ],
          lastMessagePreview: { body: { content: "secret message text" } },
        },
      ]),
    );
    const result = await microsoftTeamsChatsResolver.resolve(ctx());
    const flat = JSON.stringify(result.items);
    expect(flat).not.toContain("@contoso.com");
    expect(flat).not.toContain("secret message text");
  });

  it("preserves Graph's recency order (no alpha sort), filters by q on label or description, honest hasMore", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      chats(
        [
          {
            id: "19:z@thread.v2",
            topic: "Zeta chat",
            chatType: "group",
            members: [],
          },
          {
            id: "19:a@thread.v2",
            topic: "Alpha chat",
            chatType: "group",
            members: [],
          },
        ],
        "https://graph/next",
      ),
    );
    const result = await microsoftTeamsChatsResolver.resolve(ctx({ q: "chat" }));
    // Recency order preserved: Zeta (most recent) stays first.
    expect(result.items.map((i) => i.value)).toEqual([
      "19:z@thread.v2",
      "19:a@thread.v2",
    ]);
    expect(result.hasMore).toBe(true);

    mockRefreshAndRetry.mockResolvedValueOnce(
      chats([
        { id: "19:z@thread.v2", topic: "Zeta chat", chatType: "group", members: [] },
        { id: "19:a@thread.v2", topic: "Alpha chat", chatType: "group", members: [] },
      ]),
    );
    const filtered = await microsoftTeamsChatsResolver.resolve(ctx({ q: "alpha" }));
    expect(filtered.items.map((i) => i.value)).toEqual(["19:a@thread.v2"]);
  });
});

describe("microsoftTeamsChatsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftTeamsChatsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-teams",
        providerAccountId: "ada@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftTeamsChatsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftTeamsChatsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph bodies or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('me/chats GET failed: {"secret":"raw-body"} Bearer xyz'),
    );
    try {
      await microsoftTeamsChatsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("raw-body");
      expect(msg).not.toContain("Bearer");
    }
  });
});

/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/options/conversations.ts` — Slice 3.FACEBOOK-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
const mockConversationsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...args: unknown[]) => mockGetPageAccessToken(...args),
}));
jest.mock("@/integrations/_shared/facebook/api/conversationsList", () => ({
  conversationsList: (...args: unknown[]) => mockConversationsList(...args),
}));

import { facebookConversationsResolver } from "@/integrations/facebook/options/conversations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  FacebookPermissionError,
  NotFoundError,
} from "@/integrations/_shared/facebook/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pages_messaging"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { pageId: "page-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetPageAccessToken.mockReset();
  mockConversationsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
});

describe("facebookConversationsResolver — shape", () => {
  it("declares facebook:conversations, requiredDeps=['pageId']", () => {
    expect(facebookConversationsResolver.source).toBe("facebook:conversations");
    expect(facebookConversationsResolver.provider).toBe("facebook");
    expect(facebookConversationsResolver.requiresIntegration).toBe(true);
    expect(facebookConversationsResolver.requiredDeps).toEqual(["pageId"]);
  });

  it("MISSING_DEPENDENCY when pageId dep is absent", async () => {
    await expect(
      facebookConversationsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      facebookConversationsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("facebookConversationsResolver — mapping + page-token derivation", () => {
  it("derives the Page token then lists conversations with it", async () => {
    mockConversationsList.mockResolvedValueOnce({ data: [] });
    await facebookConversationsResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "facebook",
      accountId: "fb-user-1",
    });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockConversationsList.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
    });
  });

  it("emits value=`conversationId:psid` (psid = the non-page participant) and label=recipient name", async () => {
    mockConversationsList.mockResolvedValueOnce({
      data: [
        {
          id: "t_100",
          participants: {
            data: [
              { id: "page-1", name: "Acme Page" },
              { id: "psid-aaa", name: "Jordan Rivers" },
            ],
          },
          updated_time: "2026-05-24T10:00:00+0000",
        },
      ],
    });
    const result = await facebookConversationsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "t_100:psid-aaa", label: "Jordan Rivers" },
    ]);
  });

  it("skips conversations with no distinct (non-page) participant", async () => {
    mockConversationsList.mockResolvedValueOnce({
      data: [
        // Only the page is a participant — can't be messaged → dropped.
        { id: "t_self", participants: { data: [{ id: "page-1", name: "Acme Page" }] } },
        {
          id: "t_ok",
          participants: {
            data: [
              { id: "page-1", name: "Acme Page" },
              { id: "psid-bbb", name: "Sam" },
            ],
          },
        },
      ],
    });
    const result = await facebookConversationsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "t_ok:psid-bbb", label: "Sam" }]);
  });

  it("falls back to the conversation id when the recipient name is missing", async () => {
    mockConversationsList.mockResolvedValueOnce({
      data: [
        { id: "t_x", participants: { data: [{ id: "page-1" }, { id: "psid-ccc" }] } },
      ],
    });
    const result = await facebookConversationsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "t_x:psid-ccc", label: "t_x" }]);
  });

  it("empty result returns empty items", async () => {
    mockConversationsList.mockResolvedValueOnce({ data: [] });
    const result = await facebookConversationsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side on the recipient label", async () => {
    mockConversationsList.mockResolvedValueOnce({
      data: [
        { id: "t1", participants: { data: [{ id: "page-1" }, { id: "p1", name: "Alice Smith" }] } },
        { id: "t2", participants: { data: [{ id: "page-1" }, { id: "p2", name: "Bob Jones" }] } },
      ],
    });
    const result = await facebookConversationsResolver.resolve(ctx({ q: "alice" }));
    expect(result.items.map((i) => i.value)).toEqual(["t1:p1"]);
  });

  it("hasMore reflects paging.next presence", async () => {
    mockConversationsList.mockResolvedValueOnce({
      data: [{ id: "t1", participants: { data: [{ id: "page-1" }, { id: "p1", name: "Alice" }] } }],
      paging: { next: "https://graph.facebook.com/next" },
    });
    const result = await facebookConversationsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("facebookConversationsResolver — no-access page (cascade fallback)", () => {
  it("returns empty items when getPageAccessToken throws NotFoundError", async () => {
    mockGetPageAccessToken.mockRejectedValueOnce(
      new NotFoundError("page/page-1/no_access_token"),
    );
    const result = await facebookConversationsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(mockConversationsList).not.toHaveBeenCalled();
  });
});

describe("facebookConversationsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockConversationsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "facebook",
        accountId: "fb-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      facebookConversationsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("INTEGRATION_DISCONNECTED on a leaked Unauthorized401Error", async () => {
    mockConversationsList.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      facebookConversationsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("PROVIDER_ERROR on FacebookPermissionError WITHOUT the App-Review hint", async () => {
    mockConversationsList.mockRejectedValueOnce(
      new FacebookPermissionError("OAuthException/code=200"),
    );
    let caught: unknown;
    try {
      await facebookConversationsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (caught as OptionsResolverError).message;
    expect(msg).not.toMatch(/app review/i);
    expect(msg).not.toMatch(/advanced access/i);
  });

  it("PROVIDER_ERROR with a sanitized message (no token / message-text leak)", async () => {
    const leak = "private-message-body-secret";
    mockConversationsList.mockRejectedValueOnce(new Error(`graph failure ${leak}`));
    let caught: unknown;
    try {
      await facebookConversationsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

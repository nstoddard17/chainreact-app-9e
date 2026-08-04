/**
 * @jest-environment node
 *
 * facebook options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
const mockAlbumsList = jest.fn();
const mockConversationsList = jest.fn();
const mockPagesList = jest.fn();
const mockPostsList = jest.fn();

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

jest.mock("@/integrations/_shared/facebook/api/albumsList", () => ({
  albumsList: (...args: unknown[]) => mockAlbumsList(...args),
}));

jest.mock("@/integrations/_shared/facebook/api/conversationsList", () => ({
  conversationsList: (...args: unknown[]) => mockConversationsList(...args),
}));

jest.mock("@/integrations/_shared/facebook/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));

jest.mock("@/integrations/_shared/facebook/api/postsList", () => ({
  postsList: (...args: unknown[]) => mockPostsList(...args),
}));

import { facebookAlbumsResolver } from "@/integrations/facebook/options/albums";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { FacebookPermissionError, NotFoundError } from "@/integrations/_shared/facebook/errors";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { facebookConversationsResolver } from "@/integrations/facebook/options/conversations";
import { facebookPagesResolver } from "@/integrations/facebook/options/pages";
import { facebookPostsResolver } from "@/integrations/facebook/options/posts";

// ---------------------------------------------------------------------------
// Merged from the former albums.test.ts
// Tests for `integrations/facebook/options/albums.ts` — Slice 3.FACEBOOK-3.
// ---------------------------------------------------------------------------
describe("albums (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pages_read_engagement"],
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
  mockAlbumsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
});

describe("facebookAlbumsResolver — shape", () => {
  it("declares facebook:albums, requiredDeps=['pageId']", () => {
    expect(facebookAlbumsResolver.source).toBe("facebook:albums");
    expect(facebookAlbumsResolver.provider).toBe("facebook");
    expect(facebookAlbumsResolver.requiresIntegration).toBe(true);
    expect(facebookAlbumsResolver.requiredDeps).toEqual(["pageId"]);
  });

  it("MISSING_DEPENDENCY when pageId dep is absent", async () => {
    await expect(
      facebookAlbumsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      facebookAlbumsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("facebookAlbumsResolver — mapping + page-token derivation", () => {
  it("derives the Page token then lists albums with it", async () => {
    mockAlbumsList.mockResolvedValueOnce({ data: [] });
    await facebookAlbumsResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "facebook",
      providerAccountId: "fb-user-1",
    });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockAlbumsList.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
    });
  });

  it("maps albums → {value: id, label: name, description: count}, alpha-sorted", async () => {
    mockAlbumsList.mockResolvedValueOnce({
      data: [
        { id: "a2", name: "Vacation", count: 12 },
        { id: "a1", name: "Events", count: 1 },
      ],
    });
    const result = await facebookAlbumsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "a1", label: "Events", description: "1 photo" },
      { value: "a2", label: "Vacation", description: "12 photos" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits the description when count is absent; id fallback for nameless album", async () => {
    mockAlbumsList.mockResolvedValueOnce({ data: [{ id: "a9" }] });
    const result = await facebookAlbumsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "a9", label: "a9" }]);
  });

  it("empty result returns empty items", async () => {
    mockAlbumsList.mockResolvedValueOnce({ data: [] });
    const result = await facebookAlbumsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side on the label", async () => {
    mockAlbumsList.mockResolvedValueOnce({
      data: [
        { id: "a1", name: "Summer Trip" },
        { id: "a2", name: "Product Shots" },
      ],
    });
    const result = await facebookAlbumsResolver.resolve(ctx({ q: "product" }));
    expect(result.items.map((i) => i.value)).toEqual(["a2"]);
  });

  it("hasMore reflects paging.next presence", async () => {
    mockAlbumsList.mockResolvedValueOnce({
      data: [{ id: "a1", name: "Events" }],
      paging: { next: "https://graph.facebook.com/next" },
    });
    const result = await facebookAlbumsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("facebookAlbumsResolver — no-access page (cascade fallback)", () => {
  it("returns empty items when getPageAccessToken throws NotFoundError", async () => {
    mockGetPageAccessToken.mockRejectedValueOnce(
      new NotFoundError("page/page-1/no_access_token"),
    );
    const result = await facebookAlbumsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(mockAlbumsList).not.toHaveBeenCalled();
  });
});

describe("facebookAlbumsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockAlbumsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "facebook",
        providerAccountId: "fb-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(facebookAlbumsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on a leaked Unauthorized401Error", async () => {
    mockAlbumsList.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(facebookAlbumsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR on FacebookPermissionError WITHOUT the App-Review hint", async () => {
    mockAlbumsList.mockRejectedValueOnce(
      new FacebookPermissionError("OAuthException/code=10"),
    );
    let caught: unknown;
    try {
      await facebookAlbumsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (caught as OptionsResolverError).message;
    expect(msg).not.toMatch(/app review/i);
    expect(msg).not.toMatch(/advanced access/i);
  });

  it("PROVIDER_ERROR with a sanitized message (no leak)", async () => {
    const leak = "page-tok-secret";
    mockAlbumsList.mockRejectedValueOnce(new Error(`graph failure ${leak}`));
    let caught: unknown;
    try {
      await facebookAlbumsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former conversations.test.ts
// Tests for `integrations/facebook/options/conversations.ts` — Slice 3.FACEBOOK-3.
// ---------------------------------------------------------------------------
describe("conversations (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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
      providerAccountId: "fb-user-1",
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
        accountId: "user-1",
        provider: "facebook",
        providerAccountId: "fb-user-1",
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

});

// ---------------------------------------------------------------------------
// Merged from the former pages.test.ts
// Tests for `integrations/facebook/options/pages.ts` — Slice 3.FACEBOOK-3.
// ---------------------------------------------------------------------------
describe("pages (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pages_show_list"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
});

describe("facebookPagesResolver — shape", () => {
  it("declares facebook:pages, account-scoped, no deps", () => {
    expect(facebookPagesResolver.source).toBe("facebook:pages");
    expect(facebookPagesResolver.provider).toBe("facebook");
    expect(facebookPagesResolver.requiresIntegration).toBe(true);
    expect(facebookPagesResolver.requiredDeps).toBeUndefined();
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      facebookPagesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("facebookPagesResolver — mapping", () => {
  it("lists pages via refreshAndRetry(provider=facebook, accountId) using the user token", async () => {
    mockPagesList.mockResolvedValueOnce({ data: [] });
    await facebookPagesResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "facebook",
      providerAccountId: "fb-user-1",
      });
    // User token threaded into pagesList (no page-token derivation here).
    expect(mockPagesList.mock.calls[0]![0]).toEqual({ accessToken: "user-tok" });
  });

  it("maps pages → {value: id, label: name}, alpha-sorted", async () => {
    mockPagesList.mockResolvedValueOnce({
      data: [
        { id: "p2", name: "Zebra Co", access_token: "PAGE-TOK-2" },
        { id: "p1", name: "Acme", access_token: "PAGE-TOK-1" },
      ],
    });
    const result = await facebookPagesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "p1", label: "Acme" },
      { value: "p2", label: "Zebra Co" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the id when a page name is missing", async () => {
    mockPagesList.mockResolvedValueOnce({ data: [{ id: "p9" }] });
    const result = await facebookPagesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "p9", label: "p9" }]);
  });

  it("NEVER leaks the per-page access_token into items", async () => {
    mockPagesList.mockResolvedValueOnce({
      data: [{ id: "p1", name: "Acme", access_token: "PAGE-TOK-SECRET" }],
    });
    const result = await facebookPagesResolver.resolve(ctx());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PAGE-TOK-SECRET");
    expect(serialized).not.toContain("access_token");
  });

  it("empty result returns empty items", async () => {
    mockPagesList.mockResolvedValueOnce({ data: [] });
    const result = await facebookPagesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies the q filter client-side on the label", async () => {
    mockPagesList.mockResolvedValueOnce({
      data: [
        { id: "p1", name: "Acme Bakery" },
        { id: "p2", name: "Beta Studio" },
      ],
    });
    const result = await facebookPagesResolver.resolve(ctx({ q: "acme" }));
    expect(result.items.map((i) => i.value)).toEqual(["p1"]);
  });

  it("hasMore reflects paging.next presence", async () => {
    mockPagesList.mockResolvedValueOnce({
      data: [{ id: "p1", name: "Acme" }],
      paging: { next: "https://graph.facebook.com/next-page" },
    });
    const result = await facebookPagesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("facebookPagesResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on IntegrationActionRequiredError (non-refreshable reconnect)", async () => {
    mockPagesList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "facebook",
        providerAccountId: "fb-user-1",
        reason: "refresh_not_supported",
      }),
    );
    await expect(facebookPagesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on a leaked Unauthorized401Error", async () => {
    mockPagesList.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(facebookPagesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR on FacebookPermissionError WITHOUT leaking the internal App-Review hint", async () => {
    mockPagesList.mockRejectedValueOnce(
      new FacebookPermissionError("OAuthException/code=200"),
    );
    let caught: unknown;
    try {
      await facebookPagesResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (caught as OptionsResolverError).message;
    // The user-facing message must NOT carry Meta App-Review caveats.
    expect(msg).not.toMatch(/app review/i);
    expect(msg).not.toMatch(/advanced access/i);
    expect(msg).not.toContain("OAuthException");
  });

  it("PROVIDER_ERROR with a sanitized message (no token leak)", async () => {
    const leak = "EAAB-leaked-token-xyz";
    mockPagesList.mockRejectedValueOnce(new Error(`graph failure ${leak}`));
    let caught: unknown;
    try {
      await facebookPagesResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former posts.test.ts
// Tests for `integrations/facebook/options/posts.ts` — Slice 3.FACEBOOK-3.
// ---------------------------------------------------------------------------
describe("posts (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pages_read_engagement"],
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
  mockPostsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
});

describe("facebookPostsResolver — shape", () => {
  it("declares facebook:posts, requiredDeps=['pageId'] (verbatim)", () => {
    expect(facebookPostsResolver.source).toBe("facebook:posts");
    expect(facebookPostsResolver.provider).toBe("facebook");
    expect(facebookPostsResolver.requiresIntegration).toBe(true);
    expect(facebookPostsResolver.requiredDeps).toEqual(["pageId"]);
  });

  it("MISSING_DEPENDENCY when pageId dep is absent", async () => {
    await expect(
      facebookPostsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      facebookPostsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("facebookPostsResolver — mapping + page-token derivation", () => {
  it("derives the Page token from the user token, then lists posts with the Page token", async () => {
    mockPostsList.mockResolvedValueOnce({ data: [] });
    await facebookPostsResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "facebook",
      providerAccountId: "fb-user-1",
    });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockPostsList.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
    });
  });

  it("maps posts → {value: id, label: message snippet, description: date}, API order preserved", async () => {
    mockPostsList.mockResolvedValueOnce({
      data: [
        { id: "p_2", message: "Newest update", created_time: "2026-05-24T10:00:00+0000" },
        { id: "p_1", message: "Older update", created_time: "2026-05-20T10:00:00+0000" },
      ],
    });
    const result = await facebookPostsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "p_2", label: "Newest update", description: "2026-05-24" },
      { value: "p_1", label: "Older update", description: "2026-05-20" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("truncates a long message snippet and falls back to the id for media-only posts", async () => {
    const long = "x".repeat(100);
    mockPostsList.mockResolvedValueOnce({
      data: [
        { id: "p_long", message: long },
        { id: "p_media" },
      ],
    });
    const result = await facebookPostsResolver.resolve(ctx());
    expect(result.items[0]!.value).toBe("p_long");
    expect(result.items[0]!.label.length).toBeLessThanOrEqual(60);
    expect(result.items[0]!.label.endsWith("…")).toBe(true);
    expect(result.items[1]).toEqual({ value: "p_media", label: "p_media" });
  });

  it("empty result returns empty items", async () => {
    mockPostsList.mockResolvedValueOnce({ data: [] });
    const result = await facebookPostsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("applies the q filter client-side on the label", async () => {
    mockPostsList.mockResolvedValueOnce({
      data: [
        { id: "p1", message: "Invoice reminder" },
        { id: "p2", message: "Holiday sale" },
      ],
    });
    const result = await facebookPostsResolver.resolve(ctx({ q: "invoice" }));
    expect(result.items.map((i) => i.value)).toEqual(["p1"]);
  });

  it("hasMore reflects paging.next presence", async () => {
    mockPostsList.mockResolvedValueOnce({
      data: [{ id: "p1", message: "hi" }],
      paging: { next: "https://graph.facebook.com/next" },
    });
    const result = await facebookPostsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("facebookPostsResolver — no-access page (cascade fallback)", () => {
  it("returns empty items when getPageAccessToken throws NotFoundError (page not manageable)", async () => {
    mockGetPageAccessToken.mockRejectedValueOnce(
      new NotFoundError("page/page-1/no_access_token"),
    );
    const result = await facebookPostsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(mockPostsList).not.toHaveBeenCalled();
  });

  it("returns empty items when the list call throws NotFoundError (node gone)", async () => {
    mockPostsList.mockRejectedValueOnce(new NotFoundError("page-1/posts"));
    const result = await facebookPostsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("facebookPostsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockPostsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "facebook",
        providerAccountId: "fb-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(facebookPostsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on a leaked Unauthorized401Error", async () => {
    mockPostsList.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(facebookPostsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR on FacebookPermissionError WITHOUT the App-Review hint", async () => {
    mockPostsList.mockRejectedValueOnce(
      new FacebookPermissionError("OAuthException/code=200"),
    );
    let caught: unknown;
    try {
      await facebookPostsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (caught as OptionsResolverError).message;
    expect(msg).not.toMatch(/app review/i);
    expect(msg).not.toMatch(/advanced access/i);
  });

  it("PROVIDER_ERROR with a sanitized message (no token / page-token leak)", async () => {
    const leak = "page-tok-secret-xyz";
    mockPostsList.mockRejectedValueOnce(new Error(`graph failure ${leak}`));
    let caught: unknown;
    try {
      await facebookPostsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
    expect((caught as OptionsResolverError).message).not.toContain("appsecret_proof");
  });
});

});

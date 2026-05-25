/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/options/posts.ts` — Slice 3.FACEBOOK-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
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
jest.mock("@/integrations/_shared/facebook/api/postsList", () => ({
  postsList: (...args: unknown[]) => mockPostsList(...args),
}));

import { facebookPostsResolver } from "@/integrations/facebook/options/posts";
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
      accountId: "fb-user-1",
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
        userId: "user-1",
        provider: "facebook",
        accountId: "fb-user-1",
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

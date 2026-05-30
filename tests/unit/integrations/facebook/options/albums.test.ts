/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/options/albums.ts` — Slice 3.FACEBOOK-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
const mockAlbumsList = jest.fn();

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

import { facebookAlbumsResolver } from "@/integrations/facebook/options/albums";
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
      accountId: "fb-user-1",
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

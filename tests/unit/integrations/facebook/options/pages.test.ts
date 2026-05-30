/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/options/pages.ts` — Slice 3.FACEBOOK-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockPagesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/facebook/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));

import { facebookPagesResolver } from "@/integrations/facebook/options/pages";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { FacebookPermissionError } from "@/integrations/_shared/facebook/errors";
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
      accountId: "fb-user-1",
      userId: "user-1",
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

/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/options/cards.ts` — Slice
 * 4.TRELLO-META-2. Depends on `boardId`; bounded page; value = card id;
 * NO card description / comment content surfaced.
 */

const mockCardsList = jest.fn();
jest.mock("@/integrations/trello/api/cardsList", () => ({
  __esModule: true,
  cardsList: (...args: unknown[]) => mockCardsList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import {
  trelloCardsResolver,
  CARDS_PAGE_LIMIT,
} from "@/integrations/trello/options/cards";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
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
  provider: "trello",
  providerAccountId: "trelloMemberId",
  displayName: "Ada (Trello)",
  accessTokenEncrypted: "enc:trello-cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
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
    deps: { boardId: "b1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockCardsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-trello-token");
});

describe("trelloCardsResolver — shape", () => {
  it("declares requiredDeps=['boardId'] and requires an integration", () => {
    expect(trelloCardsResolver.source).toBe("trello:cards");
    expect(trelloCardsResolver.provider).toBe("trello");
    expect(trelloCardsResolver.requiresIntegration).toBe(true);
    expect(trelloCardsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("trelloCardsResolver — wrapper invocation (bounded)", () => {
  it("calls cardsList with the decrypted token, boardId, and the page cap", async () => {
    mockCardsList.mockResolvedValueOnce([]);
    await trelloCardsResolver.resolve(ctx());
    expect(mockCardsList).toHaveBeenCalledWith({
      accessToken: "decrypted-trello-token",
      boardId: "b1",
      limit: CARDS_PAGE_LIMIT,
    });
  });
});

describe("trelloCardsResolver — mapping (value = card id, no body content)", () => {
  it("maps id → value, name → label, due → description; preserves order", async () => {
    mockCardsList.mockResolvedValueOnce([
      { id: "c2", name: "Second", due: null },
      { id: "c1", name: "First", due: "2026-06-01T00:00:00Z" },
    ]);
    const result = await trelloCardsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "c2", label: "Second" },
      { value: "c1", label: "First", description: "Due 2026-06-01T00:00:00Z" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("never surfaces card description/body content even if present in the payload", async () => {
    mockCardsList.mockResolvedValueOnce([
      {
        id: "c1",
        name: "Visible title",
        desc: "SECRET card body that must not leak",
        due: null,
      },
    ]);
    const result = await trelloCardsResolver.resolve(ctx());
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toContain("SECRET card body");
    expect(result.items).toEqual([{ value: "c1", label: "Visible title" }]);
  });

  it("falls back to id as label when name missing; drops id-less cards", async () => {
    mockCardsList.mockResolvedValueOnce([
      { id: "cX", name: "" },
      { id: "", name: "Ghost" },
    ]);
    const result = await trelloCardsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "cX", label: "cX" }]);
  });

  it("applies case-insensitive q filter on label", async () => {
    mockCardsList.mockResolvedValueOnce([
      { id: "c1", name: "Ship the release" },
      { id: "c2", name: "Write the spec" },
    ]);
    const result = await trelloCardsResolver.resolve(ctx({ q: "spec" }));
    expect(result.items.map((i) => i.value)).toEqual(["c2"]);
  });
});

describe("trelloCardsResolver — bounded page / hasMore", () => {
  it("caps output at CARDS_PAGE_LIMIT and sets hasMore=true when truncated", async () => {
    const many = Array.from({ length: CARDS_PAGE_LIMIT + 5 }, (_v, i) => ({
      id: `c${i}`,
      name: `Card ${i}`,
      due: null,
    }));
    mockCardsList.mockResolvedValueOnce(many);
    const result = await trelloCardsResolver.resolve(ctx());
    expect(result.items).toHaveLength(CARDS_PAGE_LIMIT);
    expect(result.hasMore).toBe(true);
  });

  it("hasMore=false when the page is not truncated", async () => {
    mockCardsList.mockResolvedValueOnce([{ id: "c1", name: "Only", due: null }]);
    const result = await trelloCardsResolver.resolve(ctx());
    expect(result.hasMore).toBe(false);
  });
});

describe("trelloCardsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when boardId empty, no API call", async () => {
    await expect(
      trelloCardsResolver.resolve(ctx({ deps: { boardId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockCardsList).not.toHaveBeenCalled();
  });

  it("returns empty items when parent board is gone (TrelloNotFoundError)", async () => {
    mockCardsList.mockRejectedValueOnce(
      new TrelloNotFoundError("board bGONE cards"),
    );
    const result = await trelloCardsResolver.resolve(
      ctx({ deps: { boardId: "bGONE" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("trelloCardsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      trelloCardsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockCardsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockCardsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(trelloCardsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockCardsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "trello",
        providerAccountId: "trelloMemberId",
        reason: "refresh_not_supported",
      }),
    );
    await expect(trelloCardsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockCardsList.mockRejectedValueOnce(
      new Error('Trello failed: {"raw":"card-secret-leak"} token=xyz'),
    );
    let thrown: unknown;
    try {
      await trelloCardsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((thrown as Error).message).not.toContain("card-secret-leak");
  });
});

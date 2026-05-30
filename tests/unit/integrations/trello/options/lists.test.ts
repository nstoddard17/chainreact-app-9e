/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/options/lists.ts` — Slice
 * 4.TRELLO-META-2. Depends on `boardId`; value = list id; preserves
 * Trello column order; deleted/no-access board → empty items.
 */

const mockListsList = jest.fn();
jest.mock("@/integrations/trello/api/listsList", () => ({
  __esModule: true,
  listsList: (...args: unknown[]) => mockListsList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { trelloListsResolver } from "@/integrations/trello/options/lists";
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
  mockListsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-trello-token");
});

describe("trelloListsResolver — shape", () => {
  it("declares requiredDeps=['boardId'] (schema-verbatim) and requires an integration", () => {
    expect(trelloListsResolver.source).toBe("trello:lists");
    expect(trelloListsResolver.provider).toBe("trello");
    expect(trelloListsResolver.requiresIntegration).toBe(true);
    expect(trelloListsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("trelloListsResolver — wrapper invocation", () => {
  it("calls listsList with the decrypted token + boardId from deps", async () => {
    mockListsList.mockResolvedValueOnce([]);
    await trelloListsResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:trello-cipher");
    expect(mockListsList).toHaveBeenCalledWith({
      accessToken: "decrypted-trello-token",
      boardId: "b1",
    });
  });
});

describe("trelloListsResolver — mapping (value = list id, order preserved)", () => {
  it("maps id → value, name → label, closed → Archived; preserves Trello order", async () => {
    mockListsList.mockResolvedValueOnce([
      { id: "l2", name: "Done", closed: false },
      { id: "l1", name: "To Do", closed: true },
    ]);
    const result = await trelloListsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "l2", label: "Done" },
      { value: "l1", label: "To Do", description: "Archived" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id as label when name missing; drops id-less lists", async () => {
    mockListsList.mockResolvedValueOnce([
      { id: "lX", name: "" },
      { id: "", name: "Ghost" },
    ]);
    const result = await trelloListsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "lX", label: "lX" }]);
  });

  it("applies case-insensitive q filter on label", async () => {
    mockListsList.mockResolvedValueOnce([
      { id: "l1", name: "Backlog" },
      { id: "l2", name: "In Progress" },
    ]);
    const result = await trelloListsResolver.resolve(ctx({ q: "progress" }));
    expect(result.items.map((i) => i.value)).toEqual(["l2"]);
  });
});

describe("trelloListsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when boardId empty, no decrypt / API call", async () => {
    await expect(
      trelloListsResolver.resolve(ctx({ deps: { boardId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockListsList).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when boardId missing, no API call", async () => {
    await expect(
      trelloListsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockListsList).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent board is gone (TrelloNotFoundError)", async () => {
    mockListsList.mockRejectedValueOnce(
      new TrelloNotFoundError("board bGONE lists"),
    );
    const result = await trelloListsResolver.resolve(
      ctx({ deps: { boardId: "bGONE" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("trelloListsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      trelloListsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockListsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockListsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(trelloListsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockListsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "trello",
        providerAccountId: "trelloMemberId",
        reason: "refresh_not_supported",
      }),
    );
    await expect(trelloListsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockListsList.mockRejectedValueOnce(
      new Error('Trello failed: {"raw":"list-secret-leak"} token=xyz'),
    );
    let thrown: unknown;
    try {
      await trelloListsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (thrown as Error).message;
    expect(msg).not.toContain("list-secret-leak");
    expect(msg).not.toContain("token=xyz");
  });
});

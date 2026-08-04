/**
 * @jest-environment node
 *
 * trello options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockBoardsList = jest.fn();
const mockDecryptToken = jest.fn<string, [string]>();
const mockCardsList = jest.fn();
const mockLabelsList = jest.fn();
const mockListsList = jest.fn();
const mockMembersList = jest.fn();

jest.mock("@/integrations/trello/api/boardsList", () => ({
  __esModule: true,
  boardsList: (...args: unknown[]) => mockBoardsList(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

jest.mock("@/integrations/trello/api/cardsList", () => ({
  __esModule: true,
  cardsList: (...args: unknown[]) => mockCardsList(...args),
}));

jest.mock("@/integrations/trello/api/labelsList", () => ({
  __esModule: true,
  labelsList: (...args: unknown[]) => mockLabelsList(...args),
}));

jest.mock("@/integrations/trello/api/listsList", () => ({
  __esModule: true,
  listsList: (...args: unknown[]) => mockListsList(...args),
}));

jest.mock("@/integrations/trello/api/membersList", () => ({
  __esModule: true,
  membersList: (...args: unknown[]) => mockMembersList(...args),
}));

import { trelloBoardsResolver } from "@/integrations/trello/options/boards";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { trelloCardsResolver, CARDS_PAGE_LIMIT } from "@/integrations/trello/options/cards";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import { trelloLabelsResolver } from "@/integrations/trello/options/labels";
import { trelloListsResolver } from "@/integrations/trello/options/lists";
import { trelloMembersResolver } from "@/integrations/trello/options/members";

// ---------------------------------------------------------------------------
// Merged from the former boards.test.ts
// Tests for `integrations/trello/options/boards.ts` — Slice
// 4.TRELLO-META-2. Account-scoped root picker (no deps). Decrypt-direct
// auth (Trello non-refreshable). value = opaque board id; closed →
// "Archived" description; sorted alphabetically by label.
// ---------------------------------------------------------------------------
describe("boards (options)", () => {

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
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockBoardsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-trello-token");
});

describe("trelloBoardsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration / no deps", () => {
    expect(trelloBoardsResolver.source).toBe("trello:boards");
    expect(trelloBoardsResolver.provider).toBe("trello");
    expect(trelloBoardsResolver.requiresIntegration).toBe(true);
    expect(trelloBoardsResolver.requiredDeps).toBeUndefined();
  });
});

describe("trelloBoardsResolver — wrapper invocation (decrypt-direct)", () => {
  it("decrypts the token from the integration row exactly once", async () => {
    mockBoardsList.mockResolvedValueOnce([]);
    await trelloBoardsResolver.resolve(ctx());
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:trello-cipher");
  });

  it("calls boardsList with the decrypted token (no refreshAndRetry)", async () => {
    mockBoardsList.mockResolvedValueOnce([]);
    await trelloBoardsResolver.resolve(ctx());
    expect(mockBoardsList).toHaveBeenCalledTimes(1);
    expect(mockBoardsList).toHaveBeenCalledWith({
      accessToken: "decrypted-trello-token",
    });
  });
});

describe("trelloBoardsResolver — mapping (value = board id)", () => {
  it("maps id → value, name → label, sorts alphabetically, marks closed boards", async () => {
    mockBoardsList.mockResolvedValueOnce([
      { id: "b2", name: "Zebra", closed: false },
      { id: "b1", name: "Alpha", closed: true },
    ]);
    const result = await trelloBoardsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "b1", label: "Alpha", description: "Archived" },
      { value: "b2", label: "Zebra" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id as label when name is missing", async () => {
    mockBoardsList.mockResolvedValueOnce([{ id: "b9", name: "" }]);
    const result = await trelloBoardsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "b9", label: "b9" }]);
  });

  it("drops boards with empty/missing id", async () => {
    mockBoardsList.mockResolvedValueOnce([
      { id: "", name: "Ghost" },
      { id: "bKeep", name: "Keep" },
    ]);
    const result = await trelloBoardsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["bKeep"]);
  });
});

describe("trelloBoardsResolver — q filtering", () => {
  it("filters case-insensitively on the label", async () => {
    mockBoardsList.mockResolvedValueOnce([
      { id: "b1", name: "Marketing" },
      { id: "b2", name: "Engineering" },
    ]);
    const result = await trelloBoardsResolver.resolve(ctx({ q: "eng" }));
    expect(result.items.map((i) => i.value)).toEqual(["b2"]);
  });

  it("returns empty when q matches nothing", async () => {
    mockBoardsList.mockResolvedValueOnce([{ id: "b1", name: "Marketing" }]);
    const result = await trelloBoardsResolver.resolve(ctx({ q: "zzz" }));
    expect(result.items).toEqual([]);
  });
});

describe("trelloBoardsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no decrypt / API call", async () => {
    await expect(
      trelloBoardsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockDecryptToken).not.toHaveBeenCalled();
    expect(mockBoardsList).not.toHaveBeenCalled();
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockBoardsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(trelloBoardsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
    mockBoardsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "trello",
        providerAccountId: "trelloMemberId",
        reason: "refresh_not_supported",
      }),
    );
    await expect(trelloBoardsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockBoardsList.mockRejectedValueOnce(
      new Error('Trello GET failed: {"raw":"board-secret-leak"} key=abc token=xyz'),
    );
    let thrown: unknown;
    try {
      await trelloBoardsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (thrown as Error).message;
    expect(msg).not.toContain("board-secret-leak");
    expect(msg).not.toContain("token=xyz");
    expect(msg).not.toContain("decrypted-trello-token");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former cards.test.ts
// Tests for `integrations/trello/options/cards.ts` — Slice
// 4.TRELLO-META-2. Depends on `boardId`; bounded page; value = card id;
// NO card description / comment content surfaced.
// ---------------------------------------------------------------------------
describe("cards (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former labels.test.ts
// Tests for `integrations/trello/options/labels.ts` — Slice
// 4.TRELLO-META-2. Depends on `boardId`; value = label id; label =
// name or color fallback; q matches name OR color.
// ---------------------------------------------------------------------------
describe("labels (options)", () => {

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
  mockLabelsList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-trello-token");
});

describe("trelloLabelsResolver — shape", () => {
  it("declares requiredDeps=['boardId'] and requires an integration", () => {
    expect(trelloLabelsResolver.source).toBe("trello:labels");
    expect(trelloLabelsResolver.provider).toBe("trello");
    expect(trelloLabelsResolver.requiresIntegration).toBe(true);
    expect(trelloLabelsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("trelloLabelsResolver — wrapper invocation", () => {
  it("calls labelsList with the decrypted token + boardId", async () => {
    mockLabelsList.mockResolvedValueOnce([]);
    await trelloLabelsResolver.resolve(ctx());
    expect(mockLabelsList).toHaveBeenCalledWith({
      accessToken: "decrypted-trello-token",
      boardId: "b1",
    });
  });
});

describe("trelloLabelsResolver — mapping (value = label id, color fallback)", () => {
  it("uses name as label + color as description", async () => {
    mockLabelsList.mockResolvedValueOnce([
      { id: "lab1", name: "Bug", color: "red" },
    ]);
    const result = await trelloLabelsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "lab1", label: "Bug", description: "red" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to color as label when name empty, then id when neither", async () => {
    mockLabelsList.mockResolvedValueOnce([
      { id: "lab2", name: "", color: "green" },
      { id: "lab3", name: "", color: null },
    ]);
    const result = await trelloLabelsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "lab2", label: "green", description: "green" },
      { value: "lab3", label: "lab3" },
    ]);
  });

  it("drops labels with empty/missing id", async () => {
    mockLabelsList.mockResolvedValueOnce([
      { id: "", name: "Ghost", color: "red" },
      { id: "labKeep", name: "Keep", color: "blue" },
    ]);
    const result = await trelloLabelsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["labKeep"]);
  });
});

describe("trelloLabelsResolver — q filtering (name OR color)", () => {
  it("matches on the label name", async () => {
    mockLabelsList.mockResolvedValueOnce([
      { id: "lab1", name: "Bug", color: "red" },
      { id: "lab2", name: "Feature", color: "green" },
    ]);
    const result = await trelloLabelsResolver.resolve(ctx({ q: "feat" }));
    expect(result.items.map((i) => i.value)).toEqual(["lab2"]);
  });

  it("matches on the color (carried in description)", async () => {
    mockLabelsList.mockResolvedValueOnce([
      { id: "lab1", name: "Bug", color: "red" },
      { id: "lab2", name: "Feature", color: "green" },
    ]);
    const result = await trelloLabelsResolver.resolve(ctx({ q: "green" }));
    expect(result.items.map((i) => i.value)).toEqual(["lab2"]);
  });
});

describe("trelloLabelsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when boardId empty, no API call", async () => {
    await expect(
      trelloLabelsResolver.resolve(ctx({ deps: { boardId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockLabelsList).not.toHaveBeenCalled();
  });

  it("returns empty items when parent board is gone", async () => {
    mockLabelsList.mockRejectedValueOnce(
      new TrelloNotFoundError("board bGONE labels"),
    );
    const result = await trelloLabelsResolver.resolve(
      ctx({ deps: { boardId: "bGONE" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("trelloLabelsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      trelloLabelsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockLabelsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockLabelsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(trelloLabelsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockLabelsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "trello",
        providerAccountId: "trelloMemberId",
        reason: "refresh_not_supported",
      }),
    );
    await expect(trelloLabelsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockLabelsList.mockRejectedValueOnce(
      new Error('Trello failed: {"raw":"label-secret-leak"} token=xyz'),
    );
    let thrown: unknown;
    try {
      await trelloLabelsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((thrown as Error).message).not.toContain("label-secret-leak");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former lists.test.ts
// Tests for `integrations/trello/options/lists.ts` — Slice
// 4.TRELLO-META-2. Depends on `boardId`; value = list id; preserves
// Trello column order; deleted/no-access board → empty items.
// ---------------------------------------------------------------------------
describe("lists (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former members.test.ts
// Tests for `integrations/trello/options/members.ts` — Slice
// 4.TRELLO-META-2. Depends on `boardId`; value = member id; label =
// fullName→username; q matches label OR username; email never surfaced.
// ---------------------------------------------------------------------------
describe("members (options)", () => {

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
  mockMembersList.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-trello-token");
});

describe("trelloMembersResolver — shape", () => {
  it("declares requiredDeps=['boardId'] and requires an integration", () => {
    expect(trelloMembersResolver.source).toBe("trello:members");
    expect(trelloMembersResolver.provider).toBe("trello");
    expect(trelloMembersResolver.requiresIntegration).toBe(true);
    expect(trelloMembersResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("trelloMembersResolver — wrapper invocation", () => {
  it("calls membersList with the decrypted token + boardId", async () => {
    mockMembersList.mockResolvedValueOnce([]);
    await trelloMembersResolver.resolve(ctx());
    expect(mockMembersList).toHaveBeenCalledWith({
      accessToken: "decrypted-trello-token",
      boardId: "b1",
    });
  });
});

describe("trelloMembersResolver — mapping (value = member id, no email)", () => {
  it("uses fullName as label + username as description", async () => {
    mockMembersList.mockResolvedValueOnce([
      { id: "m1", fullName: "Ada Lovelace", username: "ada" },
    ]);
    const result = await trelloMembersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "m1", label: "Ada Lovelace", description: "ada" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to username as label when no fullName, then id when neither", async () => {
    mockMembersList.mockResolvedValueOnce([
      { id: "m2", fullName: "", username: "grace" },
      { id: "m3", fullName: null, username: "" },
    ]);
    const result = await trelloMembersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "m2", label: "grace" },
      { value: "m3", label: "m3" },
    ]);
  });

  it("never surfaces a member email even if present in the payload", async () => {
    mockMembersList.mockResolvedValueOnce([
      {
        id: "m1",
        fullName: "Ada",
        username: "ada",
        email: "ada@secret.example.com",
      },
    ]);
    const result = await trelloMembersResolver.resolve(ctx());
    expect(JSON.stringify(result.items)).not.toContain("secret.example.com");
  });

  it("drops members with empty/missing id", async () => {
    mockMembersList.mockResolvedValueOnce([
      { id: "", fullName: "Ghost", username: "ghost" },
      { id: "mKeep", fullName: "Keep", username: "keep" },
    ]);
    const result = await trelloMembersResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["mKeep"]);
  });
});

describe("trelloMembersResolver — q filtering (label OR username)", () => {
  it("matches on full name", async () => {
    mockMembersList.mockResolvedValueOnce([
      { id: "m1", fullName: "Ada Lovelace", username: "ada" },
      { id: "m2", fullName: "Grace Hopper", username: "grace" },
    ]);
    const result = await trelloMembersResolver.resolve(ctx({ q: "hopper" }));
    expect(result.items.map((i) => i.value)).toEqual(["m2"]);
  });

  it("matches on username (carried in description)", async () => {
    mockMembersList.mockResolvedValueOnce([
      { id: "m1", fullName: "Ada Lovelace", username: "ada" },
      { id: "m2", fullName: "Grace Hopper", username: "grace" },
    ]);
    const result = await trelloMembersResolver.resolve(ctx({ q: "grace" }));
    expect(result.items.map((i) => i.value)).toEqual(["m2"]);
  });
});

describe("trelloMembersResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when boardId empty, no API call", async () => {
    await expect(
      trelloMembersResolver.resolve(ctx({ deps: { boardId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockMembersList).not.toHaveBeenCalled();
  });

  it("returns empty items when parent board is gone", async () => {
    mockMembersList.mockRejectedValueOnce(
      new TrelloNotFoundError("board bGONE members"),
    );
    const result = await trelloMembersResolver.resolve(
      ctx({ deps: { boardId: "bGONE" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("trelloMembersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      trelloMembersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockMembersList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockMembersList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(trelloMembersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockMembersList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "trello",
        providerAccountId: "trelloMemberId",
        reason: "refresh_not_supported",
      }),
    );
    await expect(trelloMembersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockMembersList.mockRejectedValueOnce(
      new Error('Trello failed: {"raw":"member-secret-leak"} token=xyz'),
    );
    let thrown: unknown;
    try {
      await trelloMembersResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((thrown as Error).message).not.toContain("member-secret-leak");
  });
});

});

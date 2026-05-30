/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/options/boards.ts` — Slice
 * 4.TRELLO-META-2. Account-scoped root picker (no deps). Decrypt-direct
 * auth (Trello non-refreshable). value = opaque board id; closed →
 * "Archived" description; sorted alphabetically by label.
 */

const mockBoardsList = jest.fn();
jest.mock("@/integrations/trello/api/boardsList", () => ({
  __esModule: true,
  boardsList: (...args: unknown[]) => mockBoardsList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { trelloBoardsResolver } from "@/integrations/trello/options/boards";
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

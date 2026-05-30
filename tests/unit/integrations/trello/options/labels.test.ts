/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/options/labels.ts` — Slice
 * 4.TRELLO-META-2. Depends on `boardId`; value = label id; label =
 * name or color fallback; q matches name OR color.
 */

const mockLabelsList = jest.fn();
jest.mock("@/integrations/trello/api/labelsList", () => ({
  __esModule: true,
  labelsList: (...args: unknown[]) => mockLabelsList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { trelloLabelsResolver } from "@/integrations/trello/options/labels";
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

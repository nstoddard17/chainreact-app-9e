/**
 * @jest-environment node
 *
 * Tests for `integrations/trello/options/members.ts` — Slice
 * 4.TRELLO-META-2. Depends on `boardId`; value = member id; label =
 * fullName→username; q matches label OR username; email never surfaced.
 */

const mockMembersList = jest.fn();
jest.mock("@/integrations/trello/api/membersList", () => ({
  __esModule: true,
  membersList: (...args: unknown[]) => mockMembersList(...args),
}));

const mockDecryptToken = jest.fn<string, [string]>();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (encoded: string) => mockDecryptToken(encoded),
}));

import { trelloMembersResolver } from "@/integrations/trello/options/members";
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
  userId: "user-1",
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
        userId: "user-1",
        provider: "trello",
        accountId: "trelloMemberId",
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

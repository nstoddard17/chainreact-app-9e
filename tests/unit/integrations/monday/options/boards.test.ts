/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/boards.ts` — Slice 3.MONDAY-3.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mondayBoardsResolver } from "@/integrations/monday/options/boards";
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
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice (Monday)",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["me:read", "boards:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayBoardsResolver — shape", () => {
  it("declares source / provider / no deps", () => {
    expect(mondayBoardsResolver.source).toBe("monday:boards");
    expect(mondayBoardsResolver.provider).toBe("monday");
    expect(mondayBoardsResolver.requiresIntegration).toBe(true);
    expect(mondayBoardsResolver.requiredDeps).toBeUndefined();
  });
});

describe("mondayBoardsResolver — wrapper invocation", () => {
  it("pins refreshAndRetry provider='monday' + accountId from integration", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ boards: [] });
    await mondayBoardsResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0];
    expect(args.provider).toBe("monday");
    expect(args.accountId).toBe("alice@example.com");
  });

  it("returns empty items when no boards", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ boards: [] });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("mondayBoardsResolver — mapping", () => {
  it("maps id → value, name → label, board_kind+updated_at → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        {
          id: "b-1",
          name: "Marketing",
          description: null,
          board_kind: "public",
          state: "active",
          updated_at: "2026-05-24T12:00:00Z",
          creator: null,
        },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "b-1",
        label: "Marketing",
        description: "public — updated 2026-05-24",
      },
    ]);
  });

  it("falls back to id when name is empty/missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        {
          id: "b-2",
          name: null,
          description: null,
          board_kind: null,
          state: null,
          updated_at: null,
          creator: null,
        },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("b-2");
    expect((result.items[0] as { description?: string }).description).toBeUndefined();
  });

  it("drops boards with missing/empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        { id: "", name: "ignored" },
        { id: "b-keep", name: "kept" },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.value).toBe("b-keep");
  });

  it("sorts items alphabetically by label (case-insensitive)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        { id: "1", name: "zebra" },
        { id: "2", name: "Apple" },
        { id: "3", name: "mango" },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["Apple", "mango", "zebra"]);
  });
});

describe("mondayBoardsResolver — q filter", () => {
  it("applies case-insensitive substring filter on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        { id: "1", name: "Marketing" },
        { id: "2", name: "Sales" },
        { id: "3", name: "Marketing 2026" },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx({ q: "mark" }));
    expect(result.items.map((i) => i.value)).toEqual(["1", "3"]);
  });
});

describe("mondayBoardsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on IntegrationActionRequiredError", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "monday",
        accountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayBoardsResolver.resolve(ctx())).rejects.toMatchObject({
      name: "OptionsResolverError",
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on Unauthorized401Error (defense in depth)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayBoardsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message on generic provider error", async () => {
    const secretToken = "BEARER-secret-leak-1234";
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(`Monday returned 500 with token ${secretToken} in body`),
    );
    let caught: unknown;
    try {
      await mondayBoardsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(secretToken);
    expect((caught as OptionsResolverError).message).toBe(
      "Couldn't load Monday boards. Try again.",
    );
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null (defense in depth)", async () => {
    await expect(
      mondayBoardsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

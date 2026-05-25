/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/items.ts` — Slice 3.MONDAY-3.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mondayItemsResolver } from "@/integrations/monday/options/items";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
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
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["boards:read"],
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
    deps: { boardId: "b-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayItemsResolver — shape", () => {
  it("declares requiredDeps=['boardId']", () => {
    expect(mondayItemsResolver.source).toBe("monday:items");
    expect(mondayItemsResolver.provider).toBe("monday");
    expect(mondayItemsResolver.requiresIntegration).toBe(true);
    expect(mondayItemsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayItemsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing", async () => {
    await expect(
      mondayItemsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("mondayItemsResolver — mapping + pagination", () => {
  it("maps id → value, name → label; preserves API order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "i-1", name: "Z task" },
        { id: "i-2", name: "A task" },
      ],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["i-1", "i-2"]);
  });

  it("hasMore=true when cursor present", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [{ id: "i-1", name: "x" }],
      cursor: "next-page",
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("hasMore=false when cursor null", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id when name null/empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [{ id: "i-x", name: null }],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("i-x");
  });
});

describe("mondayItemsResolver — cascade fallback", () => {
  it("boardFound=false → empty items", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [],
      cursor: null,
      boardFound: false,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("NotFoundError → empty items", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("mondayItemsResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "1", name: "Bug fix" },
        { id: "2", name: "Feature request" },
        { id: "3", name: "Bug investigation" },
      ],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx({ q: "bug" }));
    expect(result.items.map((i) => i.value).sort()).toEqual(["1", "3"]);
  });
});

describe("mondayItemsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayItemsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR sanitized", async () => {
    const leak = "secret-RT";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`err ${leak}`));
    let caught: unknown;
    try {
      await mondayItemsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

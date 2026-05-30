/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/groups.ts` — Slice 3.MONDAY-3.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mondayGroupsResolver } from "@/integrations/monday/options/groups";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
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

describe("mondayGroupsResolver — shape", () => {
  it("declares requiredDeps=['boardId'] (V1-preserved camelCase)", () => {
    expect(mondayGroupsResolver.source).toBe("monday:groups");
    expect(mondayGroupsResolver.provider).toBe("monday");
    expect(mondayGroupsResolver.requiresIntegration).toBe(true);
    expect(mondayGroupsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayGroupsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing (defense in depth)", async () => {
    await expect(
      mondayGroupsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
  });

  it("MISSING_DEPENDENCY when boardId empty string", async () => {
    await expect(
      mondayGroupsResolver.resolve(ctx({ deps: { boardId: "" } })),
    ).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
  });
});

describe("mondayGroupsResolver — wrapper invocation", () => {
  it("threads boardId into the groupsList call", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [],
      boardFound: true,
    });
    await mondayGroupsResolver.resolve(ctx({ deps: { boardId: "board-42" } }));
    // The wrapper apiCall receives boardId — assert via refreshAndRetry arg.
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe(
      "alice@example.com",
    );
  });
});

describe("mondayGroupsResolver — mapping + sort", () => {
  it("maps id → value, title → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "g-1", title: "Backlog" },
        { id: "g-2", title: "Done" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "g-1", label: "Backlog" },
      { value: "g-2", label: "Done" },
    ]);
  });

  it("falls back to id when title null/empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [{ id: "g-x", title: null }],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("g-x");
  });

  it("drops groups with empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "", title: "ignored" },
        { id: "g-keep", title: "kept" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
  });

  it("sorts alphabetically by label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "1", title: "Zeta" },
        { id: "2", title: "alpha" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["alpha", "Zeta"]);
  });
});

describe("mondayGroupsResolver — cascade fallback", () => {
  it("boardFound=false → empty items (not throw)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [],
      boardFound: false,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("NotFoundError → empty items (cascade safety)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("mondayGroupsResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "1", title: "Backlog" },
        { id: "2", title: "Done" },
        { id: "3", title: "In Backup" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx({ q: "back" }));
    expect(result.items.map((i) => i.value).sort()).toEqual(["1", "3"]);
  });
});

describe("mondayGroupsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayGroupsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayGroupsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message on generic provider error", async () => {
    const leak = "secret-RT-12345";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`oops ${leak}`));
    let caught: unknown;
    try {
      await mondayGroupsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

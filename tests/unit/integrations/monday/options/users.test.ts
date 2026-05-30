/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/users.ts` — Slice 3.MONDAY-3.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mondayUsersResolver } from "@/integrations/monday/options/users";
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
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["users:read"],
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

describe("mondayUsersResolver — shape", () => {
  it("declares no deps; account-scoped", () => {
    expect(mondayUsersResolver.source).toBe("monday:users");
    expect(mondayUsersResolver.provider).toBe("monday");
    expect(mondayUsersResolver.requiresIntegration).toBe(true);
    expect(mondayUsersResolver.requiredDeps).toBeUndefined();
  });
});

describe("mondayUsersResolver — wrapper invocation", () => {
  it("pins refreshAndRetry provider='monday' + accountId from integration", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ users: [] });
    await mondayUsersResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0];
    expect(args.provider).toBe("monday");
    expect(args.accountId).toBe("alice@example.com");
  });

  it("returns empty items when no users", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ users: [] });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("mondayUsersResolver — mapping + sort", () => {
  it("maps id → value, name → label, email → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "u-1",
          name: "Alice",
          email: "alice@x.com",
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items[0]).toEqual({
      value: "u-1",
      label: "Alice",
      description: "alice@x.com",
    });
  });

  it("label falls back to email when name missing; description omitted when email missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "u-2",
          name: null,
          email: "bob@x.com",
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "u-3",
          name: null,
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    // Sorted alphabetically — bob@x.com comes before u-3.
    const byValue = Object.fromEntries(
      result.items.map((i) => [i.value, i]),
    );
    expect(byValue["u-2"]!.label).toBe("bob@x.com");
    expect(byValue["u-2"]!.description).toBe("bob@x.com");
    expect(byValue["u-3"]!.label).toBe("u-3");
    expect(
      (byValue["u-3"] as { description?: string }).description,
    ).toBeUndefined();
  });

  it("drops users with empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "",
          name: "ignored",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "u-keep",
          name: "Kept",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
  });

  it("sorts items alphabetically by label (case-insensitive)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "1",
          name: "zebra",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "2",
          name: "Apple",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["Apple", "zebra"]);
  });
});

describe("mondayUsersResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "1",
          name: "Alice Smith",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "2",
          name: "Bob Jones",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx({ q: "alice" }));
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
  });
});

describe("mondayUsersResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayUsersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayUsersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR sanitized", async () => {
    const leak = "BEARER-xyz";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`oops ${leak}`));
    let caught: unknown;
    try {
      await mondayUsersResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mondayUsersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

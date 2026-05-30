/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/columns.ts` — Slice 3.MONDAY-3.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mondayColumnsResolver } from "@/integrations/monday/options/columns";
import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
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

describe("mondayColumnsResolver — shape", () => {
  it("declares requiredDeps=['boardId']", () => {
    expect(mondayColumnsResolver.source).toBe("monday:columns");
    expect(mondayColumnsResolver.provider).toBe("monday");
    expect(mondayColumnsResolver.requiresIntegration).toBe(true);
    expect(mondayColumnsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayColumnsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing", async () => {
    await expect(
      mondayColumnsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("mondayColumnsResolver — mapping", () => {
  it("maps id → value, title → label, type → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "status", title: "Status", type: "status" },
        { id: "text", title: "Notes", type: "text" },
        { id: "person", title: "Owner", type: "person" },
      ],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "status", label: "Status", description: "status" },
      { value: "text", label: "Notes", description: "text" },
      { value: "person", label: "Owner", description: "person" },
    ]);
  });

  it("falls back to id when title empty; omits description when type missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [{ id: "name", title: null, type: null }],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items[0]).toEqual({ value: "name", label: "name" });
  });

  it("preserves API-returned column order (no alphabetical re-sort)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "name", title: "Name", type: "name" },
        { id: "z_status", title: "Status", type: "status" },
        { id: "a_due", title: "Due", type: "date" },
      ],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "name",
      "z_status",
      "a_due",
    ]);
  });
});

describe("mondayColumnsResolver — cascade fallback", () => {
  it("boardFound=false → empty items", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [],
      boardFound: false,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("NotFoundError → empty items", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("mondayColumnsResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "status", title: "Status", type: "status" },
        { id: "owner", title: "Owner", type: "person" },
      ],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx({ q: "stat" }));
    expect(result.items.map((i) => i.value)).toEqual(["status"]);
  });
});

describe("mondayColumnsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayColumnsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message", async () => {
    const leak = "leaked-token-abc";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`gql failure ${leak}`));
    let caught: unknown;
    try {
      await mondayColumnsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

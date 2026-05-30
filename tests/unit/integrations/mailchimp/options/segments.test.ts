/**
 * @jest-environment node
 *
 * Tests for `integrations/mailchimp/options/segments.ts` — Slice 3.MAILCHIMP-2.
 *
 * Pin:
 *   - Shape: requiredDeps=["listId"], requiresIntegration=true.
 *   - Wrapper invocation via segmentsList with audienceId=ctx.deps.listId.
 *   - Mapping (id.toString() → value, name → label, type + member_count
 *     → description).
 *   - Numeric id stringified.
 *   - MISSING_DEPENDENCY when ctx.deps.listId empty / missing.
 *   - NotFoundError (parent audience gone) → empty items (NOT throw).
 *   - Missing dc → INTEGRATION_DISCONNECTED.
 *   - Error sanitization.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mailchimpSegmentsResolver } from "@/integrations/mailchimp/options/segments";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "mailchimp",
  providerAccountId: "mc-account-9001",
  displayName: "Acme (Mailchimp)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["account_access"],
  accountMetadata: { dc: "us21" },
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
    deps: { listId: "abc-list-id" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mailchimpSegmentsResolver — shape", () => {
  it("declares requiredDeps=['listId'] and requires an integration", () => {
    expect(mailchimpSegmentsResolver.source).toBe("mailchimp:segments");
    expect(mailchimpSegmentsResolver.provider).toBe("mailchimp");
    expect(mailchimpSegmentsResolver.requiresIntegration).toBe(true);
    expect(mailchimpSegmentsResolver.requiredDeps).toEqual(["listId"]);
  });
});

describe("mailchimpSegmentsResolver — wrapper invocation", () => {
  it("threads dc + audienceId=listId into the segmentsList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ segments: [], total_items: 0 }),
          { status: 200 },
        ),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await mailchimpSegmentsResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "https://us21.api.mailchimp.com/3.0/lists/abc-list-id/segments",
    );
    expect(new URL(url).searchParams.get("count")).toBe("100");
    fetchSpy.mockRestore();
  });
});

describe("mailchimpSegmentsResolver — mapping", () => {
  it("maps numeric id → string value, name → label, type+member_count → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [
        { id: 11, name: "VIPs", type: "saved", member_count: 42 },
        { id: 22, name: "Recent signups", type: "static", member_count: 1 },
      ],
      totalItems: 2,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "11", label: "VIPs", description: "saved · 42 members" },
      {
        value: "22",
        label: "Recent signups",
        description: "static · 1 member",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when type + member_count both missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [{ id: 7, name: "Bare" }],
      totalItems: 1,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "7", label: "Bare" }]);
  });

  it("falls back to stringified id when name missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [{ id: 99 }],
      totalItems: 1,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "99", label: "99" }]);
  });

  it("drops segments with non-numeric / missing id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [
        { id: "not-a-number", name: "Bad" },
        { name: "No id" },
        { id: 11, name: "Good" },
      ],
      totalItems: 3,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["11"]);
  });

  it("returns empty items when segments is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [],
      totalItems: 0,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [
        { id: 1, name: "Engaged users" },
        { id: 2, name: "Inactive users" },
        { id: 3, name: "VIP list" },
      ],
      totalItems: 3,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx({ q: "USERS" }));
    expect(result.items.map((i) => i.value)).toEqual(["1", "2"]);
  });

  it("hasMore=true when totalItems exceeds segments.length", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      segments: [{ id: 1, name: "One" }],
      totalItems: 250,
    });
    const result = await mailchimpSegmentsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("mailchimpSegmentsResolver — dependency + cascade-fallback handling", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.listId is empty", async () => {
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ deps: { listId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.listId is missing", async () => {
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent audience id no longer exists (404 → NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("segments (audience ghost)", "audience not found"),
    );
    const result = await mailchimpSegmentsResolver.resolve(
      ctx({ deps: { listId: "ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("mailchimpSegmentsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when accountMetadata.dc is missing", async () => {
    const noDc: IntegrationRecord = {
      ...integration,
      accountMetadata: {},
    };
    await expect(
      mailchimpSegmentsResolver.resolve(ctx({ integration: noDc })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "mailchimp",
        providerAccountId: "mc-account-9001",
        reason: "refresh_not_supported",
      }),
    );
    await expect(
      mailchimpSegmentsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      mailchimpSegmentsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('Mailchimp GET failed: {"raw":"segments-secret-leak"}'),
    );
    try {
      await mailchimpSegmentsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("segments-secret-leak");
    }
  });
});

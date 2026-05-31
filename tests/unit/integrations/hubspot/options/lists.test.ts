/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/lists.ts` — Slice 3.HUBSPOT-2 (stretch).
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration / no requiredDeps).
 *   - Wrapper invocation via searchLists.
 *   - List mapping (value=listId, label=name-or-listId, description=processingType).
 *   - Archived lists dropped.
 *   - Lists without listId dropped.
 *   - hasMore propagates from API.
 *   - Case-insensitive q filter on label.
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

import { hubspotListsResolver } from "@/integrations/hubspot/options/lists";
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
  provider: "hubspot",
  providerAccountId: "1234567",
  displayName: "Acme",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["crm.lists.read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("hubspotListsResolver", () => {
  it("declares shape", () => {
    expect(hubspotListsResolver.source).toBe("hubspot:lists");
    expect(hubspotListsResolver.provider).toBe("hubspot");
    expect(hubspotListsResolver.requiresIntegration).toBe(true);
    expect(hubspotListsResolver.requiredDeps).toBeUndefined();
  });

  it("invokes refreshAndRetry with provider='hubspot'", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ lists: [] });
    await hubspotListsResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.providerAccountId).toBe(null);
  });

  it("maps lists with processingType as description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [
        { listId: "1", name: "VIP Customers", processingType: "MANUAL" },
        {
          listId: "2",
          name: "Lapsed Trials (auto)",
          processingType: "DYNAMIC",
        },
      ],
    });
    const result = await hubspotListsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "1", label: "VIP Customers", description: "MANUAL" },
      {
        value: "2",
        label: "Lapsed Trials (auto)",
        description: "DYNAMIC",
      },
    ]);
  });

  it("omits description when processingType missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ listId: "1", name: "VIP Customers", processingType: null }],
    });
    const result = await hubspotListsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "1", label: "VIP Customers" }]);
  });

  it("falls back to listId when name missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ listId: "42", name: null, processingType: "MANUAL" }],
    });
    expect((await hubspotListsResolver.resolve(ctx())).items).toEqual([
      { value: "42", label: "42", description: "MANUAL" },
    ]);
  });

  it("drops archived lists", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [
        { listId: "1", name: "Active", processingType: "MANUAL" },
        { listId: "2", name: "Old", archived: true, processingType: "MANUAL" },
      ],
    });
    expect(
      (await hubspotListsResolver.resolve(ctx())).items.map((i) => i.value),
    ).toEqual(["1"]);
  });

  it("drops lists missing listId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [{ listId: "", name: "Empty id" }],
    });
    expect((await hubspotListsResolver.resolve(ctx())).items).toEqual([]);
  });

  it("propagates hasMore from API", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [],
      hasMore: true,
    });
    expect((await hubspotListsResolver.resolve(ctx())).hasMore).toBe(true);
  });

  it("case-insensitive q filter on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      lists: [
        { listId: "1", name: "VIP Customers" },
        { listId: "2", name: "Lapsed Trials" },
      ],
    });
    const result = await hubspotListsResolver.resolve(ctx({ q: "LAPSED" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });

  it("IntegrationActionRequired → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "hubspot",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(hubspotListsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(hubspotListsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot POST failed: {"raw":"lists-secret-leak"}'),
    );
    try {
      await hubspotListsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as Error).message).not.toContain("lists-secret-leak");
    }
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      hubspotListsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

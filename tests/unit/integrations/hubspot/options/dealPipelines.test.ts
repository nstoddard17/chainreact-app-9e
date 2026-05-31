/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/dealPipelines.ts` — Slice 3.HUBSPOT-2.
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration / no requiredDeps).
 *   - Wrapper invocation (refreshAndRetry → pipelinesList with objectType="deals").
 *   - Pipeline mapping (value=id, label=label-or-id, archived dropped).
 *   - hasMore is always false (unpaginated endpoint).
 *   - Case-insensitive q filter on label.
 *   - Error sanitization (Unauthorized + IntegrationActionRequired →
 *     INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR).
 *   - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { hubspotDealPipelinesResolver } from "@/integrations/hubspot/options/dealPipelines";
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
  displayName: "Acme (HubSpot)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["crm.schemas.deals.read"],
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

describe("hubspotDealPipelinesResolver", () => {
  it("declares shape", () => {
    expect(hubspotDealPipelinesResolver.source).toBe("hubspot:deal_pipelines");
    expect(hubspotDealPipelinesResolver.provider).toBe("hubspot");
    expect(hubspotDealPipelinesResolver.requiresIntegration).toBe(true);
    expect(hubspotDealPipelinesResolver.requiredDeps).toBeUndefined();
  });

  it("calls refreshAndRetry with provider='hubspot' / accountId=null", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ results: [] });
    await hubspotDealPipelinesResolver.resolve(ctx());
    const call = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("hubspot");
    expect(call.providerAccountId).toBe(null);
  });

  it("maps pipelines to {value, label}, preserving HubSpot order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "default", label: "Sales Pipeline", displayOrder: 0 },
        { id: "enterprise", label: "Enterprise Pipeline", displayOrder: 1 },
      ],
    });
    const result = await hubspotDealPipelinesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "default", label: "Sales Pipeline" },
      { value: "enterprise", label: "Enterprise Pipeline" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("drops archived pipelines", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "active", label: "Active" },
        { id: "stale", label: "Stale", archived: true },
      ],
    });
    expect(
      (await hubspotDealPipelinesResolver.resolve(ctx())).items.map((i) => i.value),
    ).toEqual(["active"]);
  });

  it("falls back to id when label is missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "weird", label: null }],
    });
    expect((await hubspotDealPipelinesResolver.resolve(ctx())).items).toEqual([
      { value: "weird", label: "weird" },
    ]);
  });

  it("returns empty items on empty response", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ results: [] });
    expect((await hubspotDealPipelinesResolver.resolve(ctx())).items).toEqual([]);
  });

  it("case-insensitive q filter on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "default", label: "Sales Pipeline" },
        { id: "ent", label: "Enterprise" },
      ],
    });
    const result = await hubspotDealPipelinesResolver.resolve(ctx({ q: "SALES" }));
    expect(result.items.map((i) => i.value)).toEqual(["default"]);
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "hubspot",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      hubspotDealPipelinesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotDealPipelinesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET /crm/v3/pipelines/deals failed: {"raw":"secret-leak"}'),
    );
    try {
      await hubspotDealPipelinesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("secret-leak");
    }
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      hubspotDealPipelinesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

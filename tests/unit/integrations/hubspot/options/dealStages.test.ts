/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/dealStages.ts` — Slice 3.HUBSPOT-2.
 *
 * Pin:
 *   - Shape: requiredDeps=["pipeline"].
 *   - Wrapper invocation via pipelinesList with objectType="deals".
 *   - Stage mapping for the selected pipeline only.
 *   - Stage order preserved.
 *   - Archived stages dropped.
 *   - Pipeline-not-found → empty items (NOT a throw).
 *   - MISSING_DEPENDENCY when ctx.deps.pipeline empty.
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

import { hubspotDealStagesResolver } from "@/integrations/hubspot/options/dealStages";
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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { pipeline: "default" },
    ...overrides,
  };
}

const TWO_PIPELINES = {
  results: [
    {
      id: "default",
      label: "Sales Pipeline",
      stages: [
        { id: "appointmentscheduled", label: "Appointment Scheduled", displayOrder: 0 },
        { id: "qualifiedtobuy", label: "Qualified to Buy", displayOrder: 1 },
        { id: "closedwon", label: "Closed Won", displayOrder: 2 },
        { id: "stale-stage", label: "Stale", archived: true },
      ],
    },
    {
      id: "enterprise",
      label: "Enterprise Pipeline",
      stages: [
        { id: "ent-disco", label: "Discovery", displayOrder: 0 },
        { id: "ent-won", label: "Closed Won", displayOrder: 1 },
      ],
    },
  ],
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("hubspotDealStagesResolver — shape", () => {
  it("declares requiredDeps=['pipeline']", () => {
    expect(hubspotDealStagesResolver.source).toBe("hubspot:deal_stages");
    expect(hubspotDealStagesResolver.requiredDeps).toEqual(["pipeline"]);
  });
});

describe("hubspotDealStagesResolver — mapping", () => {
  it("returns stages of the selected pipeline (default) in order, dropping archived", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TWO_PIPELINES);
    const result = await hubspotDealStagesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "appointmentscheduled", label: "Appointment Scheduled" },
      { value: "qualifiedtobuy", label: "Qualified to Buy" },
      { value: "closedwon", label: "Closed Won" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("returns the other pipeline's stages when pipeline=enterprise", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TWO_PIPELINES);
    const result = await hubspotDealStagesResolver.resolve(
      ctx({ deps: { pipeline: "enterprise" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ent-disco", "ent-won"]);
  });

  it("returns empty items when the selected pipeline id does not exist", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TWO_PIPELINES);
    const result = await hubspotDealStagesResolver.resolve(
      ctx({ deps: { pipeline: "ghost-pipeline" } }),
    );
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id when stage label missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "default", stages: [{ id: "weird", label: null }] }],
    });
    const result = await hubspotDealStagesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "weird", label: "weird" }]);
  });

  it("case-insensitive q filter on stage label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TWO_PIPELINES);
    const result = await hubspotDealStagesResolver.resolve(
      ctx({ q: "WON" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["closedwon"]);
  });
});

describe("hubspotDealStagesResolver — error sanitization", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.pipeline is empty", async () => {
    await expect(
      hubspotDealStagesResolver.resolve(ctx({ deps: { pipeline: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.pipeline is missing", async () => {
    await expect(
      hubspotDealStagesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "hubspot",
        accountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      hubspotDealStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotDealStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET failed: {"raw":"deals-secret-leak"}'),
    );
    try {
      await hubspotDealStagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("deals-secret-leak");
    }
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      hubspotDealStagesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

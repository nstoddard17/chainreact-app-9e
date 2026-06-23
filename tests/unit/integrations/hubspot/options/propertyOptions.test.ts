/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/propertyOptions.ts` — the portal-
 * customizable property-enum reader (config-field UX sweep). Only the DEALS
 * `dealtype` instance is wired (covered by the already-granted
 * `crm.schemas.deals.read` scope).
 *
 * Pins:
 *   - Shape (source / provider / requiresIntegration).
 *   - Wrapper invocation (refreshAndRetry → propertyGet for deals/dealtype).
 *   - Mapping: value = INTERNAL option value, label = display label.
 *   - Hidden options dropped; label falls back to value.
 *   - Case-insensitive q filter over label + value.
 *   - Auth errors → INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR (sanitized).
 *   - Null integration → INTEGRATION_DISCONNECTED, no wrapper call.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import {
  hubspotDealTypeOptionsResolver,
  makeHubspotPropertyOptionsResolver,
} from "@/integrations/hubspot/options/propertyOptions";
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
  accessTokenEncrypted: "enc:hubspot-token-cipher",
  refreshTokenEncrypted: "enc:hubspot-refresh-cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["crm.schemas.deals.read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("hubspotDealTypeOptionsResolver — shape", () => {
  it("declares the deals/dealtype source / provider / requiresIntegration", () => {
    expect(hubspotDealTypeOptionsResolver.source).toBe("hubspot:deal_dealtype");
    expect(hubspotDealTypeOptionsResolver.provider).toBe("hubspot");
    expect(hubspotDealTypeOptionsResolver.requiresIntegration).toBe(true);
  });
});

describe("hubspotDealTypeOptionsResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider='hubspot', accountId, and a propertyGet closure", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ name: "dealtype", options: [] });
    await hubspotDealTypeOptionsResolver.resolve(ctx());
    const call = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("hubspot");
    expect(call.providerAccountId).toBe(null);
    expect(typeof call.apiCall).toBe("function");
  });
});

describe("hubspotDealTypeOptionsResolver — mapping", () => {
  it("stores the internal value and displays the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      name: "dealtype",
      options: [
        { label: "New Business", value: "newbusiness" },
        { label: "Existing Business", value: "existingbusiness" },
      ],
    });
    const result = await hubspotDealTypeOptionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "newbusiness", label: "New Business" },
      { value: "existingbusiness", label: "Existing Business" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("drops hidden options and falls back to value when label is blank", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      name: "dealtype",
      options: [
        { label: "", value: "custom_value" },
        { label: "Deprecated", value: "old", hidden: true },
        { label: "Renewal", value: "renewal", description: "Existing-customer renewal" },
      ],
    });
    const result = await hubspotDealTypeOptionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "custom_value", label: "custom_value" },
      { value: "renewal", label: "Renewal", description: "Existing-customer renewal" },
    ]);
  });

  it("case-insensitive q filter matches label or value", async () => {
    mockRefreshAndRetry.mockResolvedValue({
      name: "dealtype",
      options: [
        { label: "New Business", value: "newbusiness" },
        { label: "Renewal", value: "renewal" },
      ],
    });
    expect((await hubspotDealTypeOptionsResolver.resolve(ctx({ q: "renew" }))).items.map((i) => i.value)).toEqual(["renewal"]);
    expect((await hubspotDealTypeOptionsResolver.resolve(ctx({ q: "NEWBUS" }))).items.map((i) => i.value)).toEqual(["newbusiness"]);
  });
});

describe("hubspotDealTypeOptionsResolver — error sanitization", () => {
  it("maps auth errors to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("HubSpot 401"));
    await expect(hubspotDealTypeOptionsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "hubspot",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(hubspotDealTypeOptionsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors to PROVIDER_ERROR with no raw body leak", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET /crm/v3/properties/deals/dealtype failed: {"message":"sekret-leak"}'),
    );
    try {
      await hubspotDealTypeOptionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("sekret-leak");
    }
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no wrapper call)", async () => {
    await expect(
      hubspotDealTypeOptionsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

describe("makeHubspotPropertyOptionsResolver — factory", () => {
  it("closes over object type + property name for a custom source", async () => {
    const resolver = makeHubspotPropertyOptionsResolver({
      source: "hubspot:deal_pipeline_stage",
      objectType: "deals",
      propertyName: "custom_prop",
    });
    expect(resolver.source).toBe("hubspot:deal_pipeline_stage");
    mockRefreshAndRetry.mockResolvedValueOnce({ name: "custom_prop", options: [{ label: "A", value: "a" }] });
    const result = await resolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "a", label: "A" }]);
  });
});

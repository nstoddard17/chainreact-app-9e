/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/propertyNames.ts` — RESOLVERS-1,
 * the six property-NAME resolvers backing the get-family `filterProperty`
 * combobox + per-chip `properties` picker.
 *
 * Mock boundary: `refreshAndRetry` (threads the apiCall with a fake token)
 * + the `propertiesList` wrapper (the provider network boundary).
 *
 * Pins:
 *   - Shape for all six sources (provider / requiresIntegration / no deps).
 *   - Wrapper invocation: GET properties list for the right objectType.
 *   - Mapping: value = INTERNAL name, label = display label (name
 *     fallback), description = internal name only when it differs.
 *   - Hidden properties dropped; property VALUES never read (definitions
 *     only — nothing beyond name/label surfaces).
 *   - Local q filter matches label OR internal name; alpha sort by label;
 *     hasMore always false (single unpaged response).
 *   - Error mapping: null integration / 401 → INTEGRATION_DISCONNECTED;
 *     403 → PROVIDER_REAUTH_REQUIRED; other → PROVIDER_ERROR (sanitized).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockPropertiesList = jest.fn();
jest.mock("@/integrations/_shared/hubspot/api/properties", () => {
  const actual = jest.requireActual(
    "@/integrations/_shared/hubspot/api/properties",
  );
  return {
    ...actual,
    propertiesList: (...args: unknown[]) => mockPropertiesList(...args),
  };
});

import {
  hubspotContactPropertiesResolver,
  hubspotCompanyPropertiesResolver,
  hubspotDealPropertiesResolver,
  hubspotTicketPropertiesResolver,
  hubspotProductPropertiesResolver,
  hubspotLineItemPropertiesResolver,
} from "@/integrations/hubspot/options/propertyNames";
import {
  InsufficientScopeError,
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
  scopes: ["crm.schemas.contacts.read"],
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
  mockPropertiesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (args: { apiCall: (token: string) => Promise<unknown> }) =>
      args.apiCall("token-123"),
  );
});

const ALL = [
  [hubspotContactPropertiesResolver, "hubspot:contact_properties", "contacts"],
  [hubspotCompanyPropertiesResolver, "hubspot:company_properties", "companies"],
  [hubspotDealPropertiesResolver, "hubspot:deal_properties", "deals"],
  [hubspotTicketPropertiesResolver, "hubspot:ticket_properties", "tickets"],
  [hubspotProductPropertiesResolver, "hubspot:product_properties", "products"],
  [
    hubspotLineItemPropertiesResolver,
    "hubspot:line_item_properties",
    "line_items",
  ],
] as const;

describe("hubspot property-name resolvers — shape", () => {
  it.each(ALL.map(([r, source]) => [source, r] as const))(
    "%s: provider hubspot, requiresIntegration, no requiredDeps",
    (source, resolver) => {
      expect(resolver.source).toBe(source);
      expect(resolver.provider).toBe("hubspot");
      expect(resolver.requiresIntegration).toBe(true);
      expect(resolver.requiredDeps).toBeUndefined();
    },
  );

  it.each(ALL.map(([r, source, objectType]) => [source, r, objectType] as const))(
    "%s hits GET /crm/v3/properties/%s via refreshAndRetry",
    async (_source, resolver, objectType) => {
      mockPropertiesList.mockResolvedValueOnce({ results: [] });
      await resolver.resolve(ctx());
      const retryArgs = mockRefreshAndRetry.mock.calls[0]![0]!;
      expect(retryArgs.accountId).toBe("acct-user-1");
      expect(retryArgs.provider).toBe("hubspot");
      expect(mockPropertiesList).toHaveBeenCalledWith({
        accessToken: "token-123",
        objectType,
      });
    },
  );
});

describe("hubspot property-name resolvers — mapping", () => {
  it("value = internal name, label = display label, description = name only when it differs; hidden dropped; alpha-sorted by label", async () => {
    mockPropertiesList.mockResolvedValueOnce({
      results: [
        { name: "hs_lead_status", label: "Lead status" },
        { name: "email", label: "Email" },
        { name: "secret_internal", label: "Old", hidden: true },
        // Label falls back to the name; no redundant description.
        { name: "custom_score", label: "" },
      ],
    });
    const result = await hubspotContactPropertiesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "custom_score", label: "custom_score" },
      { value: "email", label: "Email", description: "email" },
      {
        value: "hs_lead_status",
        label: "Lead status",
        description: "hs_lead_status",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("only definition names/labels surface — property VALUES are never present", async () => {
    mockPropertiesList.mockResolvedValueOnce({
      results: [{ name: "dealname", label: "Deal name", type: "string" }],
    });
    const result = await hubspotDealPropertiesResolver.resolve(ctx());
    expect(Object.keys(result.items[0]!).sort()).toEqual([
      "description",
      "label",
      "value",
    ]);
  });

  it("case-insensitive q filter matches label OR internal name", async () => {
    mockPropertiesList.mockResolvedValue({
      results: [
        { name: "hs_lead_status", label: "Lead status" },
        { name: "lifecyclestage", label: "Lifecycle stage" },
      ],
    });
    expect(
      (
        await hubspotContactPropertiesResolver.resolve(ctx({ q: "HS_LEAD" }))
      ).items.map((i) => i.value),
    ).toEqual(["hs_lead_status"]);
    expect(
      (
        await hubspotContactPropertiesResolver.resolve(ctx({ q: "lifecycle" }))
      ).items.map((i) => i.value),
    ).toEqual(["lifecyclestage"]);
  });
});

describe("hubspot property-name resolvers — error sanitization", () => {
  it("null integration → INTEGRATION_DISCONNECTED, no wrapper call", async () => {
    await expect(
      hubspotTicketPropertiesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockPropertiesList).not.toHaveBeenCalled();
  });

  it("401 → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("HubSpot 401"),
    );
    await expect(
      hubspotProductPropertiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("403 (scope) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HubSpot 403", "hubspot"),
    );
    await expect(
      hubspotLineItemPropertiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "PROVIDER_REAUTH_REQUIRED" });
  });

  it("other failures → PROVIDER_ERROR with static copy (no raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'HubSpot GET /crm/v3/properties/companies failed: {"message":"sekret-leak"}',
      ),
    );
    try {
      await hubspotCompanyPropertiesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("sekret-leak");
    }
  });
});

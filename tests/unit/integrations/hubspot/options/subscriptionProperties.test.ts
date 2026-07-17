/**
 * @jest-environment node
 *
 * `integrations/hubspot/options/subscriptionProperties.ts` — RESOLVERS-4.
 *
 * `hubspot:subscription_properties` backs the PER-ROW `propertyName` picker on
 * the webhook_received trigger's `subscriptions` object-list. The design idea
 * under test: the row's `eventType` selects the HubSpot object type INSIDE one
 * resolver (server-side), so the builder never needs "a different option source
 * per row" — which no field could express, and which is why this was the last
 * hand-typed common-path value in the config-UX pass.
 *
 * Mock boundary: `refreshAndRetry` + the `propertiesList` wrapper (the provider
 * network boundary) — identical to the per-object propertyNames suite.
 *
 * Pins:
 *   - shape: hubspot / requiresIntegration / requiredDeps ["eventType"];
 *   - the DISPATCH TABLE: each `*.propertyChange` prefix hits the right
 *     objectType path segment, and nothing else;
 *   - non-propertyChange + unrecognized eventTypes → EMPTY, no provider call,
 *     no scary error (the field is `visibleWhen`-hidden in those cases);
 *   - an ABSENT dep still → MISSING_DEPENDENCY (that one IS "choose the event");
 *   - mapping/filter/sort behavior is IDENTICAL to the shipped per-object
 *     resolvers (shared body, asserted here rather than assumed);
 *   - no leak: no token, no raw provider body, in any error message.
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
  hubspotSubscriptionPropertiesResolver,
  targetForSubscriptionEventType,
} from "@/integrations/hubspot/options/subscriptionProperties";
import { hubspotDealPropertiesResolver } from "@/integrations/hubspot/options/propertyNames";
import { HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES } from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";
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
    deps: { eventType: "deal.propertyChange" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPropertiesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (args: { apiCall: (token: string) => Promise<unknown> }) =>
      args.apiCall("token-123"),
  );
});

describe("hubspot:subscription_properties — shape", () => {
  it("is a hubspot resolver requiring an integration + the row's eventType", () => {
    expect(hubspotSubscriptionPropertiesResolver.source).toBe(
      "hubspot:subscription_properties",
    );
    expect(hubspotSubscriptionPropertiesResolver.provider).toBe("hubspot");
    expect(hubspotSubscriptionPropertiesResolver.requiresIntegration).toBe(true);
    expect(hubspotSubscriptionPropertiesResolver.requiredDeps).toEqual([
      "eventType",
    ]);
  });
});

describe("hubspot:subscription_properties — server-side dispatch", () => {
  it.each([
    ["contact.propertyChange", "contacts"],
    ["company.propertyChange", "companies"],
    ["deal.propertyChange", "deals"],
    ["ticket.propertyChange", "tickets"],
  ])("%s → GET /crm/v3/properties/%s", async (eventType, objectType) => {
    mockPropertiesList.mockResolvedValueOnce({ results: [] });
    await hubspotSubscriptionPropertiesResolver.resolve(
      ctx({ deps: { eventType } }),
    );
    expect(mockPropertiesList).toHaveBeenCalledWith({
      accessToken: "token-123",
      objectType,
    });
    // Same credential path as every other HubSpot resolver.
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBe("acct-user-1");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("hubspot");
  });

  it("covers EVERY *.propertyChange type in the activation allowlist (no row can be unmapped)", () => {
    // If a 13th subscription type ever adds a new object family, this fails
    // rather than shipping a row whose picker is silently empty.
    const propertyChangeTypes = HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES.filter((t) =>
      t.endsWith(".propertyChange"),
    );
    expect(propertyChangeTypes.length).toBeGreaterThan(0);
    for (const eventType of propertyChangeTypes) {
      expect(targetForSubscriptionEventType(eventType)).toBeDefined();
    }
  });
});

describe("hubspot:subscription_properties — unmappable eventType is EMPTY, not an error", () => {
  // The meta hides propertyName behind
  // `visibleWhen: {field: "eventType", valueEndsWith: ".propertyChange"}`, so a
  // user cannot be looking at this picker on a creation/deletion row. Empty is
  // the honest answer ("no properties to offer for this event");
  // MISSING_DEPENDENCY would render "Select Event first" under a populated
  // Event picker, which is a lie.
  it.each([
    "contact.creation",
    "deal.deletion",
    "ticket.creation",
    "company.somethingNew",
    "not-an-event-type",
    "propertyChange",
    ".propertyChange",
    "invoice.propertyChange", // unknown object family
  ])("%s → empty items, hasMore false, NO provider call", async (eventType) => {
    const result = await hubspotSubscriptionPropertiesResolver.resolve(
      ctx({ deps: { eventType } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
    expect(mockPropertiesList).not.toHaveBeenCalled();
  });

  it("an ABSENT dep DOES throw MISSING_DEPENDENCY (that one really is 'choose the event')", async () => {
    // Defense-in-depth: the route's requiredDeps guard fires first. This is the
    // one case where the user genuinely has not chosen an event yet, so the
    // dependency error is honest.
    const absentDepCases: Array<Readonly<Record<string, string>>> = [
      {},
      { eventType: "" },
    ];
    for (const deps of absentDepCases) {
      await expect(
        hubspotSubscriptionPropertiesResolver.resolve(ctx({ deps })),
      ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    }
    expect(mockPropertiesList).not.toHaveBeenCalled();
  });
});

describe("hubspot:subscription_properties — behavior identical to the per-object resolvers", () => {
  const RESULTS = {
    results: [
      { name: "hs_lead_status", label: "Lead status" },
      { name: "amount", label: "Amount" },
      { name: "secret_internal", label: "Old", hidden: true },
      { name: "custom_score", label: "" },
    ],
  };

  it("value = INTERNAL name, label = display label, description only when it differs; hidden dropped; alpha-sorted", async () => {
    mockPropertiesList.mockResolvedValueOnce(RESULTS);
    const result = await hubspotSubscriptionPropertiesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "amount", label: "Amount", description: "amount" },
      { value: "custom_score", label: "custom_score" },
      {
        value: "hs_lead_status",
        label: "Lead status",
        description: "hs_lead_status",
      },
    ]);
    // Single unpaged response — nothing beyond it.
    expect(result.hasMore).toBe(false);
  });

  it("produces byte-identical output to hubspot:deal_properties for the same portal data", async () => {
    // The load-bearing anti-drift pin: the row picker is the SAME body, not a
    // second copy of the mapping that can diverge.
    mockPropertiesList.mockResolvedValueOnce(RESULTS);
    const viaRow = await hubspotSubscriptionPropertiesResolver.resolve(ctx());
    mockPropertiesList.mockResolvedValueOnce(RESULTS);
    const viaPerObject = await hubspotDealPropertiesResolver.resolve(ctx());
    expect(viaRow).toEqual(viaPerObject);
  });

  it("case-insensitive q filter matches label OR internal name", async () => {
    mockPropertiesList.mockResolvedValue(RESULTS);
    expect(
      (
        await hubspotSubscriptionPropertiesResolver.resolve(ctx({ q: "HS_LEAD" }))
      ).items.map((i) => i.value),
    ).toEqual(["hs_lead_status"]);
    expect(
      (
        await hubspotSubscriptionPropertiesResolver.resolve(ctx({ q: "amou" }))
      ).items.map((i) => i.value),
    ).toEqual(["amount"]);
  });

  it("only definition names/labels surface — property VALUES are never read", async () => {
    mockPropertiesList.mockResolvedValueOnce({
      results: [{ name: "dealname", label: "Deal name", type: "string" }],
    });
    const result = await hubspotSubscriptionPropertiesResolver.resolve(ctx());
    expect(Object.keys(result.items[0]!).sort()).toEqual([
      "description",
      "label",
      "value",
    ]);
  });
});

describe("hubspot:subscription_properties — error sanitization (no leak)", () => {
  it("null integration → INTEGRATION_DISCONNECTED, no wrapper call", async () => {
    await expect(
      hubspotSubscriptionPropertiesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockPropertiesList).not.toHaveBeenCalled();
  });

  it("401 → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("HubSpot 401"),
    );
    await expect(
      hubspotSubscriptionPropertiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("403 (scope) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HubSpot 403", "hubspot"),
    );
    await expect(
      hubspotSubscriptionPropertiesResolver.resolve(
        ctx({ deps: { eventType: "ticket.propertyChange" } }),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_REAUTH_REQUIRED" });
  });

  it("other failures → PROVIDER_ERROR: no token, no raw provider body", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'HubSpot GET /crm/v3/properties/deals failed: {"message":"sekret-leak"} token=pat-na1-SECRET',
      ),
    );
    try {
      await hubspotSubscriptionPropertiesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      const e = err as OptionsResolverError;
      expect(e.code).toBe("PROVIDER_ERROR");
      expect(e.message).not.toContain("sekret-leak");
      expect(e.message).not.toContain("pat-na1-SECRET");
      expect(e.message).not.toContain("token");
      // Names the object family so the copy is still useful.
      expect(e.message).toBe("Couldn't load HubSpot deal properties. Try again.");
    }
  });
});

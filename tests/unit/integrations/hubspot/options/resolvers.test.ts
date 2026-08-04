/**
 * @jest-environment node
 *
 * hubspot options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
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

const mockObjectsSearchByQuery = jest.fn();
jest.mock("@/integrations/_shared/hubspot/api/objectSearch", () => ({
  __esModule: true,
  objectsSearchByQuery: (...args: unknown[]) =>
    mockObjectsSearchByQuery(...args),
}));

import { hubspotDealPipelinesResolver } from "@/integrations/hubspot/options/dealPipelines";
import { IntegrationActionRequiredError, Unauthorized401Error, InsufficientScopeError } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { hubspotDealStagesResolver } from "@/integrations/hubspot/options/dealStages";
import { hubspotListsResolver } from "@/integrations/hubspot/options/lists";
import { hubspotOwnersResolver } from "@/integrations/hubspot/options/owners";
import { hubspotContactPropertiesResolver, hubspotCompanyPropertiesResolver, hubspotDealPropertiesResolver, hubspotTicketPropertiesResolver, hubspotProductPropertiesResolver, hubspotLineItemPropertiesResolver } from "@/integrations/hubspot/options/propertyNames";
import { hubspotDealTypeOptionsResolver, makeHubspotPropertyOptionsResolver, hubspotContactLifecycleStageOptionsResolver, hubspotContactLeadStatusOptionsResolver, hubspotCompanyLifecycleStageOptionsResolver, hubspotTicketCategoryOptionsResolver, hubspotTicketSourceTypeOptionsResolver, hubspotCallDispositionOptionsResolver } from "@/integrations/hubspot/options/propertyOptions";
import { hubspotContactsResolver, hubspotCompaniesResolver, hubspotDealsResolver, hubspotTicketsResolver, hubspotProductsResolver, hubspotLineItemsResolver } from "@/integrations/hubspot/options/records";
import { hubspotSubscriptionPropertiesResolver, targetForSubscriptionEventType } from "@/integrations/hubspot/options/subscriptionProperties";
import { HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES } from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";
import { hubspotTicketPipelinesResolver } from "@/integrations/hubspot/options/ticketPipelines";
import { hubspotTicketStagesResolver } from "@/integrations/hubspot/options/ticketStages";

// ---------------------------------------------------------------------------
// Merged from the former dealPipelines.test.ts
// Tests for `integrations/hubspot/options/dealPipelines.ts` — Slice 3.HUBSPOT-2.
// Pin:
// - Shape (source / provider / requiresIntegration / no requiredDeps).
// - Wrapper invocation (refreshAndRetry → pipelinesList with objectType="deals").
// - Pipeline mapping (value=id, label=label-or-id, archived dropped).
// - hasMore is always false (unpaginated endpoint).
// - Case-insensitive q filter on label.
// - Error sanitization (Unauthorized + IntegrationActionRequired →
// INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR).
// - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
// ---------------------------------------------------------------------------
describe("dealPipelines (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former dealStages.test.ts
// Tests for `integrations/hubspot/options/dealStages.ts` — Slice 3.HUBSPOT-2.
// Pin:
// - Shape: requiredDeps=["pipeline"].
// - Wrapper invocation via pipelinesList with objectType="deals".
// - Stage mapping for the selected pipeline only.
// - Stage order preserved.
// - Archived stages dropped.
// - Pipeline-not-found → empty items (NOT a throw).
// - MISSING_DEPENDENCY when ctx.deps.pipeline empty.
// - Error sanitization.
// ---------------------------------------------------------------------------
describe("dealStages (options)", () => {

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
        accountId: "user-1",
        provider: "hubspot",
        providerAccountId: null,
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

});

// ---------------------------------------------------------------------------
// Merged from the former lists.test.ts
// Tests for `integrations/hubspot/options/lists.ts` — Slice 3.HUBSPOT-2 (stretch).
// Pin:
// - Shape (source / provider / requiresIntegration / no requiredDeps).
// - Wrapper invocation via searchLists.
// - List mapping (value=listId, label=name-or-listId, description=processingType).
// - Archived lists dropped.
// - Lists without listId dropped.
// - hasMore propagates from API.
// - Case-insensitive q filter on label.
// - Error sanitization.
// ---------------------------------------------------------------------------
describe("lists (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former owners.test.ts
// Tests for `integrations/hubspot/options/owners.ts` — Slice 3.HUBSPOT-2.
// Pin:
// - Shape (source / provider / requiresIntegration / no requiredDeps).
// - Wrapper invocation (refreshAndRetry with provider="hubspot",
// accountId=null, apiCall that calls ownersList).
// - Label fallback ladder: first+last → first → last → email → drop.
// - Email surfaces as description ONLY when label isn't already the email.
// - Empty / null fields handled safely.
// - hasMore propagates from response.paging.next.after.
// - Case-insensitive q filter matches label + description.
// - IntegrationActionRequired / Unauthorized → INTEGRATION_DISCONNECTED.
// - Other errors → PROVIDER_ERROR with a sanitized message.
// - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
// - No token / raw HubSpot body leaks into the error message.
// ---------------------------------------------------------------------------
describe("owners (options)", () => {

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
  scopes: ["crm.objects.owners.read"],
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

describe("hubspotOwnersResolver — shape", () => {
  it("declares source / provider / requiresIntegration / no requiredDeps", () => {
    expect(hubspotOwnersResolver.source).toBe("hubspot:owners");
    expect(hubspotOwnersResolver.provider).toBe("hubspot");
    expect(hubspotOwnersResolver.requiresIntegration).toBe(true);
    expect(hubspotOwnersResolver.requiredDeps).toBeUndefined();
  });
});

describe("hubspotOwnersResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider='hubspot', accountId=null, and a closure invoking ownersList", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ results: [] });
    await hubspotOwnersResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("hubspot");
    expect(call.providerAccountId).toBe(null);
    expect(typeof call.apiCall).toBe("function");
  });
});

describe("hubspotOwnersResolver — label fallback ladder + description", () => {
  it("uses 'firstName lastName' as label and email as description when both present", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        {
          id: "1",
          firstName: "Alice",
          lastName: "Adams",
          email: "alice@example.com",
        },
      ],
    });
    const result = await hubspotOwnersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "1", label: "Alice Adams", description: "alice@example.com" },
    ]);
  });

  it("uses firstName when lastName missing; email as description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "2", firstName: "Bob", email: "bob@example.com" }],
    });
    const result = await hubspotOwnersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "2", label: "Bob", description: "bob@example.com" },
    ]);
  });

  it("uses lastName when firstName missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "3", lastName: "Chen", email: "c@x.com" }],
    });
    expect((await hubspotOwnersResolver.resolve(ctx())).items).toEqual([
      { value: "3", label: "Chen", description: "c@x.com" },
    ]);
  });

  it("falls back to email-as-label (no separate description) when both names missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "4", email: "dana@example.com" }],
    });
    const result = await hubspotOwnersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "4", label: "dana@example.com" },
    ]);
  });

  it("drops the owner when id missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "", firstName: "Ghost", email: "g@x.com" }],
    });
    expect((await hubspotOwnersResolver.resolve(ctx())).items).toEqual([]);
  });

  it("drops the owner when neither name nor email is usable", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "5", firstName: null, lastName: null, email: null }],
    });
    expect((await hubspotOwnersResolver.resolve(ctx())).items).toEqual([]);
  });

  it("treats null name fields equivalent to missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [{ id: "6", firstName: null, lastName: "Only", email: null }],
    });
    expect((await hubspotOwnersResolver.resolve(ctx())).items).toEqual([
      { value: "6", label: "Only" },
    ]);
  });
});

describe("hubspotOwnersResolver — pagination + filter", () => {
  it("returns hasMore: false when paging.next.after is absent", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ results: [] });
    expect((await hubspotOwnersResolver.resolve(ctx())).hasMore).toBe(false);
  });

  it("returns hasMore: true when paging.next.after is a non-empty string", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [],
      paging: { next: { after: "cursor-200" } },
    });
    expect((await hubspotOwnersResolver.resolve(ctx())).hasMore).toBe(true);
  });

  it("case-insensitive q filter matches label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "1", firstName: "Alice", lastName: "Adams" },
        { id: "2", firstName: "Bob", lastName: "Brown" },
      ],
    });
    const result = await hubspotOwnersResolver.resolve(ctx({ q: "alice" }));
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
  });

  it("q filter also matches description (email)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "1", firstName: "Alice", lastName: "Adams", email: "x@aaa.com" },
        { id: "2", firstName: "Bob", lastName: "Brown", email: "y@bbb.com" },
      ],
    });
    const result = await hubspotOwnersResolver.resolve(ctx({ q: "bbb" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });
});

describe("hubspotOwnersResolver — error sanitization", () => {
  it("maps IntegrationActionRequiredError to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "hubspot",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(hubspotOwnersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps Unauthorized401Error to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("HubSpot 401"),
    );
    await expect(hubspotOwnersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors to PROVIDER_ERROR with a sanitized message (no raw body)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET /crm/v3/owners failed: {"category":"INTERNAL_ERROR","message":"sekret-token-leak"}'),
    );
    try {
      await hubspotOwnersResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      const msg = (err as Error).message;
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect(msg).not.toContain("sekret-token-leak");
      expect(msg).not.toContain("INTERNAL_ERROR");
    }
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      hubspotOwnersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former propertyNames.test.ts
// Tests for `integrations/hubspot/options/propertyNames.ts` — RESOLVERS-1,
// the six property-NAME resolvers backing the get-family `filterProperty`
// combobox + per-chip `properties` picker.
// Mock boundary: `refreshAndRetry` (threads the apiCall with a fake token)
// + the `propertiesList` wrapper (the provider network boundary).
// Pins:
// - Shape for all six sources (provider / requiresIntegration / no deps).
// - Wrapper invocation: GET properties list for the right objectType.
// - Mapping: value = INTERNAL name, label = display label (name
// fallback), description = internal name only when it differs.
// - Hidden properties dropped; property VALUES never read (definitions
// only — nothing beyond name/label surfaces).
// - Local q filter matches label OR internal name; alpha sort by label;
// hasMore always false (single unpaged response).
// - Error mapping: null integration / 401 → INTEGRATION_DISCONNECTED;
// 403 → PROVIDER_REAUTH_REQUIRED; other → PROVIDER_ERROR (sanitized).
// ---------------------------------------------------------------------------
describe("propertyNames (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former propertyOptions.test.ts
// Tests for `integrations/hubspot/options/propertyOptions.ts` — the portal-
// customizable property-enum reader (config-field UX sweep). Only the DEALS
// `dealtype` instance is wired (covered by the already-granted
// `crm.schemas.deals.read` scope).
// Pins:
// - Shape (source / provider / requiresIntegration).
// - Wrapper invocation (refreshAndRetry → propertyGet for deals/dealtype).
// - Mapping: value = INTERNAL option value, label = display label.
// - Hidden options dropped; label falls back to value.
// - Case-insensitive q filter over label + value.
// - Auth errors → INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR (sanitized).
// - Null integration → INTEGRATION_DISCONNECTED, no wrapper call.
// ---------------------------------------------------------------------------
describe("propertyOptions (options)", () => {

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

// ─── CONFIG-FIELD-UX-SWEEP-4 — contacts / companies / tickets enum resolvers ──

describe("hubspot SWEEP-4 property-options resolvers — shape", () => {
  it.each([
    [hubspotContactLifecycleStageOptionsResolver, "hubspot:contact_lifecyclestage"],
    [hubspotContactLeadStatusOptionsResolver, "hubspot:contact_lead_status"],
    [hubspotCompanyLifecycleStageOptionsResolver, "hubspot:company_lifecyclestage"],
    [hubspotTicketCategoryOptionsResolver, "hubspot:ticket_category"],
    [hubspotTicketSourceTypeOptionsResolver, "hubspot:ticket_source_type"],
  ] as const)("%# declares source %s / provider hubspot / requiresIntegration", (resolver, source) => {
    expect(resolver.source).toBe(source);
    expect(resolver.provider).toBe("hubspot");
    expect(resolver.requiresIntegration).toBe(true);
  });

  it("stores the internal value, shows the label (contacts lifecyclestage)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      name: "lifecyclestage",
      options: [
        { label: "Lead", value: "lead" },
        { label: "Customer", value: "customer" },
        { label: "Hidden", value: "old", hidden: true },
      ],
    });
    const result = await hubspotContactLifecycleStageOptionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "lead", label: "Lead" },
      { value: "customer", label: "Customer" },
    ]);
  });
});

// ─── RESOLVERS-1 — calls hs_call_disposition resolver ─────────────────────────

describe("hubspotCallDispositionOptionsResolver — shape + GUID mapping", () => {
  it("declares hubspot:call_disposition / provider hubspot / requiresIntegration", () => {
    expect(hubspotCallDispositionOptionsResolver.source).toBe(
      "hubspot:call_disposition",
    );
    expect(hubspotCallDispositionOptionsResolver.provider).toBe("hubspot");
    expect(hubspotCallDispositionOptionsResolver.requiresIntegration).toBe(true);
  });

  it("stores the portal GUID value, shows the outcome label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      name: "hs_call_disposition",
      options: [
        { label: "Connected", value: "f240bbac-87c9-4f6e-bf70-924b57d47db7" },
        { label: "No answer", value: "73a0d17f-1163-4015-bdd5-ec830791da20" },
      ],
    });
    const result = await hubspotCallDispositionOptionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "f240bbac-87c9-4f6e-bf70-924b57d47db7", label: "Connected" },
      { value: "73a0d17f-1163-4015-bdd5-ec830791da20", label: "No answer" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("403 (calls property read rejected on this portal) → PROVIDER_REAUTH_REQUIRED, manual entry keeps working", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HubSpot 403", "hubspot"),
    );
    await expect(
      hubspotCallDispositionOptionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "PROVIDER_REAUTH_REQUIRED" });
  });
});

describe("hubspot SWEEP-4 property-options — missing-scope / reconnect", () => {
  it("InsufficientScopeError (403 — old token without the schema-read scope) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HubSpot 403", "hubspot"),
    );
    try {
      await hubspotContactLifecycleStageOptionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former records.test.ts
// Tests for `integrations/hubspot/options/records.ts` — RESOLVERS-1, the six
// CRM record-search resolvers (contacts / companies / deals / tickets /
// products / line_items) backing the update-family id pickers, the
// create_line_item deal/product pickers, and the engagement association
// pickers.
// Mock boundary: `refreshAndRetry` (invokes the apiCall with a fake token so
// the wrapper boundary is exercised) + the `objectsSearchByQuery` wrapper
// (the provider network boundary).
// Pins:
// - Shape (source / provider / requiresIntegration, no requiredDeps).
// - ctx.q → server-side `query` threading; omitted when q is empty.
// - limit 50; minimal display-property list per type (contacts NEVER
// request email).
// - Label mapping per type with id fallback; description = id.
// - No PII in labels: a response that sneaks an email property through
// never leaks it into label/description.
// - hasMore honest from paging cursor / total.
// - Null integration → INTEGRATION_DISCONNECTED (no wrapper call);
// 401/refresh-failure → INTEGRATION_DISCONNECTED; 403 →
// PROVIDER_REAUTH_REQUIRED; other → PROVIDER_ERROR (sanitized).
// ---------------------------------------------------------------------------
describe("records (options)", () => {

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
  scopes: ["crm.objects.contacts.read"],
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

function searchResponse(
  results: Array<{ id: string; properties: Record<string, string | null> }>,
  extra: { total?: number; after?: string } = {},
) {
  return {
    total: extra.total ?? results.length,
    results,
    ...(extra.after ? { paging: { next: { after: extra.after } } } : {}),
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockObjectsSearchByQuery.mockReset();
  // Default: thread the apiCall through with a fake token so the wrapper
  // mock sees the resolver's real request input.
  mockRefreshAndRetry.mockImplementation(
    async (args: { apiCall: (token: string) => Promise<unknown> }) =>
      args.apiCall("token-123"),
  );
});

const ALL = [
  [hubspotContactsResolver, "hubspot:contacts", "contacts"],
  [hubspotCompaniesResolver, "hubspot:companies", "companies"],
  [hubspotDealsResolver, "hubspot:deals", "deals"],
  [hubspotTicketsResolver, "hubspot:tickets", "tickets"],
  [hubspotProductsResolver, "hubspot:products", "products"],
  [hubspotLineItemsResolver, "hubspot:line_items", "line_items"],
] as const;

describe("hubspot record-search resolvers — shape", () => {
  it.each(ALL.map(([r, source, objectType]) => [source, r, objectType] as const))(
    "%s: provider hubspot, requiresIntegration, no requiredDeps",
    (_source, resolver) => {
      expect(resolver.provider).toBe("hubspot");
      expect(resolver.requiresIntegration).toBe(true);
      expect(resolver.requiredDeps).toBeUndefined();
    },
  );
});

describe("hubspot record-search resolvers — wrapper invocation", () => {
  it("threads accountId/provider into refreshAndRetry and objectType/limit into the search wrapper", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(searchResponse([]));
    await hubspotDealsResolver.resolve(ctx());
    const retryArgs = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(retryArgs.accountId).toBe("acct-user-1");
    expect(retryArgs.provider).toBe("hubspot");
    expect(retryArgs.providerAccountId).toBe(null);
    expect(mockObjectsSearchByQuery).toHaveBeenCalledWith({
      accessToken: "token-123",
      objectType: "deals",
      limit: 50,
      properties: ["dealname"],
    });
  });

  it("passes ctx.q as the server-side `query`; omits it when q is empty", async () => {
    mockObjectsSearchByQuery.mockResolvedValue(searchResponse([]));
    await hubspotCompaniesResolver.resolve(ctx({ q: "acme" }));
    expect(mockObjectsSearchByQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ objectType: "companies", query: "acme" }),
    );
    await hubspotCompaniesResolver.resolve(ctx({ q: "" }));
    expect(mockObjectsSearchByQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
    );
  });

  it("contacts request NEVER asks for the email property", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(searchResponse([]));
    await hubspotContactsResolver.resolve(ctx({ q: "ada" }));
    const input = mockObjectsSearchByQuery.mock.calls[0]![0] as {
      properties: string[];
    };
    expect(input.properties).toEqual(["firstname", "lastname"]);
    expect(input.properties).not.toContain("email");
  });
});

describe("hubspot record-search resolvers — label mapping", () => {
  it("contact: 'firstname lastname' label, id description, id fallback when nameless — email NEVER surfaced", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(
      searchResponse([
        { id: "101", properties: { firstname: "Ada", lastname: "Lovelace" } },
        { id: "102", properties: { firstname: "Cher", lastname: null } },
        // Defensive: even if HubSpot returned extra properties, they are
        // not display properties and never reach label/description.
        {
          id: "103",
          properties: { firstname: null, lastname: null, email: "x@y.z" },
        },
      ]),
    );
    const result = await hubspotContactsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "101", label: "Ada Lovelace", description: "101" },
      { value: "102", label: "Cher", description: "102" },
      { value: "103", label: "103", description: "103" },
    ]);
    for (const item of result.items) {
      expect(item.label).not.toContain("@");
      expect(item.description).not.toContain("@");
    }
  });

  it.each([
    [hubspotCompaniesResolver, { name: "Acme Inc" }, "Acme Inc"],
    [hubspotDealsResolver, { dealname: "Big Deal Q3" }, "Big Deal Q3"],
    [hubspotTicketsResolver, { subject: "Login broken" }, "Login broken"],
    [hubspotProductsResolver, { name: "Pro Plan" }, "Pro Plan"],
    [hubspotLineItemsResolver, { name: "Pro Plan x3" }, "Pro Plan x3"],
  ] as const)(
    "%# display-property label with id description; id fallback when blank",
    async (resolver, properties, label) => {
      mockObjectsSearchByQuery.mockResolvedValueOnce(
        searchResponse([
          { id: "7", properties: { ...properties } },
          { id: "8", properties: {} },
        ]),
      );
      const result = await resolver.resolve(ctx());
      expect(result.items).toEqual([
        { value: "7", label, description: "7" },
        { value: "8", label: "8", description: "8" },
      ]);
    },
  );

  it("skips rows without a usable id", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(
      searchResponse([
        { id: "", properties: { name: "ghost" } },
        { id: "9", properties: { name: "real" } },
      ]),
    );
    const result = await hubspotProductsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["9"]);
  });
});

describe("hubspot record-search resolvers — hasMore", () => {
  it("true when HubSpot returns a paging cursor", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(
      searchResponse([{ id: "1", properties: { name: "A" } }], {
        after: "50",
        total: 120,
      }),
    );
    const result = await hubspotCompaniesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("true when total exceeds the returned page even without a cursor", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(
      searchResponse([{ id: "1", properties: { name: "A" } }], { total: 80 }),
    );
    const result = await hubspotCompaniesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("false when the page covers the full match set", async () => {
    mockObjectsSearchByQuery.mockResolvedValueOnce(
      searchResponse([
        { id: "1", properties: { name: "A" } },
        { id: "2", properties: { name: "B" } },
      ]),
    );
    const result = await hubspotCompaniesResolver.resolve(ctx());
    expect(result.hasMore).toBe(false);
  });
});

describe("hubspot record-search resolvers — error sanitization", () => {
  it("null integration → INTEGRATION_DISCONNECTED, no wrapper call", async () => {
    await expect(
      hubspotContactsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockObjectsSearchByQuery).not.toHaveBeenCalled();
  });

  it("401 / refresh-failure → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("HubSpot 401"),
    );
    await expect(hubspotTicketsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "hubspot",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(hubspotTicketsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("403 (missing scope) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HubSpot 403", "hubspot"),
    );
    await expect(hubspotDealsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_REAUTH_REQUIRED",
    });
  });

  it("other failures → PROVIDER_ERROR with static copy (no raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'HubSpot POST /crm/v3/objects/line_items/search failed: {"message":"sekret-leak"}',
      ),
    );
    try {
      await hubspotLineItemsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("sekret-leak");
      expect((err as Error).message).toContain("line items");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former subscriptionProperties.test.ts
// `integrations/hubspot/options/subscriptionProperties.ts` — RESOLVERS-4.
// `hubspot:subscription_properties` backs the PER-ROW `propertyName` picker on
// the webhook_received trigger's `subscriptions` object-list. The design idea
// under test: the row's `eventType` selects the HubSpot object type INSIDE one
// resolver (server-side), so the builder never needs "a different option source
// per row" — which no field could express, and which is why this was the last
// hand-typed common-path value in the config-UX pass.
// Mock boundary: `refreshAndRetry` + the `propertiesList` wrapper (the provider
// network boundary) — identical to the per-object propertyNames suite.
// Pins:
// - shape: hubspot / requiresIntegration / requiredDeps ["eventType"];
// - the DISPATCH TABLE: each `*.propertyChange` prefix hits the right
// objectType path segment, and nothing else;
// - non-propertyChange + unrecognized eventTypes → EMPTY, no provider call,
// no scary error (the field is `visibleWhen`-hidden in those cases);
// - an ABSENT dep still → MISSING_DEPENDENCY (that one IS "choose the event");
// - mapping/filter/sort behavior is IDENTICAL to the shipped per-object
// resolvers (shared body, asserted here rather than assumed);
// - no leak: no token, no raw provider body, in any error message.
// ---------------------------------------------------------------------------
describe("subscriptionProperties (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former ticketPipelines.test.ts
// Tests for `integrations/hubspot/options/ticketPipelines.ts` —
// Slice 3.HUBSPOT-2.
// Structurally identical to `dealPipelines.test.ts`; this suite
// focuses on the diff (objectType="tickets") + a quick shape check
// so cross-resolver drift fails loudly.
// ---------------------------------------------------------------------------
describe("ticketPipelines (options)", () => {

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
  scopes: ["tickets"],
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

describe("hubspotTicketPipelinesResolver", () => {
  it("declares shape", () => {
    expect(hubspotTicketPipelinesResolver.source).toBe(
      "hubspot:ticket_pipelines",
    );
    expect(hubspotTicketPipelinesResolver.provider).toBe("hubspot");
    expect(hubspotTicketPipelinesResolver.requiresIntegration).toBe(true);
    expect(hubspotTicketPipelinesResolver.requiredDeps).toBeUndefined();
  });

  it("apiCall closure invokes pipelinesList with objectType='tickets'", async () => {
    // Capture the apiCall closure handed to refreshAndRetry, invoke
    // it with a stubbed accessToken, intercept the underlying fetch,
    // and assert the URL HubSpot would receive — proving objectType
    // is wired to "tickets".
    let observedUrl: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      observedUrl =
        typeof input === "string" ? input : String(input);
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      mockRefreshAndRetry.mockImplementationOnce(
        async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) =>
          apiCall("stub-token"),
      );
      await hubspotTicketPipelinesResolver.resolve(ctx());
      expect(observedUrl).toContain("/crm/v3/pipelines/tickets");
      // Defensive: must NOT call the deals endpoint.
      expect(observedUrl).not.toContain("/pipelines/deals");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps ticket pipelines correctly", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "support", label: "Support" },
        { id: "incidents", label: "Incidents" },
        { id: "old", label: "Old", archived: true },
      ],
    });
    const result = await hubspotTicketPipelinesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "support", label: "Support" },
      { value: "incidents", label: "Incidents" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("case-insensitive q filter on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      results: [
        { id: "support", label: "Support" },
        { id: "incidents", label: "Incidents" },
      ],
    });
    const result = await hubspotTicketPipelinesResolver.resolve(
      ctx({ q: "INCID" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["incidents"]);
  });

  it("Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotTicketPipelinesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET failed: {"raw":"ticket-secret"}'),
    );
    try {
      await hubspotTicketPipelinesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as Error).message).not.toContain("ticket-secret");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former ticketStages.test.ts
// Tests for `integrations/hubspot/options/ticketStages.ts` —
// Slice 3.HUBSPOT-2.
// Structurally mirrors `dealStages.test.ts`; differences focused
// here:
// - requiredDeps=["hs_pipeline"] (NOT "pipeline").
// - apiCall closure routes to objectType="tickets".
// - missing dep field name matches the schema's `hs_pipeline`.
// ---------------------------------------------------------------------------
describe("ticketStages (options)", () => {

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
  scopes: ["tickets"],
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
    deps: { hs_pipeline: "support" },
    ...overrides,
  };
}

const TICKET_PIPELINES = {
  results: [
    {
      id: "support",
      label: "Support",
      stages: [
        { id: "new", label: "New", displayOrder: 0 },
        { id: "in-progress", label: "In Progress", displayOrder: 1 },
        { id: "closed", label: "Closed", displayOrder: 2 },
        { id: "old", label: "Old", archived: true },
      ],
    },
    {
      id: "incidents",
      label: "Incidents",
      stages: [
        { id: "open", label: "Open", displayOrder: 0 },
        { id: "resolved", label: "Resolved", displayOrder: 1 },
      ],
    },
  ],
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("hubspotTicketStagesResolver", () => {
  it("declares requiredDeps=['hs_pipeline'] (NOT 'pipeline' — schema uses hs_pipeline)", () => {
    expect(hubspotTicketStagesResolver.source).toBe("hubspot:ticket_stages");
    expect(hubspotTicketStagesResolver.requiredDeps).toEqual(["hs_pipeline"]);
  });

  it("returns stages of the selected ticket pipeline in order, dropping archived", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TICKET_PIPELINES);
    const result = await hubspotTicketStagesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "new",
      "in-progress",
      "closed",
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("returns the other ticket pipeline's stages when hs_pipeline=incidents", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TICKET_PIPELINES);
    const result = await hubspotTicketStagesResolver.resolve(
      ctx({ deps: { hs_pipeline: "incidents" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["open", "resolved"]);
  });

  it("returns empty items when ticket pipeline id does not exist", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(TICKET_PIPELINES);
    const result = await hubspotTicketStagesResolver.resolve(
      ctx({ deps: { hs_pipeline: "ghost" } }),
    );
    expect(result.items).toEqual([]);
  });

  it("throws MISSING_DEPENDENCY when hs_pipeline empty", async () => {
    await expect(
      hubspotTicketStagesResolver.resolve(ctx({ deps: { hs_pipeline: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotTicketStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("other errors → PROVIDER_ERROR with sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('HubSpot GET failed: {"raw":"ticket-stage-secret"}'),
    );
    try {
      await hubspotTicketStagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as Error).message).not.toContain("ticket-stage-secret");
    }
  });

  it("apiCall closure invokes pipelinesList with objectType='tickets'", async () => {
    let observedUrl: string | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      observedUrl =
        typeof input === "string" ? input : String(input);
      return new Response(JSON.stringify(TICKET_PIPELINES), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      mockRefreshAndRetry.mockImplementationOnce(
        async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) =>
          apiCall("stub-token"),
      );
      await hubspotTicketStagesResolver.resolve(ctx());
      expect(observedUrl).toContain("/crm/v3/pipelines/tickets");
      expect(observedUrl).not.toContain("/pipelines/deals");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

});

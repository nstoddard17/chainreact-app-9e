/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/records.ts` — RESOLVERS-1, the six
 * CRM record-search resolvers (contacts / companies / deals / tickets /
 * products / line_items) backing the update-family id pickers, the
 * create_line_item deal/product pickers, and the engagement association
 * pickers.
 *
 * Mock boundary: `refreshAndRetry` (invokes the apiCall with a fake token so
 * the wrapper boundary is exercised) + the `objectsSearchByQuery` wrapper
 * (the provider network boundary).
 *
 * Pins:
 *   - Shape (source / provider / requiresIntegration, no requiredDeps).
 *   - ctx.q → server-side `query` threading; omitted when q is empty.
 *   - limit 50; minimal display-property list per type (contacts NEVER
 *     request email).
 *   - Label mapping per type with id fallback; description = id.
 *   - No PII in labels: a response that sneaks an email property through
 *     never leaks it into label/description.
 *   - hasMore honest from paging cursor / total.
 *   - Null integration → INTEGRATION_DISCONNECTED (no wrapper call);
 *     401/refresh-failure → INTEGRATION_DISCONNECTED; 403 →
 *     PROVIDER_REAUTH_REQUIRED; other → PROVIDER_ERROR (sanitized).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockObjectsSearchByQuery = jest.fn();
jest.mock("@/integrations/_shared/hubspot/api/objectSearch", () => ({
  __esModule: true,
  objectsSearchByQuery: (...args: unknown[]) =>
    mockObjectsSearchByQuery(...args),
}));

import {
  hubspotContactsResolver,
  hubspotCompaniesResolver,
  hubspotDealsResolver,
  hubspotTicketsResolver,
  hubspotProductsResolver,
  hubspotLineItemsResolver,
} from "@/integrations/hubspot/options/records";
import {
  InsufficientScopeError,
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

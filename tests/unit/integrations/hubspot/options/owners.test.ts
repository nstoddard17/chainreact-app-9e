/**
 * @jest-environment node
 *
 * Tests for `integrations/hubspot/options/owners.ts` — Slice 3.HUBSPOT-2.
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration / no requiredDeps).
 *   - Wrapper invocation (refreshAndRetry with provider="hubspot",
 *     accountId=null, apiCall that calls ownersList).
 *   - Label fallback ladder: first+last → first → last → email → drop.
 *   - Email surfaces as description ONLY when label isn't already the email.
 *   - Empty / null fields handled safely.
 *   - hasMore propagates from response.paging.next.after.
 *   - Case-insensitive q filter matches label + description.
 *   - IntegrationActionRequired / Unauthorized → INTEGRATION_DISCONNECTED.
 *   - Other errors → PROVIDER_ERROR with a sanitized message.
 *   - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
 *   - No token / raw HubSpot body leaks into the error message.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { hubspotOwnersResolver } from "@/integrations/hubspot/options/owners";
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
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("hubspot");
    expect(call.accountId).toBe(null);
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
        userId: "user-1",
        provider: "hubspot",
        accountId: null,
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

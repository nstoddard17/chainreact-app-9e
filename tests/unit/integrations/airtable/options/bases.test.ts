/**
 * @jest-environment node
 *
 * Tests for `integrations/airtable/options/bases.ts` — Slice
 * 4.AIRTABLE-META-2. Account-scoped root picker (no deps); value = base
 * id; backed by the new `basesList` helper.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { airtableBasesResolver } from "@/integrations/airtable/options/bases";
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
  provider: "airtable",
  providerAccountId: "usrAIRTABLEUSER",
  displayName: "Alice (Airtable)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-25T12:00:00Z",
  scopes: ["data.records:read", "schema.bases:read"],
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

describe("airtableBasesResolver — shape", () => {
  it("is an account-scoped root picker (no requiredDeps) requiring an integration", () => {
    expect(airtableBasesResolver.source).toBe("airtable:bases");
    expect(airtableBasesResolver.provider).toBe("airtable");
    expect(airtableBasesResolver.requiresIntegration).toBe(true);
    expect(airtableBasesResolver.requiredDeps).toBeUndefined();
  });
});

describe("airtableBasesResolver — wrapper invocation", () => {
  it("calls basesList (GET /v0/meta/bases) via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ bases: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await airtableBasesResolver.resolve(ctx());

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://api.airtable.com/v0/meta/bases",
    );
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("airtable");
    expect(args.providerAccountId).toBe("usrAIRTABLEUSER");
  });
});

describe("airtableBasesResolver — mapping + ordering", () => {
  it("maps base id → value, name → label, permissionLevel → description; sorted by label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [
        { id: "appB", name: "Zebra", permissionLevel: "edit" },
        { id: "appA", name: "Apple", permissionLevel: "create" },
      ],
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "appA", label: "Apple", description: "create" },
      { value: "appB", label: "Zebra", description: "edit" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back label → id when name is empty; omits description when permissionLevel absent", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [{ id: "appX", name: "" }],
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "appX", label: "appX" }]);
  });

  it("drops bases with empty/missing id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [
        { id: "", name: "Ghost" },
        { id: "appReal", name: "Real" },
      ],
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["appReal"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [
        { id: "app1", name: "Sales CRM" },
        { id: "app2", name: "Marketing" },
        { id: "app3", name: "Support crm" },
      ],
    });
    const result = await airtableBasesResolver.resolve(ctx({ q: "CRM" }));
    expect(result.items.map((i) => i.value).sort()).toEqual(["app1", "app3"]);
  });

  it("advertises hasMore=true when Airtable returns a pagination offset", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      bases: [{ id: "app1", name: "One" }],
      offset: "next-cursor",
    });
    const result = await airtableBasesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("airtableBasesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      airtableBasesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "airtable",
        providerAccountId: "usrAIRTABLEUSER",
        reason: "refresh_failed",
      }),
    );
    await expect(airtableBasesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(airtableBasesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('bases GET failed: {"raw":"base-secret-leak"} Bearer xyz'),
    );
    try {
      await airtableBasesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("base-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

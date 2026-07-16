/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/capacities.ts` —
 * root resolver (no deps) backing `capacityId` on
 * assign_workspace_to_capacity. Label `<displayName> · <sku>`; rows with
 * `capacityUserAccessRight: "None"` are excluded (user can't assign).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockCapacitiesList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/capacities/capacitiesList", () => ({
  capacitiesList: (...args: unknown[]) => mockCapacitiesList(...args),
}));

import { microsoftPowerBiCapacitiesResolver } from "@/integrations/microsoft-powerbi/options/capacities";
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
  provider: "microsoft-powerbi",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Power BI)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: ["offline_access"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

function capacity(overrides: Record<string, unknown> = {}) {
  return {
    id: "cap-1",
    displayName: "Finance P1",
    sku: "P1",
    state: "Active",
    capacityUserAccessRight: "Assign",
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCapacitiesList.mockReset();
});

describe("microsoftPowerBiCapacitiesResolver — shape", () => {
  it("declares source/provider and requires an integration, no deps", () => {
    expect(microsoftPowerBiCapacitiesResolver.source).toBe(
      "microsoft-powerbi:capacities",
    );
    expect(microsoftPowerBiCapacitiesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiCapacitiesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiCapacitiesResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftPowerBiCapacitiesResolver — wrapper invocation", () => {
  it("calls capacitiesList via refreshAndRetry pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockCapacitiesList.mockResolvedValueOnce([]);

    await microsoftPowerBiCapacitiesResolver.resolve(ctx());

    expect(mockCapacitiesList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiCapacitiesResolver — mapping + filtering", () => {
  it("maps id → value and `displayName · sku` → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      capacity(),
      capacity({ id: "cap-2", displayName: "Embedded A1", sku: "A1" }),
    ]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "cap-1", label: "Finance P1 · P1" },
      { value: "cap-2", label: "Embedded A1 · A1" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to displayName alone when the sku is absent", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([capacity({ sku: null })]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "cap-1", label: "Finance P1" }]);
  });

  it("excludes capacities the user cannot assign to (accessRight 'None'), keeps flag-less rows", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      capacity(),
      capacity({ id: "cap-none", capacityUserAccessRight: "None" }),
      capacity({ id: "cap-admin", capacityUserAccessRight: "Admin" }),
      capacity({ id: "cap-unflagged", capacityUserAccessRight: null }),
    ]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "cap-1",
      "cap-admin",
      "cap-unflagged",
    ]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      capacity({ id: "c1", displayName: "Finance P1" }),
      capacity({ id: "c2", displayName: "Marketing P2", sku: "P2" }),
    ]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(
      ctx({ q: "MARKETING" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["c2"]);
  });
});

describe("microsoftPowerBiCapacitiesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiCapacitiesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiCapacitiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiCapacitiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('capacities GET failed: {"raw":"cap-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiCapacitiesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("cap-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

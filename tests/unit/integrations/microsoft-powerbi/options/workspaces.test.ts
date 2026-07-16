/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/workspaces.ts` — the
 * root of every Power BI cascade (no deps), backing `workspaceId` on all
 * workspace-scoped actions and triggers. Value = group GUID, label =
 * workspace name; `hasMore` is forwarded from the wrapper's truncation
 * flag so the picker can say "refine your search".
 *
 * Written during RESOLVERS-1's clean-checkout closure: the two root
 * resolvers (workspaces / semantic_models) shipped without direct tests
 * while all 19 of their descendants had them.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockGroupsList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/groups/groupsList", () => ({
  groupsList: (...args: unknown[]) => mockGroupsList(...args),
}));

import { microsoftPowerBiWorkspacesResolver } from "@/integrations/microsoft-powerbi/options/workspaces";
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
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    name: "Finance Reporting",
    isOnDedicatedCapacity: false,
    capacityId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupsList.mockReset();
});

describe("microsoftPowerBiWorkspacesResolver — shape", () => {
  it("declares source/provider, requires an integration, and is dep-less (cascade root)", () => {
    expect(microsoftPowerBiWorkspacesResolver.source).toBe(
      "microsoft-powerbi:workspaces",
    );
    expect(microsoftPowerBiWorkspacesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiWorkspacesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiWorkspacesResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftPowerBiWorkspacesResolver — wrapper invocation", () => {
  it("calls groupsList via refreshAndRetry pinned to the node's integration account", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockGroupsList.mockResolvedValueOnce({ groups: [], hasMore: false });

    await microsoftPowerBiWorkspacesResolver.resolve(ctx());

    expect(mockGroupsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.accountId).toBe("acct-user-1");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiWorkspacesResolver — mapping + filtering", () => {
  it("maps id → value and name → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [group(), group({ id: "ws-2", name: "Marketing Analytics" })],
      hasMore: false,
    });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ws-1", label: "Finance Reporting" },
      { value: "ws-2", label: "Marketing Analytics" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies a case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [group(), group({ id: "ws-2", name: "Marketing Analytics" })],
      hasMore: false,
    });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(
      ctx({ q: "MARKETING" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ws-2"]);
  });

  it("forwards the wrapper's hasMore so the picker can prompt for a narrower search", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [group()],
      hasMore: true,
    });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("returns an empty list (not an error) when the account has no workspaces", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ groups: [], hasMore: false });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("microsoftPowerBiWorkspacesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, without calling the API", async () => {
    await expect(
      microsoftPowerBiWorkspacesResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiWorkspacesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiWorkspacesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no token / raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('groups GET failed: {"raw":"ws-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiWorkspacesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("ws-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

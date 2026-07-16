/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/pipelineUsers.ts` —
 * depends on `pipelineId`; value is the principal identifier.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockUsersList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineUsersList",
  () => ({
    pipelineUsersList: (...args: unknown[]) => mockUsersList(...args),
  }),
);

import { microsoftPowerBiPipelineUsersResolver } from "@/integrations/microsoft-powerbi/options/pipelineUsers";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
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
  createdAt: "2026-07-14T00:00:00Z",
  updatedAt: "2026-07-14T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { pipelineId: "pipe-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersList.mockReset();
});

describe("microsoftPowerBiPipelineUsersResolver — shape", () => {
  it("declares requiredDeps=['pipelineId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineUsersResolver.source).toBe(
      "microsoft-powerbi:pipeline_users",
    );
    expect(microsoftPowerBiPipelineUsersResolver.requiredDeps).toEqual([
      "pipelineId",
    ]);
  });
});

describe("microsoftPowerBiPipelineUsersResolver — mapping", () => {
  it("value = identifier, label = `identifier · accessRight` (identifier alone when right unknown)", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockUsersList.mockResolvedValueOnce([
      { identifier: "bob@contoso.com", principalType: "User", accessRight: "Admin" },
      { identifier: "9f0c-obj-id", principalType: "App", accessRight: null },
    ]);

    const result = await microsoftPowerBiPipelineUsersResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "bob@contoso.com · Admin" },
      { value: "9f0c-obj-id", label: "9f0c-obj-id" },
    ]);
    expect(result.hasMore).toBe(false);
    expect(mockUsersList.mock.calls[0]![0].pipelineId).toBe("pipe-1");
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { identifier: "bob@contoso.com", principalType: "User", accessRight: "Admin" },
      { identifier: "eve@contoso.com", principalType: "User", accessRight: "Admin" },
    ]);
    const result = await microsoftPowerBiPipelineUsersResolver.resolve(
      ctx({ q: "BOB" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["bob@contoso.com"]);
  });
});

describe("microsoftPowerBiPipelineUsersResolver — deps + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when pipelineId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(
        ctx({ deps: { pipelineId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("pipeline"));
    const result = await microsoftPowerBiPipelineUsersResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineUsersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('users GET failed: {"raw":"user-pii-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiPipelineUsersResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("user-pii-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

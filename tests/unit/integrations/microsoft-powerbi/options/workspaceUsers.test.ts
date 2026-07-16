/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/workspaceUsers.ts` —
 * cascading resolver (workspaceId dep) backing `principalIdentifier` on
 * remove_workspace_user. Value = `identifier ?? emailAddress` (the exact
 * string the DELETE path accepts); label = `<displayName ?? email> ·
 * <accessRight>`.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockGroupUsersList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUsersList", () => ({
  groupUsersList: (...args: unknown[]) => mockGroupUsersList(...args),
}));

import { microsoftPowerBiWorkspaceUsersResolver } from "@/integrations/microsoft-powerbi/options/workspaceUsers";
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
    deps: { workspaceId: "ws-1" },
    ...overrides,
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    identifier: null,
    emailAddress: "bob@contoso.com",
    displayName: "Bob",
    groupUserAccessRight: "Viewer",
    principalType: "User",
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupUsersList.mockReset();
});

describe("microsoftPowerBiWorkspaceUsersResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] (camelCase, schema-verbatim) and requires an integration", () => {
    expect(microsoftPowerBiWorkspaceUsersResolver.source).toBe(
      "microsoft-powerbi:workspace_users",
    );
    expect(microsoftPowerBiWorkspaceUsersResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiWorkspaceUsersResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiWorkspaceUsersResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — wrapper invocation", () => {
  it("calls groupUsersList with the workspaceId via refreshAndRetry pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockGroupUsersList.mockResolvedValueOnce([]);

    await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());

    expect(mockGroupUsersList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — mapping", () => {
  it("prefers identifier over email for value; label = displayName · right", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user(),
      user({
        identifier: "obj-guid-1",
        emailAddress: null,
        displayName: "Data App",
        groupUserAccessRight: "Member",
        principalType: "App",
      }),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "Bob · Viewer" },
      { value: "obj-guid-1", label: "Data App · Member" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to email (then value) for the label name and 'Unknown' for a missing right", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user({ displayName: null }),
      user({
        identifier: "obj-guid-2",
        emailAddress: null,
        displayName: null,
        groupUserAccessRight: null,
      }),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "bob@contoso.com · Viewer" },
      { value: "obj-guid-2", label: "obj-guid-2 · Unknown" },
    ]);
  });

  it("drops rows carrying neither identifier nor email (nothing the DELETE path accepts)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user({ identifier: null, emailAddress: null }),
      user(),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["bob@contoso.com"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user(),
      user({ emailAddress: "carol@contoso.com", displayName: "Carol" }),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(
      ctx({ q: "CAROL" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["carol@contoso.com"]);
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty, no API call", async () => {
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(
        ctx({ deps: { workspaceId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when workspaceId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workspace gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('group users GET failed: {"raw":"user-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("user-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

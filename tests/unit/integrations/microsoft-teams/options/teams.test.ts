/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-teams/options/teams.ts` — Slice
 * 4.TEAMS-META-2. Account-scoped team picker (no deps). Refreshable auth
 * (refreshAndRetry). value = opaque team id; alpha sorted.
 */

const mockTeamsList = jest.fn();
jest.mock("@/integrations/microsoft-teams/api/teamsList", () => ({
  __esModule: true,
  teamsList: (...args: unknown[]) => mockTeamsList(...args),
}));

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftTeamsTeamsResolver } from "@/integrations/microsoft-teams/options/teams";
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
  provider: "microsoft-teams",
  providerAccountId: "user@example.com",
  displayName: "User Teams",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-25T12:00:00Z",
  scopes: ["offline_access", "Team.ReadBasic.All"],
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
  mockTeamsList.mockReset();
  mockRefreshAndRetry.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("test-access-token"),
  );
});

describe("microsoftTeamsTeamsResolver — shape", () => {
  it("declares source / provider / requiresIntegration / no deps", () => {
    expect(microsoftTeamsTeamsResolver.source).toBe("microsoft-teams:teams");
    expect(microsoftTeamsTeamsResolver.provider).toBe("microsoft-teams");
    expect(microsoftTeamsTeamsResolver.requiresIntegration).toBe(true);
    expect(microsoftTeamsTeamsResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftTeamsTeamsResolver — wrapper invocation", () => {
  it("calls teamsList via refreshAndRetry pinned to providerAccountId", async () => {
    mockTeamsList.mockResolvedValueOnce({ teams: [], nextLink: null });
    await microsoftTeamsTeamsResolver.resolve(ctx());
    expect(mockTeamsList).toHaveBeenCalledWith({ accessToken: "test-access-token" });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-teams");
    expect(args.accountId).toBe("user@example.com");
  });
});

describe("microsoftTeamsTeamsResolver — mapping (value = team id)", () => {
  it("maps id→value, displayName→label, description; alpha sorts", async () => {
    mockTeamsList.mockResolvedValueOnce({
      teams: [
        { id: "t2", displayName: "Zebra", description: "z team" },
        { id: "t1", displayName: "Alpha", description: null },
      ],
      nextLink: null,
    });
    const result = await microsoftTeamsTeamsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "t1", label: "Alpha" },
      { value: "t2", label: "Zebra", description: "z team" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id as label when displayName missing; drops id-less teams", async () => {
    mockTeamsList.mockResolvedValueOnce({
      teams: [
        { id: "tX", displayName: "" },
        { displayName: "Ghost" },
      ],
      nextLink: null,
    });
    const result = await microsoftTeamsTeamsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "tX", label: "tX" }]);
  });

  it("filters case-insensitively on label OR description", async () => {
    // Persistent (both resolve() calls below pull the same data).
    mockTeamsList.mockResolvedValue({
      teams: [
        { id: "t1", displayName: "Marketing", description: "promo" },
        { id: "t2", displayName: "Engineering", description: "builds things" },
      ],
      nextLink: null,
    });
    expect(
      (await microsoftTeamsTeamsResolver.resolve(ctx({ q: "eng" }))).items.map((i) => i.value),
    ).toEqual(["t2"]);
    // description match
    expect(
      (await microsoftTeamsTeamsResolver.resolve(ctx({ q: "promo" }))).items.map((i) => i.value),
    ).toEqual(["t1"]);
  });

  it("propagates hasMore from the Graph nextLink", async () => {
    mockTeamsList.mockResolvedValueOnce({
      teams: [{ id: "t1", displayName: "A" }],
      nextLink: "https://graph/next",
    });
    expect((await microsoftTeamsTeamsResolver.resolve(ctx())).hasMore).toBe(true);
  });
});

describe("microsoftTeamsTeamsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftTeamsTeamsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockTeamsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockTeamsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(microsoftTeamsTeamsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockTeamsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "microsoft-teams",
        accountId: "user@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(microsoftTeamsTeamsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockTeamsList.mockRejectedValueOnce(
      new Error('Graph failed: {"raw":"team-secret-leak"} Bearer xyz'),
    );
    let thrown: unknown;
    try {
      await microsoftTeamsTeamsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (thrown as Error).message;
    expect(msg).not.toContain("team-secret-leak");
    expect(msg).not.toContain("Bearer");
  });
});

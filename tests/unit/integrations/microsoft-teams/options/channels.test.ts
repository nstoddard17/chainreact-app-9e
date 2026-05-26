/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-teams/options/channels.ts` — Slice
 * 4.TEAMS-META-2. Depends on `teamId`; value = opaque channel id; preserves
 * Graph order; deleted/no-access team → empty items; NO channel email /
 * message content surfaced.
 */

const mockChannelsList = jest.fn();
jest.mock("@/integrations/microsoft-teams/api/channelsList", () => ({
  __esModule: true,
  channelsList: (...args: unknown[]) => mockChannelsList(...args),
}));

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftTeamsChannelsResolver } from "@/integrations/microsoft-teams/options/channels";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
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
  scopes: ["offline_access", "Channel.ReadBasic.All"],
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
    deps: { teamId: "t1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockChannelsList.mockReset();
  mockRefreshAndRetry.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("test-access-token"),
  );
});

describe("microsoftTeamsChannelsResolver — shape", () => {
  it("declares requiredDeps=['teamId'] (schema-verbatim) and requires an integration", () => {
    expect(microsoftTeamsChannelsResolver.source).toBe("microsoft-teams:channels");
    expect(microsoftTeamsChannelsResolver.provider).toBe("microsoft-teams");
    expect(microsoftTeamsChannelsResolver.requiresIntegration).toBe(true);
    expect(microsoftTeamsChannelsResolver.requiredDeps).toEqual(["teamId"]);
  });
});

describe("microsoftTeamsChannelsResolver — wrapper invocation", () => {
  it("calls channelsList with the teamId via refreshAndRetry", async () => {
    mockChannelsList.mockResolvedValueOnce({ channels: [], nextLink: null });
    await microsoftTeamsChannelsResolver.resolve(ctx());
    expect(mockChannelsList).toHaveBeenCalledWith({
      accessToken: "test-access-token",
      teamId: "t1",
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBe("user@example.com");
  });
});

describe("microsoftTeamsChannelsResolver — mapping (value = channel id, order preserved)", () => {
  it("maps id→value, displayName→label; description prefers channel description, falls back to membershipType; preserves Graph order", async () => {
    mockChannelsList.mockResolvedValueOnce({
      channels: [
        { id: "c1", displayName: "General", membershipType: "standard" },
        {
          id: "c2",
          displayName: "Specs",
          description: "Design specs",
          membershipType: "private",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftTeamsChannelsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "c1", label: "General", description: "standard" },
      { value: "c2", label: "Specs", description: "Design specs" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("never surfaces a channel email even if present in the payload", async () => {
    mockChannelsList.mockResolvedValueOnce({
      channels: [
        {
          id: "c1",
          displayName: "General",
          membershipType: "standard",
          email: "general@team.example.com",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftTeamsChannelsResolver.resolve(ctx());
    expect(JSON.stringify(result.items)).not.toContain("general@team.example.com");
  });

  it("falls back to id as label when displayName missing; drops id-less channels", async () => {
    mockChannelsList.mockResolvedValueOnce({
      channels: [
        { id: "cX", displayName: "" },
        { displayName: "Ghost" },
      ],
      nextLink: null,
    });
    const result = await microsoftTeamsChannelsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "cX", label: "cX" }]);
  });

  it("applies case-insensitive q filter on label or description", async () => {
    // Persistent (both resolve() calls below pull the same data).
    mockChannelsList.mockResolvedValue({
      channels: [
        { id: "c1", displayName: "General", membershipType: "standard" },
        { id: "c2", displayName: "Random", membershipType: "private" },
      ],
      nextLink: null,
    });
    expect(
      (await microsoftTeamsChannelsResolver.resolve(ctx({ q: "random" }))).items.map((i) => i.value),
    ).toEqual(["c2"]);
    // membershipType (carried in description) matches
    expect(
      (await microsoftTeamsChannelsResolver.resolve(ctx({ q: "private" }))).items.map((i) => i.value),
    ).toEqual(["c2"]);
  });

  it("propagates hasMore from the Graph nextLink", async () => {
    mockChannelsList.mockResolvedValueOnce({
      channels: [{ id: "c1", displayName: "General" }],
      nextLink: "https://graph/next",
    });
    expect((await microsoftTeamsChannelsResolver.resolve(ctx())).hasMore).toBe(true);
  });
});

describe("microsoftTeamsChannelsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when teamId empty, no API call", async () => {
    await expect(
      microsoftTeamsChannelsResolver.resolve(ctx({ deps: { teamId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockChannelsList).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when teamId missing, no API call", async () => {
    await expect(
      microsoftTeamsChannelsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockChannelsList).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when the parent team is gone (NotFoundError)", async () => {
    mockChannelsList.mockRejectedValueOnce(
      new NotFoundError("team tGONE channels", "no team"),
    );
    const result = await microsoftTeamsChannelsResolver.resolve(
      ctx({ deps: { teamId: "tGONE" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftTeamsChannelsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftTeamsChannelsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockChannelsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockChannelsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(microsoftTeamsChannelsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockChannelsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "microsoft-teams",
        accountId: "user@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(microsoftTeamsChannelsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockChannelsList.mockRejectedValueOnce(
      new Error('Graph failed: {"raw":"channel-secret-leak"} Bearer xyz'),
    );
    let thrown: unknown;
    try {
      await microsoftTeamsChannelsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((thrown as Error).message).not.toContain("channel-secret-leak");
  });
});

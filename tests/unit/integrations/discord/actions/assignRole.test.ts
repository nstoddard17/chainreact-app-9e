/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord assign_role handler.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockMemberAddRole = jest.fn();
jest.mock("@/integrations/_shared/discord/api/members", () => ({
  memberAddRole: (...args: unknown[]) => mockMemberAddRole(...args),
}));

import { assignRole } from "@/integrations/discord/actions/assignRole";
import { DiscordApiError } from "@/integrations/_shared/discord/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const nativeEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "ev1",
  occurredAt: "2026-05-23T00:00:00Z",
  providerAccountId: "discord-user-1",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "discord",
  providerAccountId: "discord-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "ENC-R",
  accessTokenExpiresAt: null,
  scopes: ["identify", "email", "bot", "guilds"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run",
    nodeId: "n",
    config,
    triggerEvent: nativeEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockMemberAddRole.mockReset();
});

describe("assignRole — happy path", () => {
  it("PUTs role and returns success projection", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMemberAddRole.mockResolvedValueOnce(undefined);

    const result = await assignRole(
      makeInput({ guildId: "g1", userId: "u1", roleId: "r1" }),
    );

    expect(mockMemberAddRole).toHaveBeenCalledWith({
      guildId: "g1",
      userId: "u1",
      roleId: "r1",
    });
    expect(result.output).toEqual({
      success: true,
      guildId: "g1",
      userId: "u1",
      roleId: "r1",
      timestamp: expect.any(String),
    });
  });

  it("preserves V1 field name `userId` (not `memberId`)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    await expect(
      assignRole(makeInput({ guildId: "g", memberId: "u", roleId: "r" })),
    ).rejects.toThrow();
    expect(mockMemberAddRole).not.toHaveBeenCalled();
  });
});

describe("assignRole — validation + gate + errors", () => {
  it("rejects missing required fields", async () => {
    await expect(
      assignRole(makeInput({ guildId: "g", roleId: "r" })),
    ).rejects.toThrow();
  });

  it("throws when no Discord integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      assignRole(makeInput({ guildId: "g", userId: "u", roleId: "r" })),
    ).rejects.toThrow(/No active Discord integration/);
  });

  it("propagates DiscordApiError 403 (Missing Permissions / role hierarchy)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMemberAddRole.mockRejectedValueOnce(
      new DiscordApiError(403, 50013, "Missing Permissions"),
    );
    await expect(
      assignRole(makeInput({ guildId: "g", userId: "u", roleId: "r" })),
    ).rejects.toThrow(/Missing Permissions/);
  });
});

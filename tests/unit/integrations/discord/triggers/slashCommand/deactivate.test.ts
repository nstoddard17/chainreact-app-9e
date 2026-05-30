/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-6 — `discord:slash_command` deactivation hook.
 *
 * Pinned contracts:
 *   - Calls Discord's
 *     `DELETE /applications/{app_id}/guilds/{guild_id}/commands/{command_id}`
 *     when all three ids are present on `trigger.config`.
 *   - 404 (`NotFoundError`) → swallow silently (best-effort cleanup —
 *     command may already be gone if operator deleted it manually).
 *   - Other errors propagate so the lifecycle orchestrator's
 *     best-effort catch surfaces them in the structured log.
 *   - Missing any of applicationId / guildId / commandId on the row's
 *     config → no-op (defensive against partial-activation states).
 */
const mockDelete = jest.fn();

jest.mock("@/integrations/_shared/discord/api/applications", () => {
  const actual = jest.requireActual(
    "@/integrations/_shared/discord/api/applications",
  );
  return {
    ...actual,
    guildCommandDelete: (...args: unknown[]) => mockDelete(...args),
  };
});

import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { deactivate } from "@/integrations/discord/triggers/slashCommand/deactivate";

beforeEach(() => {
  mockDelete.mockReset();
});

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "discord",
  providerAccountId: "u",
  displayName: "u",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["identify", "email", "bot", "guilds"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function makeTrigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "discord",
    eventType: "slash_command",
    nodeId: "node-1",
    providerAccountId: null,
    config,
    registeredAt: "2026-05-23T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-23T00:00:00Z",
    updatedAt: "2026-05-23T00:00:00Z",
  };
}

describe("discord slash_command deactivate — happy path", () => {
  it("deletes the registered command once", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    await deactivate({
      trigger: makeTrigger({
        applicationId: "app",
        guildId: "guild",
        commandId: "cmd",
      }),
      integration,
    });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]!).toEqual({
      applicationId: "app",
      guildId: "guild",
      commandId: "cmd",
    });
  });
});

describe("discord slash_command deactivate — defensive no-ops", () => {
  it("does NOT call Discord when applicationId is missing", async () => {
    await deactivate({
      trigger: makeTrigger({ guildId: "g", commandId: "c" }),
      integration,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does NOT call Discord when guildId is missing", async () => {
    await deactivate({
      trigger: makeTrigger({ applicationId: "a", commandId: "c" }),
      integration,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does NOT call Discord when commandId is missing", async () => {
    await deactivate({
      trigger: makeTrigger({ applicationId: "a", guildId: "g" }),
      integration,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does NOT call Discord when commandId is empty string", async () => {
    await deactivate({
      trigger: makeTrigger({
        applicationId: "a",
        guildId: "g",
        commandId: "",
      }),
      integration,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("discord slash_command deactivate — error handling", () => {
  it("swallows NotFoundError (404 — command already gone)", async () => {
    mockDelete.mockRejectedValueOnce(
      new NotFoundError("application app guild g command c"),
    );
    await expect(
      deactivate({
        trigger: makeTrigger({
          applicationId: "app",
          guildId: "g",
          commandId: "c",
        }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-404 errors so lifecycle's catch sees them", async () => {
    mockDelete.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    await expect(
      deactivate({
        trigger: makeTrigger({
          applicationId: "app",
          guildId: "g",
          commandId: "c",
        }),
        integration,
      }),
    ).rejects.toThrow(/503/);
  });
});

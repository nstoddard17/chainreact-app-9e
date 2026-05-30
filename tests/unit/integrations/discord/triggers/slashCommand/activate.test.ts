/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-6 — `discord:slash_command` activation hook.
 *
 * Pinned contracts:
 *   - POSTs Discord's
 *     `/applications/{app_id}/guilds/{guild_id}/commands` once.
 *   - Persists `applicationId / guildId / commandName / commandDescription
 *     / commandId` to `trigger_resources.config`, plus `webhookEnabled: true`.
 *   - Does NOT set `config.type = "subscription-watch"` (Discord
 *     commands don't expire; renewal cron must not pick them up).
 *   - Schema validation runs BEFORE any Discord round trip:
 *     missing/empty `guildId` / `commandName` / `commandDescription`
 *     and out-of-spec name regex / length all fail-closed.
 *   - Missing `DISCORD_APPLICATION_ID` env throws WITHOUT calling
 *     Discord — same V1-bug-fix shape as GitHub's missing-secret gate.
 */
const mockCreate = jest.fn();

jest.mock("@/integrations/_shared/discord/api/applications", () => {
  const actual = jest.requireActual(
    "@/integrations/_shared/discord/api/applications",
  );
  return {
    ...actual,
    guildCommandCreate: (...args: unknown[]) => mockCreate(...args),
  };
});

import { activate } from "@/integrations/discord/triggers/slashCommand/activate";

beforeEach(() => {
  mockCreate.mockReset();
  process.env.DISCORD_APPLICATION_ID = "app-snowflake-123";
});

afterEach(() => {
  delete process.env.DISCORD_APPLICATION_ID;
});

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "discord",
  providerAccountId: "discord-user-1",
  displayName: "test-user",
  accessTokenEncrypted: "ENC-USER",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["identify", "email", "bot", "guilds"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "discord",
  type: "slash_command",
  config: {
    guildId: "guild-snowflake-456",
    commandName: "report",
    commandDescription: "Generate a status report",
  },
  position: { x: 0, y: 0 },
};

describe("discord slash_command activate — happy path", () => {
  it("registers the slash command via guildCommandCreate exactly once", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "command-snowflake-789",
      application_id: "app-snowflake-123",
      guild_id: "guild-snowflake-456",
      name: "report",
      description: "Generate a status report",
    });
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]!).toMatchObject({
      applicationId: "app-snowflake-123",
      guildId: "guild-snowflake-456",
      name: "report",
      description: "Generate a status report",
    });
    expect(result).toEqual({
      webhookEnabled: true,
      applicationId: "app-snowflake-123",
      guildId: "guild-snowflake-456",
      commandName: "report",
      commandDescription: "Generate a status report",
      commandId: "command-snowflake-789",
    });
  });

  it("does NOT set config.type = 'subscription-watch' (Discord commands don't expire)", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "cmd",
      application_id: "app",
      guild_id: "g",
      name: "report",
      description: "x",
    });
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf",
    });
    // The renewal cron filters on config.type === "subscription-watch".
    // Discord slash commands MUST NOT carry this marker.
    expect((result as Record<string, unknown>).type).toBeUndefined();
  });
});

describe("discord slash_command activate — schema validation", () => {
  it("rejects missing guildId", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { ...baseNode.config, guildId: "" } },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/guildId is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects missing commandName", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { ...baseNode.config, commandName: "" } },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/commandName is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects commandName with uppercase letters (Discord requires lowercase)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { ...baseNode.config, commandName: "Report" },
        },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/lowercase/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects commandName with disallowed characters (V2 ASCII-only enforcement)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { ...baseNode.config, commandName: "report!" },
        },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/commandName must match/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects commandName over 32 chars", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { ...baseNode.config, commandName: "x".repeat(33) },
        },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/32 characters/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects missing commandDescription", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { ...baseNode.config, commandDescription: "" },
        },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/commandDescription is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects commandDescription over 100 chars", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { ...baseNode.config, commandDescription: "x".repeat(101) },
        },
        integration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/100 characters/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("discord slash_command activate — env guard", () => {
  it("FAILS CLOSED when DISCORD_APPLICATION_ID is missing — no Discord call attempted", async () => {
    delete process.env.DISCORD_APPLICATION_ID;
    await expect(
      activate({ node: baseNode, integration, workflowId: "wf" }),
    ).rejects.toThrow(/DISCORD_APPLICATION_ID/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("discord slash_command activate — Discord error propagation", () => {
  it("propagates Discord errors so lifecycle wraps with TRIGGER_REGISTRATION_FAILED", async () => {
    mockCreate.mockRejectedValueOnce(new Error("403 Missing Access"));
    await expect(
      activate({ node: baseNode, integration, workflowId: "wf" }),
    ).rejects.toThrow(/403/);
  });
});

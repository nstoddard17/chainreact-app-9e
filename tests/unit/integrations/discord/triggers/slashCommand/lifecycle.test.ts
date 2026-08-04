/**
 * @jest-environment node
 *
 * discord/triggers/slashCommand trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockFindByWorkflowAndNode = jest.fn();
const mockVerify = jest.fn();

jest.mock("@/integrations/_shared/discord/api/applications", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/applications");
  return {
    ...actual,
    guildCommandCreate: (...args: unknown[]) => mockCreate(...args),
    guildCommandDelete: (...args: unknown[]) => mockDelete(...args),
  };
});

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

jest.mock("@/integrations/_shared/discord/webhooks/signature", () => ({
  verifyDiscordSignature: (...args: unknown[]) => mockVerify(...args),
}));

import { activate } from "@/integrations/discord/triggers/slashCommand/activate";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { deactivate } from "@/integrations/discord/triggers/slashCommand/deactivate";
import "@/integrations/discord/triggers/slashCommand";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { normalizeSlashCommand } from "@/integrations/discord/triggers/slashCommand/normalize";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError, receiveDiscordInteraction } from "@/integrations/discord/triggers/slashCommand/receive";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Slice 3.DISCORD-6 — `discord:slash_command` activation hook.
// Pinned contracts:
// - POSTs Discord's
// `/applications/{app_id}/guilds/{guild_id}/commands` once.
// - Persists `applicationId / guildId / commandName / commandDescription
// / commandId` to `trigger_resources.config`, plus `webhookEnabled: true`.
// - Does NOT set `config.type = "subscription-watch"` (Discord
// commands don't expire; renewal cron must not pick them up).
// - Schema validation runs BEFORE any Discord round trip:
// missing/empty `guildId` / `commandName` / `commandDescription`
// and out-of-spec name regex / length all fail-closed.
// - Missing `DISCORD_APPLICATION_ID` env throws WITHOUT calling
// Discord — same V1-bug-fix shape as GitHub's missing-secret gate.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// Slice 3.DISCORD-6 — `discord:slash_command` deactivation hook.
// Pinned contracts:
// - Calls Discord's
// `DELETE /applications/{app_id}/guilds/{guild_id}/commands/{command_id}`
// when all three ids are present on `trigger.config`.
// - 404 (`NotFoundError`) → swallow silently (best-effort cleanup —
// command may already be gone if operator deleted it manually).
// - Other errors propagate so the lifecycle orchestrator's
// best-effort catch surfaces them in the structured log.
// - Missing any of applicationId / guildId / commandId on the row's
// config → no-op (defensive against partial-activation states).
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Slice 3.DISCORD-6 — `discord:slash_command` module-init registration.
// Pinned contracts (mirrors github/newCommit/index.test.ts shape):
// - Importing the module side-effect-registers BOTH activation and
// deactivation hooks under the (provider="discord",
// eventType="slash_command") key.
// - No subscription-renewal handler is registered for Discord rows —
// Discord slash commands don't expire, and the renewal cron filters
// on `config.type === "subscription-watch"` (intentionally absent
// from this activate's config payload).
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

describe("discord slash_command module-init registration", () => {
  it("registers activation under (provider='discord', eventType='slash_command')", () => {
    expect(findActivation("discord", "slash_command")).not.toBeNull();
  });

  it("registers deactivation under (provider='discord', eventType='slash_command')", () => {
    expect(findDeactivation("discord", "slash_command")).not.toBeNull();
  });

  it("does NOT register a subscription-renewal handler for Discord rows (commands don't expire)", async () => {
    const { findSubscriptionHandler } = await import(
      "@/services/triggers/subscriptionRegistry"
    );
    const fakeDiscordRow = {
      id: "x",
      workflowId: "wf",
      workflowAccountId: "acct-wf",
      userId: "u",
      provider: "discord",
      eventType: "slash_command",
      nodeId: "n",
      // Even if a corrupted row carries the marker, NO Discord-specific
      // subscription handler should match — the activate hook
      // intentionally omits it so the renewal cron can't pick this trigger
      // up.
      config: {
        type: "subscription-watch",
        applicationId: "a",
        guildId: "g",
        commandId: "c",
      },
      providerAccountId: "u",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findSubscriptionHandler(fakeDiscordRow);
    if (handler !== null) {
      expect(handler.id.toLowerCase()).not.toContain("discord");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Slice 3.DISCORD-6 — `discord:slash_command` normalize fn.
// Pinned contracts:
// - `eventId` = Discord interaction id (snowflake). Drives
// `(provider, eventId)` dedup.
// - `provider` / `eventType` set canonically.
// - `accountId` = guild id (slash commands are guild-scoped).
// - Flattens `data.options[]` into `payload.options` as a flat
// `{name: value}` record.
// - Invoker comes from `member.user` (guild context) or `user` (DM
// context).
// - Raw interaction body is forwarded under `payload.interaction`
// with `token` STRIPPED (write-permission credential — must not
// leak to variable picker).
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const SAMPLE: Record<string, unknown> = {
  id: "interaction-snowflake-1",
  application_id: "app-snowflake",
  type: 2,
  token: "SECRET_INTERACTION_TOKEN",
  version: 1,
  guild_id: "guild-snowflake",
  channel_id: "channel-snowflake",
  channel: { id: "channel-snowflake", name: "general" },
  member: {
    user: {
      id: "user-snowflake",
      username: "alice",
      global_name: "Alice",
      discriminator: "0",
    },
    roles: ["role-1"],
    joined_at: "2024-01-01T00:00:00Z",
  },
  data: {
    id: "command-snowflake",
    name: "report",
    type: 1,
    options: [
      { name: "subject", type: 3, value: "weekly" },
      { name: "count", type: 4, value: 5 },
      { name: "include_archived", type: 5, value: false },
    ],
  },
};

describe("normalizeSlashCommand — canonical fields", () => {
  it("sets provider=discord, eventType=slash_command", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.provider).toBe("discord");
    expect(event.eventType).toBe("slash_command");
  });

  it("uses the interaction id as the dedup key (eventId)", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.eventId).toBe("interaction-snowflake-1");
  });

  it("sets accountId to the guild id", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.providerAccountId).toBe("guild-snowflake");
  });

  it("sets occurredAt to a non-empty ISO-8601 string (current time)", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.occurredAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});

describe("normalizeSlashCommand — payload shape", () => {
  it("surfaces commandName + commandId + channelId + channelName + guildId", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.payload.commandName).toBe("report");
    expect(event.payload.commandId).toBe("command-snowflake");
    expect(event.payload.channelId).toBe("channel-snowflake");
    expect(event.payload.channelName).toBe("general");
    expect(event.payload.guildId).toBe("guild-snowflake");
  });

  it("extracts invoker from member.user in guild context", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.payload.userId).toBe("user-snowflake");
    expect(event.payload.userName).toBe("alice");
  });

  it("falls back to body.user when member.user is absent (DM context)", () => {
    const dmBody: Record<string, unknown> = {
      ...SAMPLE,
      member: undefined,
      user: { id: "dm-user", username: "bob" },
    };
    delete dmBody.member;
    const event = normalizeSlashCommand({ body: dmBody });
    expect(event.payload.userId).toBe("dm-user");
    expect(event.payload.userName).toBe("bob");
  });

  it("flattens options[] into {name: value}", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.payload.options).toEqual({
      subject: "weekly",
      count: 5,
      include_archived: false,
    });
  });

  it("returns empty options when data.options is missing", () => {
    const noOpts: Record<string, unknown> = {
      ...SAMPLE,
      data: { id: "cmd", name: "ping", type: 1 },
    };
    const event = normalizeSlashCommand({ body: noOpts });
    expect(event.payload.options).toEqual({});
  });

  it("skips option entries with no name", () => {
    const malformed: Record<string, unknown> = {
      ...SAMPLE,
      data: {
        id: "cmd",
        name: "report",
        type: 1,
        options: [{ name: "ok", type: 3, value: "v" }, { type: 3, value: "x" }],
      },
    };
    const event = normalizeSlashCommand({ body: malformed });
    expect(event.payload.options).toEqual({ ok: "v" });
  });
});

describe("normalizeSlashCommand — security: token stripping", () => {
  it("STRIPS the interaction token from payload.interaction (write-perm credential)", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    const interaction = event.payload.interaction as Record<string, unknown>;
    expect(interaction).toBeDefined();
    expect("token" in interaction).toBe(false);
    // Other fields ride through unchanged.
    expect(interaction.id).toBe("interaction-snowflake-1");
    expect(interaction.data).toBeDefined();
  });

  it("does NOT leak the token via any other top-level payload field", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("SECRET_INTERACTION_TOKEN");
  });
});

describe("normalizeSlashCommand — defensive fallbacks", () => {
  it("falls back to a synthetic eventId when the interaction body has no id", () => {
    const noId: Record<string, unknown> = { ...SAMPLE };
    delete noId.id;
    const event = normalizeSlashCommand({ body: noId });
    expect(event.eventId).toMatch(/^discord-interaction-\d+/);
  });

  it("falls back to accountId='unknown' when guild_id is absent (DM-context safety)", () => {
    const dm: Record<string, unknown> = { ...SAMPLE };
    delete dm.guild_id;
    const event = normalizeSlashCommand({ body: dm });
    expect(event.providerAccountId).toBe("unknown");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Slice 3.DISCORD-6 — `receiveDiscordInteraction` (receive.ts).
// Tests cover the full decision tree:
// - Missing public key env → MissingSecretError
// - Empty body → InvalidSignatureError
// - Bad signature → InvalidSignatureError
// - Verified PING → ReceiveResult.ping
// - Verified non-command interaction → unsupported_interaction
// - Missing query params → unknown_workflow
// - Trigger row missing / wrong provider / wrong eventType → unknown_workflow
// - Guild / commandName config mismatch → unknown_workflow
// - All checks pass → event
// Mocks the trigger-resources repo + signature helper at module
// boundaries. The signature verifier is its own test target — here
// we exercise the receive flow's branching.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

beforeEach(() => {
  mockFindByWorkflowAndNode.mockReset();
  mockVerify.mockReset();
  mockVerify.mockReturnValue({ valid: true });
  process.env.DISCORD_INTERACTIONS_PUBLIC_KEY = "x".repeat(64);
});

afterEach(() => {
  delete process.env.DISCORD_INTERACTIONS_PUBLIC_KEY;
});

function request(body: string, query: string = "?workflowId=wf-1&nodeId=n-1"): Request {
  return new Request(`https://app.example.test/api/webhooks/discord${query}`, {
    method: "POST",
    body,
    headers: {
      "x-signature-ed25519": "a".repeat(128),
      "x-signature-timestamp": "1716480000",
    },
  });
}

const PING_BODY = '{"type":1}';
const COMMAND_BODY = JSON.stringify({
  id: "interaction-1",
  type: 2,
  guild_id: "guild-1",
  channel_id: "channel-1",
  data: { id: "cmd-1", name: "report", type: 1 },
});

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "discord",
  eventType: "slash_command",
  nodeId: "n-1",
  providerAccountId: null,
  config: { guildId: "guild-1", commandName: "report" },
  registeredAt: "2026-05-23T00:00:00Z",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

describe("receiveDiscordInteraction — env + signature guards", () => {
  it("throws MissingSecretError when DISCORD_INTERACTIONS_PUBLIC_KEY is unset", async () => {
    delete process.env.DISCORD_INTERACTIONS_PUBLIC_KEY;
    await expect(receiveDiscordInteraction(request(PING_BODY))).rejects.toThrow(
      MissingSecretError,
    );
  });

  it("throws InvalidSignatureError on empty body", async () => {
    await expect(receiveDiscordInteraction(request(""))).rejects.toThrow(
      InvalidSignatureError,
    );
  });

  it("throws InvalidSignatureError on signature mismatch", async () => {
    mockVerify.mockReturnValueOnce({ valid: false, reason: "mismatch" });
    await expect(
      receiveDiscordInteraction(request(PING_BODY)),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when JSON body parsing fails post-verification", async () => {
    await expect(
      receiveDiscordInteraction(request("not-json")),
    ).rejects.toThrow(/valid JSON/);
  });
});

describe("receiveDiscordInteraction — PING handshake", () => {
  it("returns kind:'ping' for a verified PING (no trigger lookup)", async () => {
    const result = await receiveDiscordInteraction(request(PING_BODY));
    expect(result).toEqual({ kind: "ping" });
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("PING does NOT require query params (Developer Portal verification has no workflow context)", async () => {
    const result = await receiveDiscordInteraction(
      request(PING_BODY, "?ignored=1"),
    );
    expect(result).toEqual({ kind: "ping" });
  });
});

describe("receiveDiscordInteraction — unsupported interactions", () => {
  it("returns unsupported_interaction for interaction type 3 (message component)", async () => {
    const body = JSON.stringify({ id: "i", type: 3 });
    const result = await receiveDiscordInteraction(request(body));
    expect(result).toEqual({
      kind: "unsupported_interaction",
      interactionType: 3,
    });
  });

  it("returns unsupported_interaction for interaction type 4 (autocomplete)", async () => {
    const body = JSON.stringify({ id: "i", type: 4 });
    const result = await receiveDiscordInteraction(request(body));
    expect(result).toEqual({
      kind: "unsupported_interaction",
      interactionType: 4,
    });
  });

  it("returns unsupported_interaction when APPLICATION_COMMAND has non-CHAT_INPUT type", async () => {
    // type=2 (APPLICATION_COMMAND) but data.type=2 (USER context menu) — out of scope.
    const body = JSON.stringify({
      id: "i",
      type: 2,
      data: { id: "c", name: "x", type: 2 },
    });
    const result = await receiveDiscordInteraction(request(body));
    expect(result).toEqual({
      kind: "unsupported_interaction",
      interactionType: 2,
    });
  });
});

describe("receiveDiscordInteraction — strict-direct-lookup", () => {
  it("returns unknown_workflow when query params are missing", async () => {
    const result = await receiveDiscordInteraction(
      request(COMMAND_BODY, "?bogus=1"),
    );
    expect(result).toEqual({ kind: "unknown_workflow" });
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unknown_workflow when trigger row not found", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const result = await receiveDiscordInteraction(request(COMMAND_BODY));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when trigger row provider != discord", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow,
      provider: "slack",
    });
    const result = await receiveDiscordInteraction(request(COMMAND_BODY));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when trigger row eventType != slash_command", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow,
      eventType: "new_message",
    });
    const result = await receiveDiscordInteraction(request(COMMAND_BODY));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when row's guildId doesn't match interaction guild_id", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow,
      config: { guildId: "different-guild", commandName: "report" },
    });
    const result = await receiveDiscordInteraction(request(COMMAND_BODY));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when row's commandName doesn't match interaction name (rename mid-flight)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow,
      config: { guildId: "guild-1", commandName: "different-command" },
    });
    const result = await receiveDiscordInteraction(request(COMMAND_BODY));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });
});

describe("receiveDiscordInteraction — happy path dispatch", () => {
  it("returns kind:'event' with a normalized TriggerEvent on full match", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow);
    const result = await receiveDiscordInteraction(request(COMMAND_BODY));
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return; // type guard
    expect(result.event.provider).toBe("discord");
    expect(result.event.eventType).toBe("slash_command");
    expect(result.event.eventId).toBe("interaction-1");
    expect(result.event.providerAccountId).toBe("guild-1");
    expect(result.event.payload.commandName).toBe("report");
  });
});

});

/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-6 — `receiveDiscordInteraction` (receive.ts).
 *
 * Tests cover the full decision tree:
 *   - Missing public key env → MissingSecretError
 *   - Empty body → InvalidSignatureError
 *   - Bad signature → InvalidSignatureError
 *   - Verified PING → ReceiveResult.ping
 *   - Verified non-command interaction → unsupported_interaction
 *   - Missing query params → unknown_workflow
 *   - Trigger row missing / wrong provider / wrong eventType → unknown_workflow
 *   - Guild / commandName config mismatch → unknown_workflow
 *   - All checks pass → event
 *
 * Mocks the trigger-resources repo + signature helper at module
 * boundaries. The signature verifier is its own test target — here
 * we exercise the receive flow's branching.
 */
const mockFindByWorkflowAndNode = jest.fn();
const mockVerify = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

jest.mock("@/integrations/_shared/discord/webhooks/signature", () => ({
  verifyDiscordSignature: (...args: unknown[]) => mockVerify(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveDiscordInteraction,
} from "@/integrations/discord/triggers/slashCommand/receive";

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

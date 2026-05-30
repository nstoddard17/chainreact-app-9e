/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/discord.
 *
 * Mocks receive + dispatch so the route's status-code + body-shape
 * mapping is exercised in isolation. Receive helper + signature
 * verifier have their own dedicated test files.
 *
 * Discord's interactions wire contract differs from GitHub / Stripe
 * — every 2xx response carries an interaction-reply JSON body. The
 * route MUST return:
 *   - `{type: 1}` for PING (PONG handshake — registers endpoint URL
 *     in the Developer Portal).
 *   - `{type: 4, data: {content, flags: 64}}` ephemeral for command
 *     interactions (success / unknown_workflow / unsupported).
 *
 * Non-2xx bodies are not surfaced to the user — they're for operator
 * diagnostics. Discord retries on 5xx; on 401 the endpoint URL gets
 * auto-disabled if mismatches persist.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/discord/triggers/slashCommand/receive", () => {
  const actual = jest.requireActual(
    "@/integrations/discord/triggers/slashCommand/receive",
  );
  return {
    ...actual,
    receiveDiscordInteraction: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import — registration tests cover
// that path directly.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError } from "@/integrations/discord/triggers/slashCommand/receive";
import { GET, POST } from "@/app/api/webhooks/discord/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/discord?workflowId=wf-1&nodeId=n-1",
    { method: "POST", body: '{"type":1}' },
  );
}

describe("/api/webhooks/discord — error mapping", () => {
  it("returns 503 on MissingSecretError (V2 fail-closed on missing public key env)", async () => {
    mockReceive.mockRejectedValueOnce(new MissingSecretError());
    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/public key/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on InvalidSignatureError with 'invalid signature' body", async () => {
    mockReceive.mockRejectedValueOnce(
      new InvalidSignatureError("signature mismatch"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid signature");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected receive error", async () => {
    mockReceive.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/discord — PING handshake", () => {
  it("returns 200 with {type: 1} (PONG) for PING (registers endpoint URL as healthy)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "ping" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 1 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/discord — non-dispatch acks", () => {
  it("returns 200 ephemeral reply on unknown_workflow", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toMatch(/isn't wired/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 ephemeral reply on unsupported_interaction", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_interaction",
      interactionType: 3,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toMatch(/supported/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/discord — dispatch", () => {
  const event = {
    provider: "discord",
    eventType: "slash_command",
    eventId: "interaction-1",
    occurredAt: "2026-05-23T00:00:00Z",
    providerAccountId: "guild-1",
    payload: { commandName: "report" },
  };

  it("dispatches the event and replies with ephemeral 'Workflow triggered.'", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "event", event });
    mockDispatch.mockResolvedValueOnce({
      matched: 1,
      enqueued: 1,
      duplicate: false,
      dedupOutage: false,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toBe("Workflow triggered.");
  });

  it("still 200-replies on duplicate delivery (dedup blocked, no enqueue) — Discord must not retry", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "event", event });
    mockDispatch.mockResolvedValueOnce({
      matched: 0,
      enqueued: 0,
      duplicate: true,
      dedupOutage: false,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it("returns 500 on dispatch failure (Discord retries 5xx)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "event", event });
    mockDispatch.mockRejectedValueOnce(new Error("dispatch boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/discord GET — service info", () => {
  it("returns service info JSON (no GET-time challenge)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("discord interactions endpoint");
    expect(json.description).toMatch(/X-Signature-Ed25519/);
    expect(json.description).toMatch(/DISCORD_INTERACTIONS_PUBLIC_KEY/);
    expect(json.description).toMatch(/PING/);
  });
});

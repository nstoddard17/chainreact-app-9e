/**
 * @jest-environment node
 *
 * Tests for the shared Monday webhook receive helper
 * (`triggers/_shared/receive.ts`) — Slice 3.MONDAY-7. Uses the REAL
 * signature verifier (env-driven) + mocks the trigger-row lookup.
 */
import { createHmac } from "node:crypto";

const mockFind = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) => mockFind(...args),
}));

import {
  MissingSecretError,
  receiveMondayWebhook,
} from "@/integrations/monday/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

const SECRET = "monday-test-secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function makeRequest(
  body: string,
  opts: { sig?: string | null; query?: string } = {},
): Request {
  const query = opts.query ?? "?workflowId=wf&nodeId=n";
  const headers: Record<string, string> = {};
  if (opts.sig) headers["x-monday-signature"] = opts.sig;
  return new Request(`https://app.test/api/webhooks/monday${query}`, {
    method: "POST",
    headers,
    body,
  });
}

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf",
    workflowAccountId: "acct-wf",
    userId: "user-1",
    provider: "monday",
    eventType: "new_item",
    nodeId: "n",
    config: { boardId: "b-1" },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

beforeEach(() => {
  mockFind.mockReset();
  process.env.MONDAY_SIGNING_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.MONDAY_SIGNING_SECRET;
});

describe("receiveMondayWebhook — challenge handshake", () => {
  it("echoes the challenge BEFORE signature verification (no header needed)", async () => {
    const body = JSON.stringify({ challenge: "abc-123" });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: null }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "challenge", challenge: "abc-123" });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("echoes the challenge even when MONDAY_SIGNING_SECRET is unset (handshake must not fail closed)", async () => {
    delete process.env.MONDAY_SIGNING_SECRET;
    const body = JSON.stringify({ challenge: "xyz" });
    const result = await receiveMondayWebhook({
      request: makeRequest(body),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "challenge", challenge: "xyz" });
  });
});

describe("receiveMondayWebhook — signature (events fail closed)", () => {
  it("throws MissingSecretError when the secret env is unset on a real event", async () => {
    delete process.env.MONDAY_SIGNING_SECRET;
    const body = JSON.stringify({ event: { type: "create_item" } });
    await expect(
      receiveMondayWebhook({
        request: makeRequest(body, { sig: "deadbeef" }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(MissingSecretError);
  });

  it("throws InvalidSignatureError on a bad signature", async () => {
    const body = JSON.stringify({ event: { type: "create_item" } });
    await expect(
      receiveMondayWebhook({
        request: makeRequest(body, { sig: sign("a different body") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("throws InvalidSignatureError when the signature header is absent", async () => {
    const body = JSON.stringify({ event: { type: "create_item" } });
    await expect(
      receiveMondayWebhook({
        request: makeRequest(body, { sig: null }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies over the RAW body bytes (re-serialized body fails)", async () => {
    // Signature computed over the spaced body; we deliver the stripped
    // re-serialization → bytes differ → verification fails.
    const body = '{ "event": { "type": "create_item", "boardId": 1 } }';
    const sigForRaw = sign(body);
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    await expect(
      receiveMondayWebhook({
        request: makeRequest(reserialized, { sig: sigForRaw }),
        rawBody: reserialized,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("receiveMondayWebhook — routing", () => {
  it("returns unknown_workflow when query params are missing", async () => {
    const body = JSON.stringify({ event: { type: "create_item", boardId: 1, pulseId: 2 } });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: sign(body), query: "" }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when no trigger row matches", async () => {
    mockFind.mockResolvedValueOnce(null);
    const body = JSON.stringify({ event: { type: "create_item", boardId: 1, pulseId: 2 } });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when the row is not a monday row", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ provider: "trello" }));
    const body = JSON.stringify({ event: { type: "create_item", boardId: 1, pulseId: 2 } });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unsupported_event for an unrecognized Monday event type", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ event: { type: "delete_pulse" } });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unsupported_event", eventType: "delete_pulse" });
  });

  it("returns event_type_mismatch when the inbound event maps to a different trigger", async () => {
    // Row is a new_item trigger; inbound is a column change.
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "new_item" }));
    const body = JSON.stringify({ event: { type: "change_column_value", boardId: 1, pulseId: 2 } });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toMatchObject({
      kind: "event_type_mismatch",
      triggerEventType: "new_item",
      inboundType: "column_changed",
    });
  });

  it("dispatches a valid event (legacy create_pulse maps to new_item)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "new_item" }));
    const body = JSON.stringify({
      event: {
        type: "create_pulse",
        boardId: 1,
        pulseId: 2,
        pulseName: "Task",
        triggerTime: "2026-05-24T10:00:00Z",
      },
    });
    const result = await receiveMondayWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      provider: "monday",
      eventType: "new_item",
      accountId: "1",
      payload: { itemId: "2", itemName: "Task" },
    });
  });
});

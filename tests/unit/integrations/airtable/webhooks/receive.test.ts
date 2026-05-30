/**
 * @jest-environment node
 *
 * Receive helper tests — exercises the signature-verification paths,
 * unknown-webhook quiet-ack path, and the success path that delegates
 * to `pull`. The signature verifier itself + `pull` are tested
 * independently; this file focuses on the receive-helper glue.
 */
import { createHmac, randomBytes } from "node:crypto";

const mockListByConfigContains = jest.fn();
const mockPull = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) =>
    mockListByConfigContains(...args),
  updateConfig: jest.fn(),
}));

jest.mock("@/integrations/airtable/triggers/recordChanged/pull", () => ({
  pull: (...args: unknown[]) => mockPull(...args),
}));

import { receiveAirtableWebhook } from "@/integrations/airtable/webhooks/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockPull.mockReset();
});

const KEY_BYTES = randomBytes(32);
const MAC_SECRET_BASE64 = KEY_BYTES.toString("base64");

function signedRequest(rawBody: string, signature: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-airtable-content-mac"] = signature;
  return new Request("https://app.example.test/api/webhooks/airtable", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function validSignatureFor(body: string): string {
  return `hmac-sha256=${createHmac("sha256", KEY_BYTES).update(body, "utf8").digest("hex")}`;
}

const PING_BODY = JSON.stringify({
  base: { id: "appBASE" },
  webhook: { id: "achWEBHOOK" },
  timestamp: "2026-05-09T12:00:00.000Z",
});

const TRIGGER_ROW = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "airtable",
  eventType: "record_changed",
  nodeId: "n-1",
  config: {
    type: "subscription-watch",
    baseId: "appBASE",
    webhookId: "achWEBHOOK",
    macSecretBase64: MAC_SECRET_BASE64,
  },
  providerAccountId: "usrXXX",
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("receiveAirtableWebhook — signature verification", () => {
  it("accepts a valid signature and returns events from pull", async () => {
    mockListByConfigContains.mockResolvedValueOnce([TRIGGER_ROW]);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "airtable",
          eventType: "record_changed",
          eventId: "achWEBHOOK:tblA:rec1:created:1",
          occurredAt: "2026-05-09T11:50:00.000Z",
          providerAccountId: "usrXXX",
          payload: { eventType: "created" },
        },
      ],
      cursorAdvanced: true,
    });

    const result = await receiveAirtableWebhook(
      signedRequest(PING_BODY, validSignatureFor(PING_BODY)),
    );

    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
    }
    expect(mockPull).toHaveBeenCalledTimes(1);
  });

  it("throws InvalidSignatureError on signature mismatch", async () => {
    mockListByConfigContains.mockResolvedValueOnce([TRIGGER_ROW]);
    await expect(
      receiveAirtableWebhook(
        signedRequest(PING_BODY, "hmac-sha256=" + "f".repeat(64)),
      ),
    ).rejects.toThrow(InvalidSignatureError);
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("throws InvalidSignatureError when X-Airtable-Content-MAC header is missing", async () => {
    mockListByConfigContains.mockResolvedValueOnce([TRIGGER_ROW]);
    await expect(
      receiveAirtableWebhook(signedRequest(PING_BODY, null)),
    ).rejects.toThrow(/X-Airtable-Content-MAC header missing/);
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("throws InvalidSignatureError when body is malformed JSON", async () => {
    await expect(
      receiveAirtableWebhook(
        signedRequest("{not json", "hmac-sha256=anything"),
      ),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("throws InvalidSignatureError when body is empty", async () => {
    await expect(
      receiveAirtableWebhook(signedRequest("", "hmac-sha256=anything")),
    ).rejects.toThrow(/empty body/);
  });

  it("throws InvalidSignatureError when ping body lacks base.id or webhook.id", async () => {
    const bad = JSON.stringify({ webhook: { id: "achWEBHOOK" } });
    await expect(
      receiveAirtableWebhook(signedRequest(bad, validSignatureFor(bad))),
    ).rejects.toThrow(/missing base\.id or webhook\.id/);
  });

  it("throws InvalidSignatureError when trigger row has no macSecretBase64 (corrupt state)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      {
        ...TRIGGER_ROW,
        config: { ...TRIGGER_ROW.config, macSecretBase64: undefined },
      },
    ]);
    await expect(
      receiveAirtableWebhook(
        signedRequest(PING_BODY, validSignatureFor(PING_BODY)),
      ),
    ).rejects.toThrow(/missing macSecretBase64/);
  });
});

describe("receiveAirtableWebhook — unknown webhook", () => {
  it("returns kind: 'unknown_webhook' (quiet ack) when no trigger matches the webhookId", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);
    const result = await receiveAirtableWebhook(
      signedRequest(PING_BODY, validSignatureFor(PING_BODY)),
    );
    expect(result).toEqual({ kind: "unknown_webhook" });
    expect(mockPull).not.toHaveBeenCalled();
  });
});

describe("receiveAirtableWebhook — pull integration", () => {
  it("threads body.timestamp into pull as notificationOccurredAt when present", async () => {
    mockListByConfigContains.mockResolvedValueOnce([TRIGGER_ROW]);
    mockPull.mockResolvedValueOnce({ events: [], cursorAdvanced: false });

    await receiveAirtableWebhook(
      signedRequest(PING_BODY, validSignatureFor(PING_BODY)),
    );

    expect(mockPull.mock.calls[0]![1]).toBe("2026-05-09T12:00:00.000Z");
  });

  it("falls back to wall-clock when timestamp is absent from ping", async () => {
    const bodyNoTs = JSON.stringify({
      base: { id: "appBASE" },
      webhook: { id: "achWEBHOOK" },
    });
    mockListByConfigContains.mockResolvedValueOnce([TRIGGER_ROW]);
    mockPull.mockResolvedValueOnce({ events: [], cursorAdvanced: false });

    await receiveAirtableWebhook(
      signedRequest(bodyNoTs, validSignatureFor(bodyNoTs)),
    );

    const arg = mockPull.mock.calls[0]![1] as string;
    // ISO-8601 from new Date().toISOString().
    expect(arg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

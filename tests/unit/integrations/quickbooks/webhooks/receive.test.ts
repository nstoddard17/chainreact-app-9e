/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — app-level webhook receive: intuit-signature
 * verification (base64 HMAC-SHA256 over the raw body, keyed with the
 * portal verifier token) + compact eventNotifications parsing.
 */
import { createHmac } from "node:crypto";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveQuickbooksWebhook,
} from "@/integrations/quickbooks/webhooks/receive";

const VERIFIER = "test-verifier-token";

beforeEach(() => {
  process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = VERIFIER;
});

afterEach(() => {
  delete process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
});

function sign(rawBody: string, key: string = VERIFIER): string {
  return createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
}

function makeRequest(rawBody: string, signature: string | null): Request {
  const headers = new Headers();
  if (signature !== null) headers.set("intuit-signature", signature);
  return new Request("https://app.example.test/api/webhooks/quickbooks", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

const SINGLE_EVENT_BODY = JSON.stringify({
  eventNotifications: [
    {
      realmId: "913035",
      dataChangeEvent: {
        entities: [
          {
            name: "Invoice",
            id: "145",
            operation: "Create",
            lastUpdated: "2026-07-07T12:00:00.000Z",
          },
        ],
      },
    },
  ],
});

describe("signature verification", () => {
  it("accepts a valid signature", () => {
    const result = receiveQuickbooksWebhook({
      request: makeRequest(SINGLE_EVENT_BODY, sign(SINGLE_EVENT_BODY)),
      rawBody: SINGLE_EVENT_BODY,
    });
    expect(result.events).toHaveLength(1);
  });

  it("rejects a forged signature with InvalidSignatureError", () => {
    expect(() =>
      receiveQuickbooksWebhook({
        request: makeRequest(
          SINGLE_EVENT_BODY,
          sign(SINGLE_EVENT_BODY, "wrong-key"),
        ),
        rawBody: SINGLE_EVENT_BODY,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("rejects a missing signature header", () => {
    expect(() =>
      receiveQuickbooksWebhook({
        request: makeRequest(SINGLE_EVENT_BODY, null),
        rawBody: SINGLE_EVENT_BODY,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("rejects a signature over a DIFFERENT body (tamper detection)", () => {
    const tampered = SINGLE_EVENT_BODY.replace("145", "146");
    expect(() =>
      receiveQuickbooksWebhook({
        request: makeRequest(tampered, sign(SINGLE_EVENT_BODY)),
        rawBody: tampered,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("fails CLOSED with MissingSecretError when the verifier env is unset", () => {
    delete process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    expect(() =>
      receiveQuickbooksWebhook({
        request: makeRequest(SINGLE_EVENT_BODY, sign(SINGLE_EVENT_BODY)),
        rawBody: SINGLE_EVENT_BODY,
      }),
    ).toThrow(MissingSecretError);
  });
});

describe("parsing", () => {
  it("flattens one entity event with realm scope", () => {
    const result = receiveQuickbooksWebhook({
      request: makeRequest(SINGLE_EVENT_BODY, sign(SINGLE_EVENT_BODY)),
      rawBody: SINGLE_EVENT_BODY,
    });
    expect(result.events).toEqual([
      {
        realmId: "913035",
        entity: "Invoice",
        operation: "Create",
        entityId: "145",
        lastUpdated: "2026-07-07T12:00:00.000Z",
      },
    ]);
    expect(result.malformedSkipped).toBe(0);
  });

  it("unwraps batched notifications across MULTIPLE realms", () => {
    const body = JSON.stringify({
      eventNotifications: [
        {
          realmId: "111",
          dataChangeEvent: {
            entities: [
              { name: "Customer", id: "1", operation: "Create" },
              { name: "Payment", id: "9", operation: "Update" },
            ],
          },
        },
        {
          realmId: "222",
          dataChangeEvent: {
            entities: [{ name: "Invoice", id: "7", operation: "Create" }],
          },
        },
      ],
    });
    const result = receiveQuickbooksWebhook({
      request: makeRequest(body, sign(body)),
      rawBody: body,
    });
    expect(result.events).toHaveLength(3);
    expect(result.events.map((e) => e.realmId)).toEqual(["111", "111", "222"]);
  });

  it("skips malformed entries (missing realm/name/id/operation) without failing the delivery", () => {
    const body = JSON.stringify({
      eventNotifications: [
        {
          // no realmId
          dataChangeEvent: {
            entities: [{ name: "Invoice", id: "7", operation: "Create" }],
          },
        },
        {
          realmId: "111",
          dataChangeEvent: {
            entities: [
              { name: "Invoice", operation: "Create" }, // no id
              { name: "Customer", id: "2", operation: "Create" },
            ],
          },
        },
      ],
    });
    const result = receiveQuickbooksWebhook({
      request: makeRequest(body, sign(body)),
      rawBody: body,
    });
    expect(result.events).toHaveLength(1);
    expect(result.malformedSkipped).toBe(2);
  });

  it("throws a plain error on a non-JSON body (route maps to 500)", () => {
    const body = "not-json";
    expect(() =>
      receiveQuickbooksWebhook({
        request: makeRequest(body, sign(body)),
        rawBody: body,
      }),
    ).toThrow(/not valid JSON/);
  });
});

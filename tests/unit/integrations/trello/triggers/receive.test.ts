/**
 * @jest-environment node
 *
 * End-to-end receive tests — covers query parsing, lookup, signature
 * verification, classification, and event-type filtering.
 */
import { createHmac } from "node:crypto";

const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

import {
  receiveTrelloWebhook,
  MissingSecretError,
} from "@/integrations/trello/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

const SECRET = "trello-client-secret-test";
const CALLBACK_URL =
  "https://app.example.test/api/webhooks/trello?workflowId=wf-1&nodeId=node-1";

function sign(rawBody: string, callbackURL: string, secret: string): string {
  return createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .update(callbackURL, "utf8")
    .digest("base64");
}

function makeRequest(rawBody: string, sigHeader: string): Request {
  return new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "x-trello-webhook": sigHeader, "content-type": "application/json" },
    body: rawBody,
  });
}

function makeTriggerRow(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    nodeId: "node-1",
    provider: "trello",
    eventType: "new_card",
    config: {
      callbackURL: CALLBACK_URL,
      eventType: "new_card",
      boardId: "b1",
      webhookId: "wh-1",
      ...config,
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  process.env.TRELLO_CLIENT_SECRET = SECRET;
  mockFindByWorkflowAndNode.mockReset();
});

afterEach(() => {
  delete process.env.TRELLO_CLIENT_SECRET;
});

const CREATE_CARD_BODY = JSON.stringify({
  action: {
    id: "act-1",
    type: "createCard",
    date: "2026-05-11T00:00:00Z",
    data: {
      card: { id: "c1", name: "Card A", shortLink: "abc" },
      board: { id: "b1", name: "Board" },
      list: { id: "l1", name: "Backlog" },
    },
    memberCreator: { id: "m1", fullName: "User" },
  },
});

describe("receiveTrelloWebhook — query handling", () => {
  it("returns unknown_workflow when query params are missing", async () => {
    const req = new Request("http://x/api/webhooks/trello", {
      method: "POST",
      body: "{}",
    });
    const result = await receiveTrelloWebhook({ request: req, rawBody: "{}" });
    expect(result.kind).toBe("unknown_workflow");
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unknown_workflow when no trigger row matches", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const result = await receiveTrelloWebhook({
      request: makeRequest(CREATE_CARD_BODY, "sig"),
      rawBody: CREATE_CARD_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when the trigger row's provider is not trello", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...makeTriggerRow({}),
      provider: "github",
    });
    const result = await receiveTrelloWebhook({
      request: makeRequest(CREATE_CARD_BODY, "sig"),
      rawBody: CREATE_CARD_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when callbackURL is missing from config", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...makeTriggerRow({}),
      config: { eventType: "new_card", boardId: "b1", webhookId: "wh-1" },
    });
    const result = await receiveTrelloWebhook({
      request: makeRequest(CREATE_CARD_BODY, "sig"),
      rawBody: CREATE_CARD_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });
});

describe("receiveTrelloWebhook — signature failures", () => {
  beforeEach(() => {
    mockFindByWorkflowAndNode.mockResolvedValue(makeTriggerRow({}));
  });

  it("throws MissingSecretError when TRELLO_CLIENT_SECRET is missing", async () => {
    delete process.env.TRELLO_CLIENT_SECRET;
    await expect(
      receiveTrelloWebhook({
        request: makeRequest(CREATE_CARD_BODY, "sig"),
        rawBody: CREATE_CARD_BODY,
      }),
    ).rejects.toBeInstanceOf(MissingSecretError);
  });

  it("throws InvalidSignatureError on invalid signature (mismatch)", async () => {
    const wrongSig = sign(CREATE_CARD_BODY, CALLBACK_URL, "other-secret");
    await expect(
      receiveTrelloWebhook({
        request: makeRequest(CREATE_CARD_BODY, wrongSig),
        rawBody: CREATE_CARD_BODY,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on missing signature header", async () => {
    const req = new Request(CALLBACK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: CREATE_CARD_BODY,
    });
    await expect(
      receiveTrelloWebhook({ request: req, rawBody: CREATE_CARD_BODY }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on malformed signature", async () => {
    await expect(
      receiveTrelloWebhook({
        request: makeRequest(CREATE_CARD_BODY, "!!!not-base64@@@"),
        rawBody: CREATE_CARD_BODY,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when body is invalid JSON despite a verified signature", async () => {
    const garbage = "not-json{";
    const sig = sign(garbage, CALLBACK_URL, SECRET);
    await expect(
      receiveTrelloWebhook({
        request: makeRequest(garbage, sig),
        rawBody: garbage,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("receiveTrelloWebhook — happy path", () => {
  it("dispatches a valid createCard event when trigger matches", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTriggerRow({ eventType: "new_card" }),
    );
    const sig = sign(CREATE_CARD_BODY, CALLBACK_URL, SECRET);
    const result = await receiveTrelloWebhook({
      request: makeRequest(CREATE_CARD_BODY, sig),
      rawBody: CREATE_CARD_BODY,
    });
    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventType).toBe("trello.card.created");
      expect(result.events[0]!.eventId).toBe("act-1");
    }
  });
});

describe("receiveTrelloWebhook — skip paths", () => {
  it("event_type_mismatch when trigger expects card_archived but payload is createCard", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTriggerRow({ eventType: "card_archived" }),
    );
    const sig = sign(CREATE_CARD_BODY, CALLBACK_URL, SECRET);
    const result = await receiveTrelloWebhook({
      request: makeRequest(CREATE_CARD_BODY, sig),
      rawBody: CREATE_CARD_BODY,
    });
    expect(result.kind).toBe("event_type_mismatch");
  });

  it("unsupported_event when action.type is not in the known set", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTriggerRow({}));
    const body = JSON.stringify({
      action: { id: "act-x", type: "deleteCard", date: "2026-05-11T00:00:00Z" },
    });
    const sig = sign(body, CALLBACK_URL, SECRET);
    const result = await receiveTrelloWebhook({
      request: makeRequest(body, sig),
      rawBody: body,
    });
    expect(result.kind).toBe("unsupported_event");
  });

  it("board_mismatch when inbound board id differs from trigger's stored boardId", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTriggerRow({ boardId: "b1" }),
    );
    const body = JSON.stringify({
      action: {
        id: "act-1",
        type: "createCard",
        date: "2026-05-11T00:00:00Z",
        data: {
          card: { id: "c1" },
          board: { id: "b2" },
        },
      },
    });
    const sig = sign(body, CALLBACK_URL, SECRET);
    const result = await receiveTrelloWebhook({
      request: makeRequest(body, sig),
      rawBody: body,
    });
    expect(result.kind).toBe("board_mismatch");
  });

  it("dedup key on TriggerEvent is the Trello action id (stable across retries)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTriggerRow({ eventType: "new_card" }),
    );
    const sig = sign(CREATE_CARD_BODY, CALLBACK_URL, SECRET);
    const result = await receiveTrelloWebhook({
      request: makeRequest(CREATE_CARD_BODY, sig),
      rawBody: CREATE_CARD_BODY,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.eventId).toBe("act-1");
  });
});

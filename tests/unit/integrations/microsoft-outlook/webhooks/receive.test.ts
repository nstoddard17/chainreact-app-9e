/**
 * @jest-environment node
 */
const mockListByConfigContains = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockGetMessage = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) =>
    mockListByConfigContains(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/getMessage", () => ({
  getMessage: (...args: unknown[]) => mockGetMessage(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { receiveOutlookWebhook } from "@/integrations/microsoft-outlook/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockGetActiveForExecution.mockReset();
  mockRefreshAndRetry.mockReset();
  mockGetMessage.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "microsoft-outlook",
  eventType: "new_email",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "deadbeef",
    resource: "/me/messages",
  },
  accountId: "alice@contoso.com",
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "microsoft-outlook",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function makeRequest(opts: {
  url?: string;
  method?: string;
  contentType?: string;
  body?: string;
}): Request {
  return new Request(opts.url ?? "https://app.example.test/api/webhooks/microsoft-outlook", {
    method: opts.method ?? "POST",
    headers: opts.contentType
      ? { "Content-Type": opts.contentType }
      : { "Content-Type": "application/json" },
    body: opts.body,
  });
}

const SAMPLE_GRAPH_MESSAGE = {
  id: "msg-1",
  conversationId: "conv-1",
  subject: "Hello",
  bodyPreview: "Hi",
  body: { contentType: "text", content: "Hi there" },
  from: { emailAddress: { name: "Bob", address: "bob@x.com" } },
  toRecipients: [
    { emailAddress: { name: "Alice", address: "alice@contoso.com" } },
  ],
  receivedDateTime: "2026-05-08T11:00:00Z",
  hasAttachments: false,
  importance: "normal",
  webLink: "https://outlook.office.com/...",
};

describe("receiveOutlookWebhook — validation handshake", () => {
  it("returns the validation token from ?validationToken= query", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook?validationToken=foo-bar",
    });

    const result = await receiveOutlookWebhook(req);

    expect(result).toEqual({ kind: "validation", token: "foo-bar" });
  });

  it("accepts the legacy ?validationtoken= (lowercase) variant", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook?validationtoken=lc-token",
    });
    const result = await receiveOutlookWebhook(req);
    expect(result).toEqual({ kind: "validation", token: "lc-token" });
  });

  it("returns the body as token when content-type is text/plain (alternate Microsoft format)", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "validation-body-token",
    });

    const result = await receiveOutlookWebhook(req);

    expect(result).toEqual({
      kind: "validation",
      token: "validation-body-token",
    });
    // Critical: validation must NOT do DB I/O — Microsoft expects <10s response.
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockGetMessage).not.toHaveBeenCalled();
  });

  it("does NOT treat empty text/plain bodies as validation requests", async () => {
    // An empty plaintext body would normally throw on JSON.parse anyway —
    // make sure we don't accidentally echo "" as a validation token.
    const req = makeRequest({
      contentType: "text/plain",
      body: "   ",
    });

    await expect(receiveOutlookWebhook(req)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });
});

describe("receiveOutlookWebhook — notifications", () => {
  it("looks up trigger by subscriptionId, verifies clientState, fetches message, and returns normalized event", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resource: "users/alice@contoso.com/messages/msg-1",
            resourceData: { id: "msg-1", "@odata.type": "#Microsoft.Graph.Message" },
          },
        ],
      }),
    });

    const result = await receiveOutlookWebhook(req);

    expect(mockListByConfigContains).toHaveBeenCalledWith({
      subscriptionId: "sub-1",
    });
    expect(mockGetMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msg-1" }),
    );
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.provider).toBe("microsoft-outlook");
    expect(result.events[0]!.eventType).toBe("new_email");
    expect(result.events[0]!.eventId).toBe("sub-1:msg-1:created");
    expect(result.events[0]!.accountId).toBe("alice@contoso.com");
  });

  it("skips notifications whose subscriptionId has no matching trigger row (deactivated workflow)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "stale-sub",
            clientState: "x",
            changeType: "created",
            resourceData: { id: "msg" },
          },
        ],
      }),
    });

    const result = await receiveOutlookWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockGetMessage).not.toHaveBeenCalled();
  });

  it("skips notifications with mismatched clientState (never throws — avoid probing exposure)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "WRONG",
            changeType: "created",
            resourceData: { id: "msg-1" },
          },
        ],
      }),
    });

    const result = await receiveOutlookWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockGetMessage).not.toHaveBeenCalled();
  });

  it("skips notifications when getMessage throws NotFoundError (deleted between notification and fetch)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockRejectedValueOnce(new NotFoundError("message msg-1"));

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: { id: "msg-1" },
          },
        ],
      }),
    });

    const result = await receiveOutlookWebhook(req);

    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("propagates non-NotFound errors from getMessage (route maps to 5xx so Microsoft retries)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockRejectedValueOnce(
      new Error("Microsoft Graph me/messages/{id} failed: HTTP 503"),
    );

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: { id: "msg-1" },
          },
        ],
      }),
    });

    await expect(receiveOutlookWebhook(req)).rejects.toThrow(/HTTP 503/);
  });

  it("processes a batch of multiple notifications and returns a flat events list", async () => {
    mockListByConfigContains.mockResolvedValue([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValue(baseIntegration);
    mockGetMessage
      .mockResolvedValueOnce({ ...SAMPLE_GRAPH_MESSAGE, id: "msg-1" })
      .mockResolvedValueOnce({ ...SAMPLE_GRAPH_MESSAGE, id: "msg-2" });

    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: { id: "msg-1" },
          },
          {
            subscriptionId: "sub-1",
            clientState: "deadbeef",
            changeType: "created",
            resourceData: { id: "msg-2" },
          },
        ],
      }),
    });

    const result = await receiveOutlookWebhook(req);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events.map((e) => e.eventId)).toEqual([
      "sub-1:msg-1:created",
      "sub-1:msg-2:created",
    ]);
  });

  it("returns kind=events with empty list when value: [] (Microsoft sends empty batches)", async () => {
    const req = makeRequest({ body: JSON.stringify({ value: [] }) });
    const result = await receiveOutlookWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("throws InvalidSignatureError on malformed JSON body", async () => {
    const req = makeRequest({ body: "{not json" });
    await expect(receiveOutlookWebhook(req)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it("skips notifications with missing subscriptionId or messageId", async () => {
    const req = makeRequest({
      body: JSON.stringify({
        value: [
          {
            // Neither subscriptionId nor messageId — malformed
            clientState: "x",
            changeType: "created",
            resourceData: {},
          },
        ],
      }),
    });

    const result = await receiveOutlookWebhook(req);
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
  });
});

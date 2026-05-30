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
  workflowAccountId: "acct-1",
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
  providerAccountId: "alice@contoso.com",
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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
    expect(result.events[0]!.providerAccountId).toBe("alice@contoso.com");
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

// ── Outlook Mail 2.3 Commit 2 — new_email filter expansion (D-OM3) ───────

describe("receiveOutlookWebhook — new_email filter expansion (D-OM3)", () => {
  function notification(): string {
    return JSON.stringify({
      value: [
        {
          subscriptionId: "sub-1",
          clientState: "deadbeef",
          changeType: "created",
          resourceData: { id: "msg-1" },
        },
      ],
    });
  }

  function makeTrigger(filterFields: Record<string, unknown>) {
    return {
      ...baseTrigger,
      config: { ...baseTrigger.config, ...filterFields },
    };
  }

  it("fires unchanged when no filter fields are configured (Slice 6 backward compat)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );

    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  // `from` filter — case-insensitive exact match on sender address.

  it("fires when `from` filter matches the message sender (case-insensitive)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ from: "BOB@x.com" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops when `from` filter does NOT match the sender", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ from: "different@x.com" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  // `subject` filter — exact vs substring per `subjectExactMatch`.

  it("fires on `subject` exact-match (default subjectExactMatch: true)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ subject: "Hello" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops on `subject` exact-match mismatch", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ subject: "Different Subject" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("fires on `subject` substring match when subjectExactMatch=false", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ subject: "ello", subjectExactMatch: false }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops on `subject` substring mismatch when subjectExactMatch=false", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ subject: "Quarterly", subjectExactMatch: false }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  // `hasAttachment` filter — enum "any" | "yes" | "no".

  it("fires regardless of attachment status when hasAttachment='any' (V1 default)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ hasAttachment: "any" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      hasAttachments: false,
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("fires when hasAttachment='yes' and the message has attachments", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ hasAttachment: "yes" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      hasAttachments: true,
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops when hasAttachment='yes' but the message has none", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ hasAttachment: "yes" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      hasAttachments: false,
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops when hasAttachment='no' but the message has attachments", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ hasAttachment: "no" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      hasAttachments: true,
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  // `importance` filter — enum "any" | "high" | "normal" | "low".

  it("fires regardless of importance when importance='any' (V1 default)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ importance: "any" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      importance: "low",
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("fires when importance='high' matches the message", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ importance: "high" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      importance: "high",
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops when importance='high' but the message is normal", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({ importance: "high" }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...SAMPLE_GRAPH_MESSAGE,
      importance: "normal",
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  // Compound — all filters must pass.

  it("fires only when ALL configured filters match (compound AND)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({
        from: "bob@x.com",
        subject: "Hello",
        hasAttachment: "no",
        importance: "normal",
      }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops when ANY configured filter fails (compound AND)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      makeTrigger({
        from: "bob@x.com",  // matches
        subject: "Hello",   // matches
        hasAttachment: "no", // matches
        importance: "high",  // FAILS — message is normal
      }),
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });
});

// ── Outlook Mail 2.3 Commit 3 — email_sent + email_flagged dispatch ─────

describe("receiveOutlookWebhook — email_sent dispatch + filters (D-OM3)", () => {
  const sentTrigger = {
    ...baseTrigger,
    eventType: "email_sent",
    config: {
      type: "subscription-watch",
      subscriptionId: "sub-sent-1",
      clientState: "deadbeef",
      resource: "/me/mailFolders/SentItems/messages",
    },
  };

  const SENT_GRAPH_MESSAGE = {
    id: "msg-sent-1",
    conversationId: "conv-1",
    subject: "Outgoing report",
    bodyPreview: "FYI",
    body: { contentType: "text", content: "FYI" },
    from: { emailAddress: { name: "Alice", address: "alice@contoso.com" } },
    toRecipients: [
      { emailAddress: { name: "Bob", address: "bob@example.test" } },
      { emailAddress: { name: "Carol", address: "carol@example.test" } },
    ],
    bccRecipients: [{ emailAddress: { address: "auditor@example.test" } }],
    sentDateTime: "2026-05-08T11:30:00Z",
    hasAttachments: false,
    importance: "normal",
  };

  function notification(): string {
    return JSON.stringify({
      value: [
        {
          subscriptionId: "sub-sent-1",
          clientState: "deadbeef",
          changeType: "created",
          resourceData: { id: "msg-sent-1" },
        },
      ],
    });
  }

  it("normalizes via emailSent/normalize and emits eventType=email_sent", async () => {
    mockListByConfigContains.mockResolvedValueOnce([sentTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("email_sent");
    // bcc is surfaced on email_sent (V1-parity).
    expect(
      (result.events[0]!.payload as { bcc?: unknown[] }).bcc,
    ).toHaveLength(1);
  });

  it("fires when `to` filter matches a recipient (any-of-many match)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      { ...sentTrigger, config: { ...sentTrigger.config, to: "bob@example.test" } },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("accepts `to` as a CSV list (any-of-many)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      {
        ...sentTrigger,
        config: {
          ...sentTrigger.config,
          to: "nobody@x.com, carol@example.test, somebody@x.com",
        },
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops when `to` filter matches no recipient", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      {
        ...sentTrigger,
        config: { ...sentTrigger.config, to: "different@x.com" },
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("treats whitespace-only `to` as no filter (passes through)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      { ...sentTrigger, config: { ...sentTrigger.config, to: "   ,   " } },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("fires when subject exact-match (default) is true", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      {
        ...sentTrigger,
        config: { ...sentTrigger.config, subject: "Outgoing report" },
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("drops on subject exact-match mismatch", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      {
        ...sentTrigger,
        config: { ...sentTrigger.config, subject: "Different" },
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("fires on subject substring match when subjectExactMatch=false", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      {
        ...sentTrigger,
        config: {
          ...sentTrigger.config,
          subject: "report",
          subjectExactMatch: false,
        },
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SENT_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });
});

describe("receiveOutlookWebhook — email_flagged dispatch + D-OM4 over-fire", () => {
  const flaggedTrigger = {
    ...baseTrigger,
    eventType: "email_flagged",
    config: {
      type: "subscription-watch",
      subscriptionId: "sub-flag-1",
      clientState: "deadbeef",
      resource: "/me/messages",
    },
  };

  const FLAGGED_GRAPH_MESSAGE = {
    id: "msg-flag-1",
    conversationId: "conv-1",
    subject: "Follow up",
    bodyPreview: "...",
    body: { contentType: "text", content: "..." },
    from: { emailAddress: { name: "Bob", address: "bob@x.com" } },
    toRecipients: [
      { emailAddress: { name: "Alice", address: "alice@x.com" } },
    ],
    receivedDateTime: "2026-05-08T10:00:00Z",
    hasAttachments: false,
    importance: "high",
    lastModifiedDateTime: "2026-05-08T11:30:00Z",
    flag: { flagStatus: "flagged" as const },
  };

  function notification(): string {
    return JSON.stringify({
      value: [
        {
          subscriptionId: "sub-flag-1",
          clientState: "deadbeef",
          changeType: "updated",
          resourceData: { id: "msg-flag-1" },
        },
      ],
    });
  }

  it("fires when message.flag.flagStatus === 'flagged'", async () => {
    mockListByConfigContains.mockResolvedValueOnce([flaggedTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(FLAGGED_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("email_flagged");
  });

  it("drops when message.flag.flagStatus === 'notFlagged'", async () => {
    mockListByConfigContains.mockResolvedValueOnce([flaggedTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...FLAGGED_GRAPH_MESSAGE,
      flag: { flagStatus: "notFlagged" as const },
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops when message.flag.flagStatus === 'complete'", async () => {
    mockListByConfigContains.mockResolvedValueOnce([flaggedTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...FLAGGED_GRAPH_MESSAGE,
      flag: { flagStatus: "complete" as const },
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("fires defensively when message.flag is missing entirely (Graph omission case)", async () => {
    // D-OM4 defensive — never silently drop a legitimate notification.
    mockListByConfigContains.mockResolvedValueOnce([flaggedTrigger]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce({
      ...FLAGGED_GRAPH_MESSAGE,
      flag: undefined,
    });

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
  });

  it("D-OM4 over-fire — fires on repeated updates to an already-flagged message", async () => {
    mockListByConfigContains.mockResolvedValue([flaggedTrigger]);
    mockGetActiveForExecution.mockResolvedValue(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(FLAGGED_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({ body: notification() }),
    );
    if (result.kind !== "events") throw new Error("unreachable");
    expect(result.events).toHaveLength(1);
    // No prior-state cache: the receive route doesn't track "was this
    // message ALREADY flagged before this update". V1-parity over-fire
    // accepted per D-OM4.
  });
});

describe("receiveOutlookWebhook — unknown eventType safety", () => {
  it("logs and skips notifications for unknown eventTypes (does NOT throw)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      { ...baseTrigger, eventType: "unknown_future_event" },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockGetMessage.mockResolvedValueOnce(SAMPLE_GRAPH_MESSAGE);

    const result = await receiveOutlookWebhook(
      makeRequest({
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
      }),
    );

    expect(result).toEqual({ kind: "events", events: [] });
  });
});

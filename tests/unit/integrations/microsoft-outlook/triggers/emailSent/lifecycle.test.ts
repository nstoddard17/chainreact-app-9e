/**
 * @jest-environment node
 *
 * microsoft-outlook/triggers/emailSent trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockCreateSubscription = jest.fn();
const mockDeleteSubscription = jest.fn();
const mockRenewSubscription = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
  deleteSubscription: (...args: unknown[]) => mockDeleteSubscription(...args),
  renewSubscription: (...args: unknown[]) => mockRenewSubscription(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { activate } from "@/integrations/microsoft-outlook/triggers/emailSent/activate";
import { deactivate } from "@/integrations/microsoft-outlook/triggers/emailSent/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { normalize } from "@/integrations/microsoft-outlook/triggers/emailSent/normalize";
import { EmailSentTriggerFilterSchema, extractEmailSentFilterFields, EMAIL_SENT_FILTER_FIELDS } from "@/integrations/microsoft-outlook/triggers/emailSent/configSchema";
import { outlookEmailSentSubscriptionHandler } from "@/integrations/microsoft-outlook/triggers/emailSent/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateSubscription.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MICROSOFT_GRAPH_WEBHOOK_URL;
});

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "microsoft-outlook",
  type: "email_sent",
  config: {},
  position: { x: 0, y: 0 },
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

describe("Outlook email_sent activate", () => {
  it("creates subscription on /me/mailFolders/SentItems/messages with changeType=created", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-sent",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-11T00:00:00Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/mailFolders/SentItems/messages");
    expect(call.changeType).toBe("created");
    expect(result.resource).toBe("/me/mailFolders/SentItems/messages");
    expect(result.changeType).toBe("created");
  });

  it("uses 70.5h expiration (4230 minutes — Outlook /me/messages max)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreateSubscription.mock.calls[0]![0].clientState).toBe(
      result.clientState,
    );
  });

  it("uses Graph's authoritative expirationDateTime in the persisted config", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-10T23:59:59.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.expiresAt).toBe("2026-05-10T23:59:59.000Z");
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("propagates createSubscription failures verbatim", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/validation request failed/);
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL override when set", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook";

    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook",
    );
  });

  it("does NOT route subscription via /me/mailFolders/{folder} — SentItems is the only resource", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    // Even when the workflow has a `folder` field in its config (which
    // is not a recognized email_sent filter), the activate ignores it.
    await activate({
      node: {
        ...baseNode,
        config: { folder: "should-be-ignored" },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/mailFolders/SentItems/messages",
    );
  });

  it("returns the SUBSCRIPTION_TYPE and webhookEnabled in the config patch", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.type).toBe("subscription-watch");
    expect(result.webhookEnabled).toBe(true);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeleteSubscription.mockReset();
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
  eventType: "email_sent",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-sent-1",
    clientState: "deadbeef",
    resource: "/me/mailFolders/SentItems/messages",
  },
  providerAccountId: null,
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

describe("Outlook email_sent deactivate", () => {
  it("DELETEs the Graph subscription", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);
    await deactivate({ trigger: baseTrigger, integration: baseIntegration });
    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-sent-1" }),
    );
  });

  it("no-ops when type is not subscription-watch", async () => {
    await deactivate({
      trigger: { ...baseTrigger, config: { type: "polling" } },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("no-ops when subscriptionId is missing", async () => {
    await deactivate({
      trigger: { ...baseTrigger, config: { type: "subscription-watch" } },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-sent-1"));
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 / ErrorAccessDenied", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: ErrorAccessDenied"),
    );
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: HTTP 500"),
    );
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/500/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const CONTEXT = {
  subscriptionId: "sub-sent-1",
  changeType: "created",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  providerAccountId: "alice@contoso.com",
};

describe("Outlook email_sent normalize", () => {
  it("produces the canonical TriggerEvent shape with eventType=email_sent", () => {
    const event = normalize(
      {
        id: "msg-sent-1",
        conversationId: "conv-1",
        subject: "Outgoing report",
        bodyPreview: "Attached please find...",
        body: { contentType: "html", content: "<p>Body</p>" },
        from: {
          emailAddress: { name: "Alice", address: "alice@contoso.com" },
        },
        toRecipients: [
          { emailAddress: { name: "Bob", address: "bob@example.test" } },
        ],
        ccRecipients: [
          { emailAddress: { name: "Carol", address: "carol@example.test" } },
        ],
        bccRecipients: [
          { emailAddress: { name: "Dan", address: "dan@example.test" } },
        ],
        sentDateTime: "2026-05-08T11:30:00Z",
        hasAttachments: true,
        importance: "high",
        webLink: "https://outlook.office.com/owa/...",
      },
      CONTEXT,
    );

    expect(event.eventType).toBe("email_sent");
    expect(event.eventId).toBe("sub-sent-1:msg-sent-1:created");
    expect(event.occurredAt).toBe("2026-05-08T11:30:00Z");
    expect(event.payload).toEqual({
      messageId: "msg-sent-1",
      conversationId: "conv-1",
      subject: "Outgoing report",
      bodyPreview: "Attached please find...",
      body: { contentType: "html", content: "<p>Body</p>" },
      from: { name: "Alice", address: "alice@contoso.com" },
      to: [{ name: "Bob", address: "bob@example.test" }],
      cc: [{ name: "Carol", address: "carol@example.test" }],
      bcc: [{ name: "Dan", address: "dan@example.test" }],
      sentDateTime: "2026-05-08T11:30:00Z",
      hasAttachments: true,
      importance: "high",
      webLink: "https://outlook.office.com/owa/...",
    });
  });

  it("payload includes `bcc` (vs new_email which does NOT)", () => {
    const event = normalize(
      {
        id: "msg",
        bccRecipients: [
          { emailAddress: { address: "secret@example.test" } },
        ],
      },
      CONTEXT,
    );
    expect(event.payload.bcc).toEqual([
      { name: "", address: "secret@example.test" },
    ]);
  });

  it("payload does NOT include `receivedDateTime` or `receivedAt`", () => {
    const event = normalize({ id: "msg" }, CONTEXT);
    expect("receivedDateTime" in event.payload).toBe(false);
    expect("receivedAt" in event.payload).toBe(false);
  });

  it("payload includes `sentDateTime` (load-bearing distinction vs new_email)", () => {
    const event = normalize(
      { id: "msg", sentDateTime: "2026-05-08T10:00:00Z" },
      CONTEXT,
    );
    expect(event.payload.sentDateTime).toBe("2026-05-08T10:00:00Z");
  });

  it("falls back to lastModifiedDateTime when sentDateTime is missing for occurredAt", () => {
    const event = normalize(
      { id: "msg", lastModifiedDateTime: "2026-05-08T10:30:00Z" },
      CONTEXT,
    );
    expect(event.occurredAt).toBe("2026-05-08T10:30:00Z");
  });

  it("falls back to receivedDateTime then notificationOccurredAt", () => {
    const event = normalize(
      { id: "msg", receivedDateTime: "2026-05-08T10:00:00Z" },
      CONTEXT,
    );
    expect(event.occurredAt).toBe("2026-05-08T10:00:00Z");
  });

  it("uses notificationOccurredAt when no message datetime fields are present", () => {
    const event = normalize({ id: "msg" }, CONTEXT);
    expect(event.occurredAt).toBe(CONTEXT.notificationOccurredAt);
  });

  it("sentDateTime in payload is null when message omits it", () => {
    const event = normalize({ id: "msg" }, CONTEXT);
    expect(event.payload.sentDateTime).toBeNull();
  });

  it("normalizes contentType to 'html' or 'text' (case-insensitive)", () => {
    const html = normalize(
      { id: "m", body: { contentType: "HTML", content: "<b>x</b>" } },
      CONTEXT,
    );
    expect((html.payload.body as { contentType: string }).contentType).toBe("html");
    const text = normalize(
      { id: "m", body: { contentType: "TEXT", content: "x" } },
      CONTEXT,
    );
    expect((text.payload.body as { contentType: string }).contentType).toBe("text");
  });

  it("from falls back to sender when from is missing", () => {
    const event = normalize(
      {
        id: "msg",
        sender: { emailAddress: { address: "noreply@example.test" } },
      },
      CONTEXT,
    );
    expect(event.payload.from).toEqual({
      name: "",
      address: "noreply@example.test",
    });
  });

  it("dedup key shape stays ${subscriptionId}:${messageId}:${changeType}", () => {
    const event = normalize(
      { id: "msg-X" },
      { ...CONTEXT, subscriptionId: "sub-Y", changeType: "created" },
    );
    expect(event.eventId).toBe("sub-Y:msg-X:created");
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling configSchema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

describe("EmailSentTriggerFilterSchema", () => {
  it("accepts an empty config (V1 marked `to` required but mega-route only filters when set)", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({});
    expect(parsed.subjectExactMatch).toBe(true);
    expect(parsed.to).toBeUndefined();
    expect(parsed.subject).toBeUndefined();
  });

  it("accepts to as a single email string", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({
      to: "alice@example.test",
    });
    expect(parsed.to).toBe("alice@example.test");
  });

  it("accepts to as a CSV string", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({
      to: "alice@x.com, bob@x.com",
    });
    expect(parsed.to).toBe("alice@x.com, bob@x.com");
  });

  it("accepts to as an array of strings", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({
      to: ["alice@x.com", "bob@x.com"],
    });
    expect(parsed.to).toEqual(["alice@x.com", "bob@x.com"]);
  });

  it("rejects to as an empty string", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ to: "" }),
    ).toThrow();
  });

  it("rejects to as an empty array", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ to: [] }),
    ).toThrow();
  });

  it("preserves D-OM3 default subjectExactMatch=true", () => {
    expect(
      EmailSentTriggerFilterSchema.parse({}).subjectExactMatch,
    ).toBe(true);
  });

  it("accepts subjectExactMatch=false", () => {
    expect(
      EmailSentTriggerFilterSchema.parse({ subjectExactMatch: false })
        .subjectExactMatch,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ unknownExtra: "leak" }),
    ).toThrow();
  });

  it("rejects subscription-state keys (extract first, then parse)", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ subscriptionId: "sub-1" }),
    ).toThrow();
  });
});

describe("extractEmailSentFilterFields", () => {
  it("extracts only the filter subset from a full trigger config", () => {
    const config = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/mailFolders/SentItems/messages",
      expiresAt: "2026-05-20T12:00:00Z",
      to: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
    };
    expect(extractEmailSentFilterFields(config)).toEqual({
      to: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
    });
  });

  it("returns empty object for baseline config (no filter keys)", () => {
    expect(
      extractEmailSentFilterFields({
        type: "subscription-watch",
        subscriptionId: "sub-1",
      }),
    ).toEqual({});
  });

  it("exports the canonical filter field list", () => {
    expect([...EMAIL_SENT_FILTER_FIELDS].sort()).toEqual(
      ["subject", "subjectExactMatch", "to"].sort(),
    );
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRenewSubscription.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
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
  eventType: "email_sent",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-sent-1",
    clientState: "deadbeef",
    resource: "/me/mailFolders/SentItems/messages",
    expiresAt: "2026-05-09T12:00:00.000Z",
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

describe("outlookEmailSentSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook:email_sent'", () => {
    expect(outlookEmailSentSubscriptionHandler.id).toBe(
      "microsoft-outlook:email_sent",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-outlook/email_sent", () => {
    expect(
      outlookEmailSentSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);

    expect(
      outlookEmailSentSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "new_email", // different eventType — DON'T handle
      }),
    ).toBe(false);

    expect(
      outlookEmailSentSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "gmail",
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold", () => {
    expect(
      outlookEmailSentSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-sent-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-sent-1" }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-sent-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-sent-1",
      clientState: "deadbeef",
      resource: "/me/mailFolders/SentItems/messages",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("throws when subscriptionId is missing from config", async () => {
    await expect(
      outlookEmailSentSubscriptionHandler.renew({
        trigger: {
          ...baseTrigger,
          config: { ...baseTrigger.config, subscriptionId: undefined },
        },
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when no active integration row exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors and skips persistence", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      outlookEmailSentSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

});

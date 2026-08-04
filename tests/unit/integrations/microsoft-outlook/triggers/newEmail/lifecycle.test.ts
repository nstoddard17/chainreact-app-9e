/**
 * @jest-environment node
 *
 * microsoft-outlook/triggers/newEmail trigger lifecycle contract suite — one per-trigger suite
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

import { activate } from "@/integrations/microsoft-outlook/triggers/newEmail/activate";
import { deactivate } from "@/integrations/microsoft-outlook/triggers/newEmail/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { normalize } from "@/integrations/microsoft-outlook/triggers/newEmail/normalize";
import { NewEmailTriggerFilterSchema, extractNewEmailFilterFields, NEW_EMAIL_FILTER_FIELDS } from "@/integrations/microsoft-outlook/triggers/newEmail/configSchema";
import { outlookNewEmailSubscriptionHandler } from "@/integrations/microsoft-outlook/triggers/newEmail/renew";

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
  type: "new_email",
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

describe("Outlook new_email activate", () => {
  it("creates subscription on /me/messages with changeType=created and 70.5h expiration", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-outlook",
      expirationDateTime: "2026-05-11T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
    expect(call.changeType).toBe("created");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook/lifecycle",
    );
    // Expiration must be ~4230 minutes (70.5h) from now.
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    // Allow 60s skew for test timing.
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/me/messages",
      changeType: "created",
      subscriptionId: "sub-graph-1",
      expiresAt: "2026-05-11T00:00:00.000Z",
    });
    expect(typeof result.clientState).toBe("string");
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
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
    // Sent in the request, not just stored locally.
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.clientState).toBe(result.clientState);
  });

  it("uses Graph's authoritative expirationDateTime in the persisted config (Graph may round)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      // Graph returned a slightly DIFFERENT timestamp than we requested
      // (truncated/rounded). The persisted value reflects what Graph
      // accepted, not what we asked for.
      expirationDateTime: "2026-05-10T23:59:59.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.expiresAt).toBe("2026-05-10T23:59:59.000Z");
  });

  it("each activation generates a fresh clientState (no reuse)", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const r1 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const r2 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(r1.clientState).not.toBe(r2.clientState);
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL when set, stripping any trailing /api/webhooks/microsoft-outlook", async () => {
    // Mirrors V1's stripping logic — the env var may be a "full webhook URL"
    // OR a base; we always append the canonical path.
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook";

    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook/lifecycle",
    );
  });

  it("propagates createSubscription failures verbatim (lifecycle wraps with TRIGGER_REGISTRATION_FAILED)", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/validation request failed/);
  });

  // Outlook Mail 2.3 D-OM3 — folder-scoped subscription routing.

  it("routes subscription to /me/mailFolders/{folder}/messages when node.config.folder is set", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-folder",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-11T00:00:00Z",
    });

    const result = await activate({
      node: { ...baseNode, config: { folder: "inbox" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/mailFolders/inbox/messages");
    expect(result.resource).toBe("/me/mailFolders/inbox/messages");
  });

  it("accepts a custom Graph folder id verbatim in the subscription resource", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/AAMkAGI2-custom-folder/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: {
        ...baseNode,
        config: { folder: "AAMkAGI2-custom-folder" },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe(
      "/me/mailFolders/AAMkAGI2-custom-folder/messages",
    );
  });

  it("trims whitespace around the folder before composing the resource path", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "  inbox  " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/mailFolders/inbox/messages");
  });

  it("falls back to /me/messages when folder is an empty / whitespace-only string", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "   " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
  });

  it("falls back to /me/messages when folder is not a string", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: {
        ...baseNode,
        config: { folder: { id: "x" } as unknown as string },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
  });

  it("preserves Slice 6 behavior when no folder field is set (backward compat)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode, // config: {}
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
    expect(result.resource).toBe("/me/messages");
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
  eventType: "new_email",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-graph-1",
    clientState: "deadbeef",
    resource: "/me/messages",
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

describe("Outlook new_email deactivate", () => {
  it("DELETEs the Graph subscription via deleteSubscription wrapper", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-graph-1",
      }),
    );
  });

  it("no-ops when type is not subscription-watch (defensive)", async () => {
    await deactivate({
      trigger: { ...baseTrigger, config: { type: "polling" } },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("no-ops when subscriptionId is missing (partial activate state)", async () => {
    await deactivate({
      trigger: {
        ...baseTrigger,
        config: { type: "subscription-watch" },
      },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (subscription already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 / ErrorAccessDenied (V1 reasoning — Graph auto-cleans on expiry)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: ErrorAccessDenied"),
    );

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (orchestrator catches and continues row deletion)", async () => {
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
  subscriptionId: "sub-1",
  changeType: "created",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  providerAccountId: "alice@contoso.com",
};

describe("Outlook new_email normalize", () => {
  it("produces the canonical TriggerEvent shape from a Graph message", () => {
    const event = normalize(
      {
        id: "msg-1",
        conversationId: "conv-1",
        subject: "Hello",
        bodyPreview: "Hi there",
        body: { contentType: "html", content: "<p>Hi there</p>" },
        from: { emailAddress: { name: "Bob", address: "bob@x.com" } },
        toRecipients: [
          { emailAddress: { name: "Alice", address: "alice@x.com" } },
        ],
        ccRecipients: [
          { emailAddress: { name: "Carol", address: "carol@x.com" } },
        ],
        receivedDateTime: "2026-05-08T11:30:00Z",
        hasAttachments: true,
        importance: "high",
        webLink: "https://outlook.office.com/owa/...",
      },
      CONTEXT,
    );

    expect(event).toEqual({
      provider: "microsoft-outlook",
      eventType: "new_email",
      eventId: "sub-1:msg-1:created",
      occurredAt: "2026-05-08T11:30:00Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        messageId: "msg-1",
        conversationId: "conv-1",
        subject: "Hello",
        bodyPreview: "Hi there",
        body: { contentType: "html", content: "<p>Hi there</p>" },
        from: { name: "Bob", address: "bob@x.com" },
        to: [{ name: "Alice", address: "alice@x.com" }],
        cc: [{ name: "Carol", address: "carol@x.com" }],
        receivedAt: "2026-05-08T11:30:00Z",
        hasAttachments: true,
        importance: "high",
        webLink: "https://outlook.office.com/owa/...",
      },
    });
  });

  it("dedup key shape is ${subscriptionId}:${messageId}:${changeType}", () => {
    const event = normalize(
      { id: "graph-msg-X" },
      { ...CONTEXT, subscriptionId: "sub-XYZ", changeType: "updated" },
    );
    expect(event.eventId).toBe("sub-XYZ:graph-msg-X:updated");
  });

  it("falls back to sender when from is missing", () => {
    const event = normalize(
      {
        id: "msg",
        sender: { emailAddress: { address: "noreply@x.com" } },
      },
      CONTEXT,
    );
    expect(event.payload.from).toEqual({ name: "", address: "noreply@x.com" });
  });

  it("returns from: null when neither from nor sender resolves to a usable address", () => {
    const event = normalize({ id: "msg" }, CONTEXT);
    expect(event.payload.from).toBeNull();
  });

  it("coalesces missing display name to empty string (stable shape)", () => {
    const event = normalize(
      {
        id: "msg",
        from: { emailAddress: { address: "anon@x.com" } }, // no name
      },
      CONTEXT,
    );
    expect(event.payload.from).toEqual({ name: "", address: "anon@x.com" });
  });

  it("filters recipient entries with no address (Graph occasionally returns blanks)", () => {
    const event = normalize(
      {
        id: "msg",
        toRecipients: [
          { emailAddress: { address: "real@x.com" } },
          { emailAddress: {} }, // dropped
          { emailAddress: { address: "another@x.com" } },
        ],
      },
      CONTEXT,
    );
    expect(event.payload.to).toEqual([
      { name: "", address: "real@x.com" },
      { name: "", address: "another@x.com" },
    ]);
  });

  it("normalizes contentType to lowercase 'html' or 'text' (defensively)", () => {
    const html = normalize(
      { id: "m1", body: { contentType: "HTML", content: "x" } },
      CONTEXT,
    );
    expect(html.payload.body).toEqual({ contentType: "html", content: "x" });

    const text = normalize(
      { id: "m2", body: { contentType: "Text", content: "x" } },
      CONTEXT,
    );
    expect(text.payload.body).toEqual({ contentType: "text", content: "x" });

    // Unknown values default to "text" rather than passing through.
    const weird = normalize(
      { id: "m3", body: { contentType: "richtext", content: "x" } },
      CONTEXT,
    );
    expect((weird.payload.body as { contentType: string }).contentType).toBe(
      "text",
    );
  });

  it("uses receivedDateTime > sentDateTime > notification fallback for occurredAt", () => {
    const r1 = normalize({ id: "m", receivedDateTime: "1" }, CONTEXT);
    expect(r1.occurredAt).toBe("1");

    const r2 = normalize(
      { id: "m", sentDateTime: "2" },
      CONTEXT,
    );
    expect(r2.occurredAt).toBe("2");

    const r3 = normalize({ id: "m" }, CONTEXT);
    expect(r3.occurredAt).toBe("2026-05-08T12:00:00Z");
  });

  it("defaults importance to 'normal', hasAttachments to false, webLink to null", () => {
    const event = normalize({ id: "m" }, CONTEXT);
    expect(event.payload.importance).toBe("normal");
    expect(event.payload.hasAttachments).toBe(false);
    expect(event.payload.webLink).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling configSchema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Tests for the new_email trigger filter schema (Outlook Mail 2.3 Commit 2).
// D-OM3 — 5 V1 filters; folder routes via subscription resource (handled
// in activate.ts); the rest are receive-time. V1 defaults preserved.
// ---------------------------------------------------------------------------

describe("NewEmailTriggerFilterSchema", () => {
  it("accepts an empty config (Slice 6 backward compat)", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({});
    expect(parsed.folder).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.subject).toBeUndefined();
    // Defaults (D-OM3 V1-parity).
    expect(parsed.subjectExactMatch).toBe(true);
    expect(parsed.hasAttachment).toBe("any");
    expect(parsed.importance).toBe("any");
  });

  it("preserves D-OM3 V1 defaults when filters omitted", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({});
    expect(parsed).toEqual({
      subjectExactMatch: true,
      hasAttachment: "any",
      importance: "any",
    });
  });

  it("accepts a folder string", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({ folder: "inbox" });
    expect(parsed.folder).toBe("inbox");
  });

  it("rejects an empty-string folder", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({ folder: "" }),
    ).toThrow();
  });

  it("accepts a custom folder id", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      folder: "AQMkAGE-folder-id",
    });
    expect(parsed.folder).toBe("AQMkAGE-folder-id");
  });

  it("accepts a from address", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      from: "alice@example.test",
    });
    expect(parsed.from).toBe("alice@example.test");
  });

  it("rejects an empty-string from", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({ from: "" }),
    ).toThrow();
  });

  it("accepts a subject string", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      subject: "Quarterly report",
    });
    expect(parsed.subject).toBe("Quarterly report");
  });

  it("accepts an empty subject string (handler treats as no-filter)", () => {
    // Per V1-parity, the receive-route's filter logic ignores empty
    // strings — schema-level validation only catches the "no field at
    // all" case (which is the same as empty for filtering purposes).
    const parsed = NewEmailTriggerFilterSchema.parse({ subject: "" });
    expect(parsed.subject).toBe("");
  });

  it("accepts subjectExactMatch as false (substring mode)", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      subjectExactMatch: false,
    });
    expect(parsed.subjectExactMatch).toBe(false);
  });

  it("rejects non-boolean subjectExactMatch", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        subjectExactMatch: "true" as unknown as boolean,
      }),
    ).toThrow();
  });

  it("accepts each hasAttachment enum value", () => {
    for (const v of ["any", "yes", "no"] as const) {
      expect(() =>
        NewEmailTriggerFilterSchema.parse({ hasAttachment: v }),
      ).not.toThrow();
    }
  });

  it("rejects boolean hasAttachment (legacy V1 might pass true/false)", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        hasAttachment: true as unknown as "yes",
      }),
    ).toThrow();
  });

  it("accepts each importance enum value", () => {
    for (const v of ["any", "high", "normal", "low"] as const) {
      expect(() =>
        NewEmailTriggerFilterSchema.parse({ importance: v }),
      ).not.toThrow();
    }
  });

  it("rejects unknown importance values", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        importance: "urgent" as unknown as "high",
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  it("rejects subscription-state keys (they belong outside the filter subset)", () => {
    // Subscription state is in the same row but NOT a filter field.
    // Strict mode rejects to keep drift visible.
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        subscriptionId: "sub-1",
      }),
    ).toThrow();
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        clientState: "deadbeef",
      }),
    ).toThrow();
  });

  it("accepts a fully-populated filter", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      folder: "inbox",
      from: "alice@example.test",
      subject: "Q3 review",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    });
    expect(parsed).toEqual({
      folder: "inbox",
      from: "alice@example.test",
      subject: "Q3 review",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    });
  });
});

describe("extractNewEmailFilterFields", () => {
  it("extracts only filter fields from a full trigger config", () => {
    const config = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-20T12:00:00Z",
      folder: "inbox",
      from: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    };
    expect(extractNewEmailFilterFields(config)).toEqual({
      folder: "inbox",
      from: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    });
  });

  it("drops undefined values (Zod default application requires absence, not undefined)", () => {
    const config = {
      type: "subscription-watch",
      folder: undefined,
      from: undefined,
    };
    expect(extractNewEmailFilterFields(config)).toEqual({});
  });

  it("returns empty object for Slice 6 baseline config (no filter keys)", () => {
    const config = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-20T12:00:00Z",
    };
    expect(extractNewEmailFilterFields(config)).toEqual({});
  });

  it("exports the canonical filter field list", () => {
    expect([...NEW_EMAIL_FILTER_FIELDS].sort()).toEqual(
      [
        "folder",
        "from",
        "subject",
        "subjectExactMatch",
        "hasAttachment",
        "importance",
      ].sort(),
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
  eventType: "new_email",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-graph-1",
    clientState: "deadbeef",
    resource: "/me/messages",
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

describe("outlookNewEmailSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook:new_email'", () => {
    expect(outlookNewEmailSubscriptionHandler.id).toBe(
      "microsoft-outlook:new_email",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-outlook/new_email", () => {
    expect(
      outlookNewEmailSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);

    expect(
      outlookNewEmailSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "google-sheets",
      }),
    ).toBe(false);

    expect(
      outlookNewEmailSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "different",
      }),
    ).toBe(false);

    expect(
      outlookNewEmailSubscriptionHandler.canHandle({
        ...baseTrigger,
        config: { ...baseTrigger.config, type: "polling" },
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold (60 * 60 * 1000 ms)", () => {
    expect(outlookNewEmailSubscriptionHandler.getRenewalThresholdMs()).toBe(
      60 * 60 * 1000,
    );
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookNewEmailSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-graph-1",
      }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt back to config (preserves clientState + subscriptionId)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookNewEmailSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-graph-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("throws when subscriptionId is missing from config (partial activate state)", async () => {
    await expect(
      outlookNewEmailSubscriptionHandler.renew({
        trigger: {
          ...baseTrigger,
          config: { ...baseTrigger.config, subscriptionId: undefined },
        },
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when no active integration row exists (user disconnected)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      outlookNewEmailSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors (runRenewals counts as error and skips persistence)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      outlookNewEmailSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

});

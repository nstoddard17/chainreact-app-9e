/**
 * @jest-environment node
 *
 * microsoft-outlook/triggers/emailFlagged trigger lifecycle contract suite — one per-trigger suite
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

import { activate } from "@/integrations/microsoft-outlook/triggers/emailFlagged/activate";
import { deactivate } from "@/integrations/microsoft-outlook/triggers/emailFlagged/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { normalize } from "@/integrations/microsoft-outlook/triggers/emailFlagged/normalize";
import { EmailFlaggedTriggerFilterSchema, extractEmailFlaggedFilterFields, EMAIL_FLAGGED_FILTER_FIELDS } from "@/integrations/microsoft-outlook/triggers/emailFlagged/configSchema";
import { outlookEmailFlaggedSubscriptionHandler } from "@/integrations/microsoft-outlook/triggers/emailFlagged/renew";

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
});

const baseNode = {
  id: "node-flagged-1",
  kind: "trigger" as const,
  provider: "microsoft-outlook",
  type: "email_flagged",
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

describe("Outlook email_flagged activate", () => {
  it("creates subscription on /me/messages with changeType=updated (no folder)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-flagged-1",
      resource: "/me/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "2026-05-11T00:00:00Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
    expect(call.changeType).toBe("updated");
    expect(result.changeType).toBe("updated");
  });

  it("routes subscription to /me/mailFolders/{folder}/messages when folder is set", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-flagged-folder",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "inbox" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/mailFolders/inbox/messages",
    );
  });

  it("trims whitespace around folder before composing the resource", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "  inbox  " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/mailFolders/inbox/messages",
    );
  });

  it("falls back to /me/messages for empty / whitespace-only folder", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "   " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/messages",
    );
  });

  it("uses 70.5h expiration (4230 minutes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
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

  it("generates a 64-char hex clientState", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
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
  eventType: "email_flagged",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-flagged-1",
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

describe("Outlook email_flagged deactivate", () => {
  it("DELETEs the Graph subscription", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);
    await deactivate({ trigger: baseTrigger, integration: baseIntegration });
    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-flagged-1" }),
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

  it("swallows NotFoundError", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new NotFoundError("sub-flagged-1"),
    );
    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows ErrorAccessDenied", async () => {
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
  subscriptionId: "sub-flagged-1",
  changeType: "updated",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  providerAccountId: "alice@contoso.com",
};

describe("Outlook email_flagged normalize", () => {
  it("produces canonical TriggerEvent with eventType=email_flagged", () => {
    const event = normalize(
      {
        id: "msg-flag-1",
        conversationId: "conv-1",
        subject: "Important — read soon",
        bodyPreview: "Don't forget",
        body: { contentType: "text", content: "..." },
        from: { emailAddress: { name: "Bob", address: "bob@x.com" } },
        toRecipients: [
          { emailAddress: { name: "Alice", address: "alice@x.com" } },
        ],
        receivedDateTime: "2026-05-08T10:00:00Z",
        hasAttachments: false,
        importance: "high",
        webLink: "https://outlook.office.com/owa/...",
        lastModifiedDateTime: "2026-05-08T11:30:00Z",
        flag: {
          flagStatus: "flagged",
          dueDateTime: { dateTime: "2026-05-15T00:00:00", timeZone: "UTC" },
          startDateTime: { dateTime: "2026-05-08T11:30:00", timeZone: "UTC" },
        },
      },
      CONTEXT,
    );

    expect(event.eventType).toBe("email_flagged");
    expect(event.eventId).toBe("sub-flagged-1:msg-flag-1:updated");
    expect(event.payload.flag).toEqual({
      flagStatus: "flagged",
      completedDateTime: null,
      dueDateTime: "2026-05-15T00:00:00",
      startDateTime: "2026-05-08T11:30:00",
    });
  });

  it("payload.flag.flagStatus defaults to 'flagged' when missing (receive-time has already verified)", () => {
    const event = normalize(
      {
        id: "msg",
        flag: { dueDateTime: { dateTime: "2026-05-15T00:00:00" } },
      },
      CONTEXT,
    );
    expect(event.payload.flag).toMatchObject({
      flagStatus: "flagged",
    });
  });

  it("flattens Graph datetime nested fields to ISO strings", () => {
    const event = normalize(
      {
        id: "msg",
        flag: {
          flagStatus: "flagged",
          completedDateTime: {
            dateTime: "2026-05-10T15:00:00",
            timeZone: "UTC",
          },
        },
      },
      CONTEXT,
    );
    expect(event.payload.flag).toMatchObject({
      completedDateTime: "2026-05-10T15:00:00",
    });
  });

  it("returns null for missing flag datetime fields", () => {
    const event = normalize({ id: "msg" }, CONTEXT);
    expect(event.payload.flag).toEqual({
      flagStatus: "flagged",
      completedDateTime: null,
      dueDateTime: null,
      startDateTime: null,
    });
  });

  it("uses lastModifiedDateTime for occurredAt (flag updates are message edits)", () => {
    const event = normalize(
      {
        id: "msg",
        lastModifiedDateTime: "2026-05-08T11:30:00Z",
        receivedDateTime: "2026-05-08T10:00:00Z",
      },
      CONTEXT,
    );
    expect(event.occurredAt).toBe("2026-05-08T11:30:00Z");
  });

  it("falls back to receivedDateTime when lastModifiedDateTime is absent", () => {
    const event = normalize(
      {
        id: "msg",
        receivedDateTime: "2026-05-08T10:00:00Z",
      },
      CONTEXT,
    );
    expect(event.occurredAt).toBe("2026-05-08T10:00:00Z");
  });

  it("uses notificationOccurredAt as the final fallback", () => {
    const event = normalize({ id: "msg" }, CONTEXT);
    expect(event.occurredAt).toBe(CONTEXT.notificationOccurredAt);
  });

  it("includes the full set of recipient lists in the payload", () => {
    const event = normalize(
      {
        id: "msg",
        toRecipients: [{ emailAddress: { address: "a@x.com" } }],
        ccRecipients: [{ emailAddress: { address: "c@x.com" } }],
      },
      CONTEXT,
    );
    expect(event.payload.to).toEqual([{ name: "", address: "a@x.com" }]);
    expect(event.payload.cc).toEqual([{ name: "", address: "c@x.com" }]);
  });

  it("normalizes contentType to 'html' or 'text' (case-insensitive)", () => {
    const event = normalize(
      { id: "msg", body: { contentType: "HTML", content: "<b>x</b>" } },
      CONTEXT,
    );
    expect((event.payload.body as { contentType: string }).contentType).toBe(
      "html",
    );
  });

  it("dedup key shape is ${subscriptionId}:${messageId}:${changeType}", () => {
    const event = normalize(
      { id: "msg-X" },
      { ...CONTEXT, subscriptionId: "sub-Y", changeType: "updated" },
    );
    expect(event.eventId).toBe("sub-Y:msg-X:updated");
  });

  it("from falls back to sender when from is missing", () => {
    const event = normalize(
      {
        id: "msg",
        sender: { emailAddress: { address: "noreply@x.com" } },
      },
      CONTEXT,
    );
    expect(event.payload.from).toEqual({
      name: "",
      address: "noreply@x.com",
    });
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling configSchema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

describe("EmailFlaggedTriggerFilterSchema", () => {
  it("accepts an empty config (folder optional)", () => {
    const parsed = EmailFlaggedTriggerFilterSchema.parse({});
    expect(parsed.folder).toBeUndefined();
  });

  it("accepts a folder string", () => {
    const parsed = EmailFlaggedTriggerFilterSchema.parse({
      folder: "inbox",
    });
    expect(parsed.folder).toBe("inbox");
  });

  it("rejects an empty-string folder", () => {
    expect(() =>
      EmailFlaggedTriggerFilterSchema.parse({ folder: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      EmailFlaggedTriggerFilterSchema.parse({ leak: "x" }),
    ).toThrow();
  });

  it("rejects subscription-state keys (extract first, then parse)", () => {
    expect(() =>
      EmailFlaggedTriggerFilterSchema.parse({ subscriptionId: "sub-1" }),
    ).toThrow();
  });

  it("exports the canonical filter field list (folder only)", () => {
    expect([...EMAIL_FLAGGED_FILTER_FIELDS]).toEqual(["folder"]);
  });
});

describe("extractEmailFlaggedFilterFields", () => {
  it("extracts only the filter subset", () => {
    expect(
      extractEmailFlaggedFilterFields({
        type: "subscription-watch",
        subscriptionId: "sub-1",
        folder: "inbox",
      }),
    ).toEqual({ folder: "inbox" });
  });

  it("returns empty object when no filter keys are present", () => {
    expect(
      extractEmailFlaggedFilterFields({
        type: "subscription-watch",
        subscriptionId: "sub-1",
      }),
    ).toEqual({});
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
  eventType: "email_flagged",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-flagged-1",
    clientState: "deadbeef",
    resource: "/me/messages",
    expiresAt: "2026-05-09T12:00:00Z",
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

describe("outlookEmailFlaggedSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook:email_flagged'", () => {
    expect(outlookEmailFlaggedSubscriptionHandler.id).toBe(
      "microsoft-outlook:email_flagged",
    );
  });

  it("canHandle returns true for email_flagged + subscription-watch", () => {
    expect(
      outlookEmailFlaggedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle returns false for other event types", () => {
    expect(
      outlookEmailFlaggedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "new_email",
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold", () => {
    expect(
      outlookEmailFlaggedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes with fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-flagged-1",
      expirationDateTime: "2026-05-15T00:00:00Z",
    });

    await outlookEmailFlaggedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub-flagged-1" }),
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
      id: "sub-flagged-1",
      expirationDateTime: "2026-05-15T00:00:00Z",
    });

    await outlookEmailFlaggedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-flagged-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-15T00:00:00Z",
    });
  });

  it("throws when subscriptionId is missing", async () => {
    await expect(
      outlookEmailFlaggedSubscriptionHandler.renew({
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
      outlookEmailFlaggedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );
    await expect(
      outlookEmailFlaggedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

});

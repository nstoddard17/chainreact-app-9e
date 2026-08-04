/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/microsoft-outlook/triggers/emailSent/normalize";

import {
  EmailSentTriggerFilterSchema,
  extractEmailSentFilterFields,
  EMAIL_SENT_FILTER_FIELDS,
} from "@/integrations/microsoft-outlook/triggers/emailSent/configSchema";
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

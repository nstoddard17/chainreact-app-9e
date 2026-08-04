/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/microsoft-outlook/triggers/newEmail/normalize";

import {
  NewEmailTriggerFilterSchema,
  extractNewEmailFilterFields,
  NEW_EMAIL_FILTER_FIELDS,
} from "@/integrations/microsoft-outlook/triggers/newEmail/configSchema";
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

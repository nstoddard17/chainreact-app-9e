/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/microsoft-outlook/triggers/newEmail/normalize";

const CONTEXT = {
  subscriptionId: "sub-1",
  changeType: "created",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  accountId: "alice@contoso.com",
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

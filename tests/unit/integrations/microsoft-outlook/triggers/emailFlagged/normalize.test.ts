/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/microsoft-outlook/triggers/emailFlagged/normalize";

const CONTEXT = {
  subscriptionId: "sub-flagged-1",
  changeType: "updated",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  accountId: "alice@contoso.com",
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

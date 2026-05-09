/**
 * @jest-environment node
 */
import type { GraphEvent } from "@/integrations/microsoft-outlook-calendar/api/eventsCreate";
import {
  normalize,
  normalizeDeleted,
} from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/normalize";

const CONTEXT = {
  subscriptionId: "sub-1",
  changeType: "created",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  accountId: "alice@contoso.com",
};

describe("Outlook Calendar event_changed normalize", () => {
  it("produces the canonical TriggerEvent shape from a Graph event", () => {
    // Body contentType is typed as "Text" | "HTML" upstream, but Graph
    // sometimes returns lowercase. Cast through GraphEvent to exercise
    // the normalizer's defensive lowercasing.
    const event = normalize(
      {
        id: "evt-1",
        subject: "Project sync",
        body: {
          contentType: "html" as unknown as "HTML",
          content: "<p>Quarterly review</p>",
        },
        start: { dateTime: "2026-05-15T14:00:00", timeZone: "America/New_York" },
        end: { dateTime: "2026-05-15T15:00:00", timeZone: "America/New_York" },
        isAllDay: false,
        location: { displayName: "Conference Room A" },
        attendees: [
          {
            emailAddress: { name: "Bob", address: "bob@x.com" },
            type: "required",
            status: { response: "accepted", time: "2026-05-08T11:00:00Z" },
          },
          {
            emailAddress: { name: "Carol", address: "carol@x.com" },
            type: "optional",
          },
        ],
        organizer: {
          emailAddress: { name: "Alice", address: "alice@contoso.com" },
        },
        isOnlineMeeting: true,
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meet/abc" },
        importance: "high",
        sensitivity: "confidential",
        webLink: "https://outlook.office.com/calendar/...",
        createdDateTime: "2026-05-08T10:30:00Z",
        lastModifiedDateTime: "2026-05-08T11:00:00Z",
      },
      CONTEXT,
    );

    expect(event).toEqual({
      provider: "microsoft-outlook-calendar",
      eventType: "event_changed",
      eventId: "sub-1:evt-1:created",
      occurredAt: "2026-05-08T11:00:00Z",
      accountId: "alice@contoso.com",
      payload: {
        eventId: "evt-1",
        changeType: "created",
        subject: "Project sync",
        start: {
          dateTime: "2026-05-15T14:00:00",
          timeZone: "America/New_York",
        },
        end: { dateTime: "2026-05-15T15:00:00", timeZone: "America/New_York" },
        isAllDay: false,
        location: "Conference Room A",
        body: { contentType: "html", content: "<p>Quarterly review</p>" },
        attendees: [
          {
            name: "Bob",
            address: "bob@x.com",
            type: "required",
            status: { response: "accepted", time: "2026-05-08T11:00:00Z" },
          },
          {
            name: "Carol",
            address: "carol@x.com",
            type: "optional",
            status: { response: "none", time: null },
          },
        ],
        organizer: { name: "Alice", address: "alice@contoso.com" },
        isOnlineMeeting: true,
        onlineMeetingUrl: "https://teams.microsoft.com/l/meet/abc",
        webLink: "https://outlook.office.com/calendar/...",
        importance: "high",
        sensitivity: "confidential",
        createdDateTime: "2026-05-08T10:30:00Z",
        lastModifiedDateTime: "2026-05-08T11:00:00Z",
      },
    });
  });

  it("dedup key shape is ${subscriptionId}:${eventId}:${changeType}", () => {
    const event = normalize(
      { id: "graph-evt-X" },
      { ...CONTEXT, subscriptionId: "sub-XYZ", changeType: "updated" },
    );
    expect(event.eventId).toBe("sub-XYZ:graph-evt-X:updated");
  });

  it("surfaces changeType from the notification context, not the body", () => {
    // Graph events don't carry a changeType field on the body; the
    // notification envelope is the only authoritative source for which
    // CRUD operation triggered the notification.
    const event = normalize({ id: "evt" }, { ...CONTEXT, changeType: "updated" });
    expect(event.payload.changeType).toBe("updated");
  });

  it("uses lastModifiedDateTime > createdDateTime > notification fallback for occurredAt", () => {
    const r1 = normalize(
      { id: "e", lastModifiedDateTime: "1", createdDateTime: "0" },
      CONTEXT,
    );
    expect(r1.occurredAt).toBe("1");

    const r2 = normalize({ id: "e", createdDateTime: "0" }, CONTEXT);
    expect(r2.occurredAt).toBe("0");

    const r3 = normalize({ id: "e" }, CONTEXT);
    expect(r3.occurredAt).toBe("2026-05-08T12:00:00Z");
  });

  it("normalizes body contentType to lowercase 'html' or 'text' (defensively)", () => {
    const html = normalize(
      { id: "e1", body: { contentType: "HTML", content: "x" } },
      CONTEXT,
    );
    expect(html.payload.body).toEqual({ contentType: "html", content: "x" });

    const text = normalize(
      { id: "e2", body: { contentType: "Text", content: "x" } },
      CONTEXT,
    );
    expect(text.payload.body).toEqual({ contentType: "text", content: "x" });

    // Unknown values default to "text" rather than passing through.
    // Cast through GraphEvent to bypass the upstream "Text" | "HTML"
    // tightness — the normalizer is intentionally permissive at runtime.
    const weird = normalize(
      {
        id: "e3",
        body: { contentType: "richtext" as unknown as "HTML", content: "x" },
      } as GraphEvent,
      CONTEXT,
    );
    expect((weird.payload.body as { contentType: string }).contentType).toBe(
      "text",
    );
  });

  it("body: null when Graph omits the body field entirely", () => {
    const event = normalize({ id: "e" }, CONTEXT);
    expect(event.payload.body).toBeNull();
  });

  it("location is the Graph displayName string, not the wrapper object", () => {
    const event = normalize(
      { id: "e", location: { displayName: "Hybrid" } },
      CONTEXT,
    );
    expect(event.payload.location).toBe("Hybrid");
  });

  it("location: null when Graph omits the location field", () => {
    const event = normalize({ id: "e" }, CONTEXT);
    expect(event.payload.location).toBeNull();
  });

  it("organizer falls through to null when emailAddress.address is missing", () => {
    const event = normalize(
      { id: "e", organizer: { emailAddress: { name: "Alice" } } },
      CONTEXT,
    );
    expect(event.payload.organizer).toBeNull();
  });

  it("filters attendees with no address (Graph occasionally returns blanks)", () => {
    const event = normalize(
      {
        id: "e",
        attendees: [
          {
            emailAddress: { address: "real@x.com" },
            type: "required",
          },
          { emailAddress: {}, type: "optional" } as unknown as never,
          {
            emailAddress: { address: "another@x.com" },
            type: "resource",
          },
        ],
      },
      CONTEXT,
    );
    expect(event.payload.attendees).toEqual([
      {
        name: "",
        address: "real@x.com",
        type: "required",
        status: { response: "none", time: null },
      },
      {
        name: "",
        address: "another@x.com",
        type: "resource",
        status: { response: "none", time: null },
      },
    ]);
  });

  it("defaults importance to 'normal', sensitivity to 'normal', isAllDay/isOnlineMeeting to false", () => {
    const event = normalize({ id: "e" }, CONTEXT);
    expect(event.payload.importance).toBe("normal");
    expect(event.payload.sensitivity).toBe("normal");
    expect(event.payload.isAllDay).toBe(false);
    expect(event.payload.isOnlineMeeting).toBe(false);
    expect(event.payload.onlineMeetingUrl).toBeNull();
    expect(event.payload.webLink).toBeNull();
  });
});

describe("Outlook Calendar event_changed normalizeDeleted", () => {
  it("emits a stable minimal payload with subject: null when GET 404s after a delete notification", () => {
    const event = normalizeDeleted("evt-deleted", {
      ...CONTEXT,
      changeType: "deleted",
    });

    expect(event).toEqual({
      provider: "microsoft-outlook-calendar",
      eventType: "event_changed",
      eventId: "sub-1:evt-deleted:deleted",
      occurredAt: "2026-05-08T12:00:00Z",
      accountId: "alice@contoso.com",
      payload: {
        eventId: "evt-deleted",
        changeType: "deleted",
        subject: null,
        start: null,
        end: null,
        isAllDay: false,
        location: null,
        body: null,
        attendees: [],
        organizer: null,
        isOnlineMeeting: false,
        onlineMeetingUrl: null,
        webLink: null,
        importance: "normal",
        sensitivity: "normal",
        createdDateTime: null,
        lastModifiedDateTime: null,
      },
    });
  });

  it("dedup key shape matches normalize() so deleted events dedup against the same key the receiver would produce on a successful fetch", () => {
    const event = normalizeDeleted("evt-X", {
      ...CONTEXT,
      subscriptionId: "sub-Y",
      changeType: "deleted",
    });
    expect(event.eventId).toBe("sub-Y:evt-X:deleted");
  });

  it("payload key set is identical to normalize() (workflow authors see one stable shape)", () => {
    const full = normalize({ id: "e" }, CONTEXT);
    const deleted = normalizeDeleted("e", CONTEXT);

    const fullKeys = Object.keys(full.payload).sort();
    const deletedKeys = Object.keys(deleted.payload).sort();

    expect(deletedKeys).toEqual(fullKeys);
  });
});

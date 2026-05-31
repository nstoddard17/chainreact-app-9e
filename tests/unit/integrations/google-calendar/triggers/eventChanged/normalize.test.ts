/**
 * @jest-environment node
 */
import {
  classifyChangeKind,
  normalize,
} from "@/integrations/google-calendar/triggers/eventChanged/normalize";

describe("classifyChangeKind", () => {
  it("classifies status='cancelled' as cancelled regardless of timestamps", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "cancelled",
        created: "2026-05-08T10:00:00Z",
        updated: "2026-05-08T10:00:00Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("cancelled");
  });

  it("classifies created==updated as 'created' (heuristic)", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
        created: "2026-05-08T10:00:00Z",
        updated: "2026-05-08T10:00:00Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("created");
  });

  it("classifies created<updated as 'updated'", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
        created: "2026-05-08T10:00:00Z",
        updated: "2026-05-08T10:30:00Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("updated");
  });

  it("classifies missing timestamps as 'updated' (fallback)", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("updated");
  });
});

describe("normalize", () => {
  it("builds a TriggerEvent with combined eventId for dedup", () => {
    const event = normalize(
      {
        id: "evt-1",
        summary: "Standup",
        status: "confirmed",
        updated: "2026-05-08T10:30:00Z",
      } as unknown as Parameters<typeof normalize>[0],
      { providerAccountId: "alice@example.com", calendarId: "primary" },
    );
    expect(event.provider).toBe("google-calendar");
    expect(event.eventType).toBe("event_changed");
    expect(event.providerAccountId).toBe("alice@example.com");
    // dedup key combines eventId + updated so a real edit produces fresh dedup
    expect(event.eventId).toBe("evt-1:2026-05-08T10:30:00Z");
    expect(event.occurredAt).toBe("2026-05-08T10:30:00Z");
  });

  it("payload includes changeKind, calendarId, eventId, summary, attendees", () => {
    const event = normalize(
      {
        id: "evt-2",
        summary: "Demo",
        location: "Zoom",
        status: "confirmed",
        updated: "2026-05-08T11:00:00Z",
        created: "2026-05-08T11:00:00Z",
        attendees: [{ email: "a@x.com" }],
        htmlLink: "https://...",
      } as unknown as Parameters<typeof normalize>[0],
      { providerAccountId: "u@x.com", calendarId: "primary" },
    );
    expect(event.payload).toMatchObject({
      changeKind: "created", // created==updated
      calendarId: "primary",
      eventId: "evt-2",
      summary: "Demo",
      location: "Zoom",
      attendees: [{ email: "a@x.com" }],
      htmlLink: "https://...",
      status: "confirmed",
      updated: "2026-05-08T11:00:00Z",
    });
  });
});

/**
 * @jest-environment node
 */
import {
  normalizeHubSpotEvent,
  HUBSPOT_TRIGGER_EVENT_TYPE,
} from "@/integrations/hubspot/triggers/webhookReceived/normalize";

describe("normalizeHubSpotEvent", () => {
  it("maps a contact.creation event to a canonical TriggerEvent", () => {
    const result = normalizeHubSpotEvent({
      eventId: 12345,
      subscriptionId: 67890,
      portalId: 9988776,
      appId: 11223344,
      occurredAt: 1700000000000,
      subscriptionType: "contact.creation",
      attemptNumber: 0,
      objectId: 5001,
    });
    expect(result).toEqual({
      provider: "hubspot",
      eventType: HUBSPOT_TRIGGER_EVENT_TYPE,
      eventId: "12345",
      occurredAt: new Date(1700000000000).toISOString(),
      accountId: "9988776",
      payload: expect.objectContaining({
        subscriptionType: "contact.creation",
        portalId: "9988776",
        hubId: "9988776",
        objectId: "5001",
        propertyName: null,
        propertyValue: null,
        occurredAt: 1700000000000,
        subscriptionId: "67890",
        appId: "11223344",
        attemptNumber: 0,
        changeSource: null,
      }),
    });
    expect(result.payload.event).toBeDefined();
  });

  it("includes propertyName + propertyValue for propertyChange events", () => {
    const result = normalizeHubSpotEvent({
      eventId: 1,
      portalId: 42,
      subscriptionType: "contact.propertyChange",
      objectId: 99,
      propertyName: "email",
      propertyValue: "new@example.com",
      occurredAt: 1700000000000,
    });
    expect(result.payload.propertyName).toBe("email");
    expect(result.payload.propertyValue).toBe("new@example.com");
  });

  it("uses HubSpot eventId as the dedup id when present", () => {
    const result = normalizeHubSpotEvent({
      eventId: 42,
      portalId: 1,
      subscriptionType: "contact.creation",
      objectId: 2,
      occurredAt: 1700000000000,
    });
    expect(result.eventId).toBe("42");
  });

  it("falls back to deterministic dedup key when eventId is absent", () => {
    const result = normalizeHubSpotEvent({
      portalId: 42,
      subscriptionType: "deal.creation",
      objectId: 100,
      occurredAt: 1700000000000,
    });
    // Format: portalId:eventType:objectId:propertyName?:occurredAt
    expect(result.eventId).toBe("42:deal.creation:100:no-property:1700000000000");
  });

  it("falls back to current time when occurredAt is absent", () => {
    const before = Date.now();
    const result = normalizeHubSpotEvent({
      eventId: 1,
      portalId: 42,
      subscriptionType: "contact.creation",
    });
    const after = Date.now();
    const parsed = new Date(result.occurredAt).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("stringifies numeric ids consistently", () => {
    const result = normalizeHubSpotEvent({
      eventId: 1,
      portalId: 12345,
      subscriptionType: "contact.creation",
      objectId: 67890,
      occurredAt: 1700000000000,
    });
    expect(result.accountId).toBe("12345");
    expect(result.payload.portalId).toBe("12345");
    expect(result.payload.hubId).toBe("12345");
    expect(result.payload.objectId).toBe("67890");
  });
});

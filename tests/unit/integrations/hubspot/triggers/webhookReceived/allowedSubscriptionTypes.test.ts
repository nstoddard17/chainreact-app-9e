/**
 * @jest-environment node
 */
import {
  HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES,
  isAllowedHubSpotSubscriptionType,
  isPropertyChangeSubscriptionType,
} from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";

describe("HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES", () => {
  it("declares exactly the 10 Slice 13 Batch 1 entries", () => {
    expect([...HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES].sort()).toEqual(
      [
        "contact.creation",
        "contact.propertyChange",
        "contact.deletion",
        "company.creation",
        "company.propertyChange",
        "company.deletion",
        "deal.creation",
        "deal.propertyChange",
        "deal.deletion",
        "ticket.creation",
      ].sort(),
    );
  });

  it("does NOT include deferred Batch 2 entries (ticket.propertyChange, ticket.deletion, engagements, forms)", () => {
    const deferred = [
      "ticket.propertyChange",
      "ticket.deletion",
      "note.creation",
      "task.creation",
      "call.creation",
      "meeting.creation",
      "form.submission",
    ];
    for (const t of deferred) {
      expect(isAllowedHubSpotSubscriptionType(t)).toBe(false);
    }
  });

  it("isPropertyChangeSubscriptionType correctly identifies propertyChange types", () => {
    expect(isPropertyChangeSubscriptionType("contact.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("company.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("deal.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("contact.creation")).toBe(false);
    expect(isPropertyChangeSubscriptionType("contact.deletion")).toBe(false);
    expect(isPropertyChangeSubscriptionType("ticket.creation")).toBe(false);
  });
});

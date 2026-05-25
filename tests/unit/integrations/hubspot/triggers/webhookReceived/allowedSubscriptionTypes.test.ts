/**
 * @jest-environment node
 */
import {
  HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES,
  isAllowedHubSpotSubscriptionType,
  isPropertyChangeSubscriptionType,
} from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";

describe("HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES", () => {
  it("declares exactly the 12 entries (10 Slice 13 + 2 HubSpot 2.1)", () => {
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
        "ticket.propertyChange",
        "ticket.deletion",
      ].sort(),
    );
  });

  it("HubSpot 2.1 PORT set: ticket.propertyChange + ticket.deletion are allowed", () => {
    expect(isAllowedHubSpotSubscriptionType("ticket.propertyChange")).toBe(
      true,
    );
    expect(isAllowedHubSpotSubscriptionType("ticket.deletion")).toBe(true);
  });

  it("does NOT include deferred entries (engagements, form.submission)", () => {
    const deferred = [
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

  it("isPropertyChangeSubscriptionType correctly identifies propertyChange types — incl. ticket.propertyChange", () => {
    expect(isPropertyChangeSubscriptionType("contact.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("company.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("deal.propertyChange")).toBe(true);
    expect(isPropertyChangeSubscriptionType("ticket.propertyChange")).toBe(
      true,
    );
    expect(isPropertyChangeSubscriptionType("contact.creation")).toBe(false);
    expect(isPropertyChangeSubscriptionType("contact.deletion")).toBe(false);
    expect(isPropertyChangeSubscriptionType("ticket.creation")).toBe(false);
    expect(isPropertyChangeSubscriptionType("ticket.deletion")).toBe(false);
  });
});

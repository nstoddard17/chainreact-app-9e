/**
 * @jest-environment node
 *
 * Registry-coverage test — confirms ALL three Mailchimp polling
 * triggers are wired: manifest flag flipped, activation hooks
 * registered, polling handlers registered.
 *
 * Anti-test: a forgotten registration would silently break workflow
 * activation OR the cron tick would skip the row (no handler
 * found).
 */
import "@/integrations/_registry";

import { mailchimpManifest } from "@/integrations/mailchimp/manifest";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";

const POLLING_TRIGGER_TYPES = [
  "campaign_created",
  "email_opened",
  "link_clicked",
] as const;

function fakeTrigger(eventType: string) {
  return {
    id: "tr1",
    workflowId: "w1",
    userId: "u1",
    provider: "mailchimp",
    eventType,
    nodeId: "n1",
    config: {},
    accountId: null,
    registeredAt: "2026-01-01T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("Mailchimp polling-trigger registry coverage", () => {
  it("manifest declares capabilities.pollingTrigger: true", () => {
    expect(mailchimpManifest.capabilities.pollingTrigger).toBe(true);
  });

  it.each(POLLING_TRIGGER_TYPES)(
    "activation hook registered for (mailchimp, %s)",
    (eventType) => {
      const fn = findActivation("mailchimp", eventType);
      expect(fn).not.toBeNull();
      expect(typeof fn).toBe("function");
    },
  );

  it.each(POLLING_TRIGGER_TYPES)(
    "polling handler registered for (mailchimp, %s)",
    (eventType) => {
      const handler = findPollingHandler(fakeTrigger(eventType));
      expect(handler).not.toBeNull();
      expect(handler!.id).toBe(`mailchimp/${eventType}`);
    },
  );

  it("polling handlers are mutually exclusive (canHandle predicates don't overlap)", () => {
    // Pick one of each — confirm the registry returns the right
    // handler for each eventType.
    for (const eventType of POLLING_TRIGGER_TYPES) {
      const handler = findPollingHandler(fakeTrigger(eventType));
      expect(handler!.canHandle(fakeTrigger(eventType))).toBe(true);
      // The other two should NOT match.
      for (const other of POLLING_TRIGGER_TYPES) {
        if (other === eventType) continue;
        expect(handler!.canHandle(fakeTrigger(other))).toBe(false);
      }
    }
  });

  it("polling handlers default to the V2 5-minute cadence", () => {
    for (const eventType of POLLING_TRIGGER_TYPES) {
      const handler = findPollingHandler(fakeTrigger(eventType));
      expect(handler!.getIntervalMs("default")).toBe(5 * 60 * 1000);
    }
  });
});

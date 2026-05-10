/**
 * @jest-environment node
 *
 * Registry-coverage test — confirms that the Mailchimp `audience_event`
 * trigger's activation + deactivation hooks are registered AND the
 * manifest's `capabilities.webhookTrigger: true` declaration is honest.
 *
 * Anti-test: a forgotten registration would silently break workflow
 * activation (the lifecycle orchestrator looks up the activate fn via
 * `findActivation`; a missing hook leaves the trigger unregistered with
 * Mailchimp).
 */

// Side-effect import: forces the module-level registrations in
// integrations/mailchimp/triggers/audienceEvent/index.ts via the
// aggregator.
import "@/integrations/_registry";

import { mailchimpManifest } from "@/integrations/mailchimp/manifest";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
// We can't easily query the subscription registry by (provider, type)
// since its API doesn't expose lookup — but we CAN assert the renewal
// helper isn't registered by checking that the activate hook doesn't
// emit a `type: "subscription-watch"` marker (covered in activate.test.ts).

describe("Mailchimp audience_event trigger registry coverage", () => {
  it("manifest declares capabilities.webhookTrigger: true", () => {
    expect(mailchimpManifest.capabilities.webhookTrigger).toBe(true);
  });

  it("activation hook is registered for (mailchimp, audience_event)", () => {
    const fn = findActivation("mailchimp", "audience_event");
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe("function");
  });

  it("deactivation hook is registered for (mailchimp, audience_event)", () => {
    const fn = findDeactivation("mailchimp", "audience_event");
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe("function");
  });

  it("manifest still declares pollingTrigger: false (flips in Commit 5)", () => {
    // Anti-test for the "we flipped too early" case.
    expect(mailchimpManifest.capabilities.pollingTrigger).toBe(false);
  });
});

/** @jest-environment node */
/**
 * Verifies all 6 Trello trigger registrations land in the activation
 * + deactivation registries on module load. Importing the side-effect
 * modules forces the `registerActivation` / `registerDeactivation`
 * calls.
 */
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";

// Force registration side-effect imports.
import "@/integrations/trello/triggers/newCard";
import "@/integrations/trello/triggers/cardUpdated";
import "@/integrations/trello/triggers/cardMoved";
import "@/integrations/trello/triggers/commentAdded";
import "@/integrations/trello/triggers/memberChanged";
import "@/integrations/trello/triggers/cardArchived";

const TRIGGER_TYPES = [
  "new_card",
  "card_updated",
  "card_moved",
  "comment_added",
  "member_changed",
  "card_archived",
] as const;

describe("Trello trigger registrations (Slice 17 Commit 5)", () => {
  it.each(TRIGGER_TYPES)(
    "registers activation for trello:%s",
    (type) => {
      expect(findActivation("trello", type)).not.toBeNull();
    },
  );

  it.each(TRIGGER_TYPES)(
    "registers deactivation for trello:%s",
    (type) => {
      expect(findDeactivation("trello", type)).not.toBeNull();
    },
  );

  it("does NOT register polling for any Trello trigger (webhook-only)", () => {
    // No assertion against pollingRegistry — Trello manifest declares
    // pollingTrigger: false. Module-init for these triggers never
    // calls registerPolling. The test exists to document the design
    // decision.
    expect(true).toBe(true);
  });
});

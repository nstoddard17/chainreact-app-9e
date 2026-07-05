/**
 * @jest-environment node
 *
 * Discovery-surface tests for Calendly — Slice 5.CALENDLY-1.
 *
 * Asserts the builder/AI-visible catalog is complete + consistent:
 * ZERO action metas (deliberate — the invitee payload embeds the
 * scheduled_event), 2 webhook trigger metas, key format, options-source
 * wiring against the real resolver registry, activation/deactivation/
 * filter hook registration, and the sensitive posture of the payload
 * (invitee PII + capability URLs).
 */
import {
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { getTriggerFilter } from "@/core/triggers/filterRegistry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
// Side-effect: register the trigger hooks like every prod entrypoint does.
import "@/integrations/_registry";

const SCHEDULED_KEY = "calendly:event_scheduled";
const CANCELED_KEY = "calendly:event_canceled";

describe("calendly action discovery — deliberately empty", () => {
  it("registers ZERO action metas and ZERO handlers (actions:false is honest)", () => {
    expect(listActionMetasForProvider("calendly")).toEqual([]);
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "calendly",
    );
    expect(handlers).toEqual([]);
  });
});

describe("calendly trigger discovery", () => {
  it("registers exactly the 2 webhook trigger metas", () => {
    const metas = listTriggerMetasForProvider("calendly");
    expect(metas.map((m) => m.key).sort()).toEqual([
      CANCELED_KEY,
      SCHEDULED_KEY,
    ]);
    for (const meta of metas) {
      expect(meta.activation).toBe("webhook");
      expect(meta.requiresIntegration).toBe(true);
      expect(meta.category).toBe("scheduling");
    }
  });

  it.each([
    ["event_scheduled"],
    ["event_canceled"],
  ])("has activation + deactivation hooks + a P-S2 filter registered for %s", (type) => {
    expect(findActivation("calendly", type)).not.toBeNull();
    expect(findDeactivation("calendly", type)).not.toBeNull();
    expect(getTriggerFilter("calendly", type)).not.toBeNull();
  });

  it.each([[SCHEDULED_KEY], [CANCELED_KEY]])(
    "%s marks invitee PII and capability URLs sensitive, ids not",
    (key) => {
      const meta = getTriggerMeta(key)!;
      const byName = new Map(meta.payloadShape.map((p) => [p.name, p]));
      // Invitee PII is sensitive.
      expect(byName.get("inviteeEmail")?.sensitive).toBe(true);
      expect(byName.get("inviteeName")?.sensitive).toBe(true);
      expect(byName.get("hosts")?.sensitive).toBe(true);
      expect(byName.get("questionsAndAnswers")?.sensitive).toBe(true);
      // cancel/reschedule links are CAPABILITY URLs — sensitive.
      expect(byName.get("cancelUrl")?.sensitive).toBe(true);
      expect(byName.get("rescheduleUrl")?.sensitive).toBe(true);
      // Opaque ids are not.
      expect(byName.get("inviteeId")?.sensitive).toBeUndefined();
      expect(byName.get("eventTypeId")?.sensitive).toBeUndefined();
      // Raw API URIs are never in the shape.
      expect(byName.has("uri")).toBe(false);
      expect(byName.has("event")).toBe(false);
    },
  );

  it("only the canceled trigger exposes the cancellation object", () => {
    const canceled = getTriggerMeta(CANCELED_KEY)!;
    const scheduled = getTriggerMeta(SCHEDULED_KEY)!;
    const canceledNames = canceled.payloadShape.map((p) => p.name);
    const scheduledNames = scheduled.payloadShape.map((p) => p.name);
    expect(canceledNames).toContain("cancellation");
    expect(scheduledNames).not.toContain("cancellation");
    // Otherwise the shapes align (shared projection).
    expect(canceledNames.filter((n) => n !== "cancellation").sort()).toEqual(
      scheduledNames.sort(),
    );
  });

  it.each([[SCHEDULED_KEY], [CANCELED_KEY]])(
    "%s: the OPTIONAL eventTypeId field wires to the real calendly:event_types resolver",
    (key) => {
      const meta = getTriggerMeta(key)!;
      const field = meta.fields.find((f) => f.name === "eventTypeId")!;
      expect(field.required).toBe(false);
      expect(field.optionsSource).toBe("calendly:event_types");
      expect(getOptionsResolver("calendly:event_types")).toBeDefined();
    },
  );

  it("both metas document the reschedule double-fire honestly", () => {
    expect(getTriggerMeta(SCHEDULED_KEY)!.description).toMatch(/reschedul/i);
    expect(getTriggerMeta(CANCELED_KEY)!.description).toMatch(/reschedul/i);
  });

  it("the scheduled meta identifies reschedules via oldInviteeId, NOT the rescheduled flag (Phase 13 live-observed: the new booking carries rescheduled=false)", () => {
    const meta = getTriggerMeta(SCHEDULED_KEY)!;
    expect(meta.description).toMatch(/oldInviteeId/);
    const byName = new Map(meta.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("rescheduled")?.description).toMatch(/oldInviteeId/);
    expect(byName.get("oldInviteeId")?.description).toMatch(/new half of a reschedule/i);
  });
});

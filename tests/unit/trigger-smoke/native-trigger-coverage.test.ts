/**
 * @jest-environment node
 *
 * Native TRIGGER smoke coverage — launch-ready inventory pin.
 *
 * Native triggers are provider-free: manual run-now and the server-side scheduled
 * trigger. This suite pins that native trigger smoke coverage is COMPLETE and stays
 * complete against the two sources of truth:
 *   - ALL_TRIGGER_META (the discovery inventory the builder/registry read), and
 *   - TRIGGER_CERTIFICATIONS (the durable trigger-smoke cert seed).
 *
 * Requirements enforced:
 *   - the inventory holds exactly the known native triggers;
 *   - every native trigger has an EXPLICIT cert record (never a MISSING_HARNESS or
 *     stale NOT_RUN gap);
 *   - native:schedule.fired is LIVE_PASS (real arm -> tick -> dispatchTriggerEvent
 *     -> terminal run -> cleanup, via tests/trigger-smoke/scheduledSmoke.ts);
 *   - native:manual.run stays RUN_NOW_PROVEN — the honest ceiling for it: run-now
 *     (enqueueRun) deliberately bypasses dispatchTriggerEvent + trigger_resources,
 *     so there is no stronger dispatch cert to earn without misrepresenting it;
 *   - each cert record's activation matches its registered meta activation.
 *
 * A new native trigger added to the inventory without a cert record fails CI here.
 */
import { ALL_TRIGGER_META } from "@/services/discovery/_metaInventory";
import {
  TRIGGER_CERTIFICATIONS,
  type TriggerCertRecord,
} from "@/tests/trigger-smoke/triggerCertificationSeed";

/**
 * Expected durable status per native trigger. schedule.fired is a true dispatch
 * cert; manual.run's honest ceiling is RUN_NOW_PROVEN (documented in the seed).
 */
const EXPECTED: Record<string, { activation: TriggerCertRecord["activation"]; status: TriggerCertRecord["status"] }> = {
  "native:manual.run": { activation: "manual", status: "RUN_NOW_PROVEN" },
  "native:schedule.fired": { activation: "scheduled", status: "LIVE_PASS" },
};

const nativeTriggers = () => ALL_TRIGGER_META.filter((t) => t.provider === "native");
const certByKey = new Map(TRIGGER_CERTIFICATIONS.map((c) => [`${c.provider}:${c.type}`, c]));

describe("native trigger smoke coverage — launch-ready pin", () => {
  it("the inventory holds exactly the known native triggers", () => {
    const keys = nativeTriggers()
      .map((t) => `${t.provider}:${t.type}`)
      .sort();
    expect(keys).toEqual(Object.keys(EXPECTED).sort());
  });

  it("every native trigger has an explicit cert record (no MISSING_HARNESS / NOT_RUN gap)", () => {
    for (const t of nativeTriggers()) {
      const key = `${t.provider}:${t.type}`;
      const cert = certByKey.get(key);
      expect({ key, hasCert: cert !== undefined }).toEqual({ key, hasCert: true });
      expect(["MISSING_HARNESS", "NOT_RUN"]).not.toContain(cert!.status);
    }
  });

  it("schedule.fired is LIVE_PASS; manual.run stays the honest RUN_NOW_PROVEN ceiling", () => {
    for (const [key, exp] of Object.entries(EXPECTED)) {
      const cert = certByKey.get(key);
      expect(cert).toBeDefined();
      expect({ key, status: cert!.status, activation: cert!.activation }).toEqual({
        key,
        status: exp.status,
        activation: exp.activation,
      });
    }
  });

  it("each cert record's activation matches its registered meta activation", () => {
    for (const t of nativeTriggers()) {
      const key = `${t.provider}:${t.type}`;
      const cert = certByKey.get(key)!;
      expect({ key, activation: cert.activation }).toEqual({ key, activation: t.activation });
    }
  });

  it("pins the native trigger count", () => {
    expect(nativeTriggers()).toHaveLength(2);
  });
});

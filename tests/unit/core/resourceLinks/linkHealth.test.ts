/**
 * @jest-environment node
 *
 * Pure stale-link health assessment (5.TRUCK-BRIDGE-1 CS-5).
 *
 * The load-bearing property here is the OUTAGE rule: when a provider list could
 * not be loaded, every link on that side must read `*_unknown`, never
 * `*_missing`. Getting that backwards would render a whole fleet as "no longer
 * visible" during a five-minute Fleetio blip and invite users to remove
 * perfectly good mappings.
 */
import { assessLinkHealth } from "@/core/resourceLinks/linkHealth";

const LINK_A = { id: "link-a", sourceVehicleId: "motive-1", targetVehicleId: "42" };
const LINK_B = { id: "link-b", sourceVehicleId: "motive-2", targetVehicleId: "907" };

const BOTH_VISIBLE = {
  links: [LINK_A],
  sources: [{ vehicleId: "motive-1" }],
  targets: [{ vehicleId: "42" }],
  sourceListAvailable: true,
  targetListAvailable: true,
};

describe("healthy", () => {
  it("reports ok when both vehicles are visible", () => {
    expect(assessLinkHealth(BOTH_VISIBLE)).toEqual([
      { linkId: "link-a", statuses: ["ok"], needsAttention: false },
    ]);
  });

  it("returns one entry per link, in input order", () => {
    const result = assessLinkHealth({
      ...BOTH_VISIBLE,
      links: [LINK_A, LINK_B],
      sources: [{ vehicleId: "motive-1" }, { vehicleId: "motive-2" }],
      targets: [{ vehicleId: "42" }, { vehicleId: "907" }],
    });
    expect(result.map((h) => h.linkId)).toEqual(["link-a", "link-b"]);
  });

  it("handles an empty link set", () => {
    expect(assessLinkHealth({ ...BOTH_VISIBLE, links: [] })).toEqual([]);
  });
});

describe("genuinely missing vehicles", () => {
  it("flags a Motive source that is no longer listed", () => {
    const [health] = assessLinkHealth({ ...BOTH_VISIBLE, sources: [] });
    expect(health!.statuses).toEqual(["source_missing"]);
    expect(health!.needsAttention).toBe(true);
  });

  it("flags a Fleetio target that is no longer listed", () => {
    const [health] = assessLinkHealth({ ...BOTH_VISIBLE, targets: [] });
    expect(health!.statuses).toEqual(["target_missing"]);
    expect(health!.needsAttention).toBe(true);
  });

  it("flags BOTH sides when both vehicles vanished", () => {
    const [health] = assessLinkHealth({ ...BOTH_VISIBLE, sources: [], targets: [] });
    expect(health!.statuses).toEqual(["source_missing", "target_missing"]);
    expect(health!.needsAttention).toBe(true);
  });

  it("flags an ARCHIVED Fleetio target more specifically than 'missing'", () => {
    const [health] = assessLinkHealth({
      ...BOTH_VISIBLE,
      targets: [{ vehicleId: "42", archivedAt: "2026-07-01T00:00:00Z" }],
    });
    expect(health!.statuses).toEqual(["target_archived"]);
    expect(health!.needsAttention).toBe(true);
  });

  it("treats an explicit null archivedAt as active, not archived", () => {
    const [health] = assessLinkHealth({
      ...BOTH_VISIBLE,
      targets: [{ vehicleId: "42", archivedAt: null }],
    });
    expect(health!.statuses).toEqual(["ok"]);
  });
});

describe("provider outage is NOT deletion", () => {
  it("an unavailable Motive list yields source_unknown for EVERY link", () => {
    const result = assessLinkHealth({
      links: [LINK_A, LINK_B],
      sources: [],
      targets: [{ vehicleId: "42" }, { vehicleId: "907" }],
      sourceListAvailable: false,
      targetListAvailable: true,
    });
    for (const health of result) {
      expect(health.statuses).toEqual(["source_unknown"]);
      // An unknown side is a gap in what we can see, not a decision to make.
      expect(health.needsAttention).toBe(false);
    }
    expect(JSON.stringify(result)).not.toContain("source_missing");
  });

  it("an unavailable Fleetio list yields target_unknown, never target_missing", () => {
    const [health] = assessLinkHealth({
      ...BOTH_VISIBLE,
      targets: [],
      targetListAvailable: false,
    });
    expect(health!.statuses).toEqual(["target_unknown"]);
    expect(health!.needsAttention).toBe(false);
  });

  it("BOTH lists unavailable ⇒ both sides unknown, nothing to act on", () => {
    const [health] = assessLinkHealth({
      links: [LINK_A],
      sources: [],
      targets: [],
      sourceListAvailable: false,
      targetListAvailable: false,
    });
    expect(health!.statuses).toEqual(["source_unknown", "target_unknown"]);
    expect(health!.needsAttention).toBe(false);
  });

  it("mixes a REAL missing side with an UNKNOWN side without conflating them", () => {
    const [health] = assessLinkHealth({
      links: [LINK_A],
      sources: [],
      targets: [],
      sourceListAvailable: true, // Motive really doesn't have it
      targetListAvailable: false, // Fleetio simply didn't load
    });
    expect(health!.statuses).toEqual(["source_missing", "target_unknown"]);
    // The genuinely missing side is still actionable.
    expect(health!.needsAttention).toBe(true);
  });

  it("never reports ok on the strength of an unavailable list", () => {
    const [health] = assessLinkHealth({
      ...BOTH_VISIBLE,
      sourceListAvailable: false,
    });
    expect(health!.statuses).not.toContain("ok");
  });
});

describe("purity", () => {
  it("does not mutate its inputs", () => {
    const links = [{ ...LINK_A }];
    const sources = [{ vehicleId: "motive-1" }];
    const targets = [{ vehicleId: "42" }];
    const snapshot = JSON.stringify({ links, sources, targets });
    assessLinkHealth({ links, sources, targets, sourceListAvailable: true, targetListAvailable: true });
    expect(JSON.stringify({ links, sources, targets })).toBe(snapshot);
  });

  it("is deterministic for the same input", () => {
    const a = assessLinkHealth(BOTH_VISIBLE);
    const b = assessLinkHealth(BOTH_VISIBLE);
    expect(a).toEqual(b);
  });
});

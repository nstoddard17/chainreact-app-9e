/**
 * @jest-environment node
 *
 * 5.TRUCK-BRIDGE-1 CS-2 — pure vehicle-match signal tests.
 *
 * The product promise under test is "no silent fuzzy matching": this module may
 * PROPOSE pairings with visible evidence, but it must never decide, never
 * auto-resolve a tie, never pair on two absent values, and never mark anything
 * bulk-confirmable except an unambiguous VIN match.
 */
import {
  proposeVehicleMatches,
  bulkConfirmableProposals,
  MATCH_TIERS,
  TIER_MATCH_BASIS,
  type SourceVehicleIdentity,
  type TargetVehicleIdentity,
} from "@/core/resourceLinks/matchSignals";

function source(over: Partial<SourceVehicleIdentity> = {}): SourceVehicleIdentity {
  return {
    vehicleId: "m-1",
    number: "104",
    vin: "1FUJGLDR9CLBP8834",
    licensePlateNumber: "ABC-1234",
    ...over,
  };
}

function target(over: Partial<TargetVehicleIdentity> = {}): TargetVehicleIdentity {
  return {
    vehicleId: "42",
    name: "Truck 104",
    vin: "1FUJGLDR9CLBP8834",
    licensePlate: "ABC 1234",
    ...over,
  };
}

const propose = (
  sources: SourceVehicleIdentity[],
  targets: TargetVehicleIdentity[],
  extra: Parameters<typeof proposeVehicleMatches>[0] extends infer _ ? object : never = {},
) => proposeVehicleMatches({ sources, targets, ...extra });

describe("tier selection — strongest signal wins, one proposal per pair", () => {
  it("matches on VIN (tier 1) when every field agrees", () => {
    const [p, ...rest] = propose([source()], [target()]);
    expect(rest).toHaveLength(0); // exactly ONE proposal, not four
    expect(p!.tier).toBe("vin");
    expect(p!.confidence).toBe("exact");
    expect(p!.matchBasis).toBe("suggested_vin");
    expect(p!.evidence).toMatch(/^VIN 1FUJGLDR… matches$/);
  });

  it("falls to plate (tier 2) when VINs are absent", () => {
    const [p] = propose([source({ vin: null })], [target({ vin: null })]);
    expect(p!.tier).toBe("plate");
    expect(p!.confidence).toBe("strong");
    // Evidence shows the plate as the user typed it, not the normalized form.
    expect(p!.evidence).toBe("Plate ABC-1234 matches");
  });

  it("normalizes plates across the two providers' formats", () => {
    // Motive "abc 1234" vs Fleetio "ABC-1234" — same plate, different entry.
    const [p] = propose(
      [source({ vin: null, licensePlateNumber: "abc 1234" })],
      [target({ vin: null, licensePlate: "ABC-1234" })],
    );
    expect(p!.tier).toBe("plate");
  });

  it("falls to number equality (tier 3) when VIN and plate are absent", () => {
    const [p] = propose(
      [source({ vin: null, licensePlateNumber: null, number: "104" })],
      [target({ vin: null, licensePlate: null, name: "104" })],
    );
    expect(p!.tier).toBe("number");
    expect(p!.confidence).toBe("moderate");
    expect(p!.evidence).toBe('Unit 104 matches "104"');
  });

  it("falls to whole-token containment (tier 4) for 'Truck 104'", () => {
    const [p] = propose(
      [source({ vin: null, licensePlateNumber: null, number: "104" })],
      [target({ vin: null, licensePlate: null, name: "Truck 104" })],
    );
    expect(p!.tier).toBe("name");
    expect(p!.confidence).toBe("weak");
    expect(p!.matchBasis).toBe("suggested_name");
    expect(p!.evidence).toBe('Unit 104 appears in "Truck 104"');
  });

  it("orders output strongest-tier-first and is deterministic", () => {
    const sources = [
      source({ vehicleId: "m-vin", number: null, licensePlateNumber: null }),
      source({ vehicleId: "m-name", vin: null, licensePlateNumber: null, number: "7" }),
    ];
    const targets = [
      target({ vehicleId: "t-vin", name: null, licensePlate: null }),
      target({ vehicleId: "t-name", vin: null, licensePlate: null, name: "Truck 7" }),
    ];
    const first = propose(sources, targets);
    const second = propose(sources, targets);
    expect(first.map((p) => p.tier)).toEqual(["vin", "name"]);
    expect(first).toEqual(second); // pure: same input → same output
  });
});

describe("tier 4 is whole-token, not substring", () => {
  it("does NOT match unit 10 against 'Truck 104'", () => {
    expect(
      propose(
        [source({ vin: null, licensePlateNumber: null, number: "10" })],
        [target({ vin: null, licensePlate: null, name: "Truck 104" })],
      ),
    ).toEqual([]);
  });

  it("matches unit 104 against 'Truck 104 (spare)' — bounded by punctuation", () => {
    const [p] = propose(
      [source({ vin: null, licensePlateNumber: null, number: "104" })],
      [target({ vin: null, licensePlate: null, name: "Truck 104 (spare)" })],
    );
    expect(p!.tier).toBe("name");
  });

  it("does not treat a regex metacharacter in a unit number as a pattern", () => {
    // A unit literally named "10.4" must not match "Truck 1054" via `.`
    expect(
      propose(
        [source({ vin: null, licensePlateNumber: null, number: "10.4" })],
        [target({ vin: null, licensePlate: null, name: "Truck 1054" })],
      ),
    ).toEqual([]);
  });

  it("does not emit a tier-4 duplicate of an exact tier-3 match", () => {
    const proposals = propose(
      [source({ vin: null, licensePlateNumber: null, number: "104" })],
      [target({ vin: null, licensePlate: null, name: "104" })],
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.tier).toBe("number");
  });
});

describe("null-safety — blank never matches blank", () => {
  it.each([
    ["both VINs null", { vin: null }, { vin: null }],
    ["both VINs empty", { vin: "" }, { vin: "" }],
    ["both VINs whitespace", { vin: "   " }, { vin: "  " }],
  ])("%s does not produce a VIN match", (_label, s, t) => {
    const proposals = propose(
      [source({ ...s, number: null, licensePlateNumber: null })],
      [target({ ...t, name: null, licensePlate: null })],
    );
    expect(proposals).toEqual([]);
  });

  it("blank plates never match", () => {
    expect(
      propose(
        [source({ vin: null, number: null, licensePlateNumber: "  " })],
        [target({ vin: null, name: null, licensePlate: "" })],
      ),
    ).toEqual([]);
  });

  it("blank unit number / name never match", () => {
    expect(
      propose(
        [source({ vin: null, licensePlateNumber: null, number: "" })],
        [target({ vin: null, licensePlate: null, name: "   " })],
      ),
    ).toEqual([]);
  });

  it("a vehicle with NO identity fields at all yields nothing", () => {
    expect(
      propose(
        [source({ vin: null, number: null, licensePlateNumber: null })],
        [target({ vin: null, name: null, licensePlate: null })],
      ),
    ).toEqual([]);
  });
});

describe("ambiguity — flagged, never auto-resolved", () => {
  it("flags one source matching TWO targets at the same tier", () => {
    const proposals = propose(
      [source({ vehicleId: "m-1", number: null, licensePlateNumber: null })],
      [
        target({ vehicleId: "t-1", name: null, licensePlate: null }),
        target({ vehicleId: "t-2", name: null, licensePlate: null }), // same VIN
      ],
    );
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.ambiguous)).toBe(true);
    // No auto-pick and NOTHING bulk-confirmable despite being tier 1.
    expect(proposals.every((p) => !p.bulkConfirmable)).toBe(true);
  });

  it("flags TWO sources matching one target at the same tier", () => {
    const proposals = propose(
      [
        source({ vehicleId: "m-1", number: null, licensePlateNumber: null }),
        source({ vehicleId: "m-2", number: null, licensePlateNumber: null }),
      ],
      [target({ vehicleId: "t-1", name: null, licensePlate: null })],
    );
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.ambiguous)).toBe(true);
  });

  it("does NOT let a rival at a DIFFERENT tier make a proposal ambiguous", () => {
    // m-1 matches t-1 by VIN; m-2 matches t-2 only by name. Neither is a rival
    // of the other, so both stay unambiguous.
    const proposals = propose(
      [
        source({ vehicleId: "m-1", vin: "AAA111", number: null, licensePlateNumber: null }),
        source({ vehicleId: "m-2", vin: null, licensePlateNumber: null, number: "9" }),
      ],
      [
        target({ vehicleId: "t-1", vin: "AAA111", name: null, licensePlate: null }),
        target({ vehicleId: "t-2", vin: null, licensePlate: null, name: "Truck 9" }),
      ],
    );
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => !p.ambiguous)).toBe(true);
  });

  it("a clean one-to-one VIN match is unambiguous", () => {
    const [p] = propose(
      [source({ vehicleId: "m-1", number: null, licensePlateNumber: null })],
      [target({ vehicleId: "t-1", name: null, licensePlate: null })],
    );
    expect(p!.ambiguous).toBe(false);
  });
});

describe("bulk confirm — VIN only, unambiguous only", () => {
  it("marks an unambiguous VIN match bulk-confirmable", () => {
    const proposals = propose(
      [source({ number: null, licensePlateNumber: null })],
      [target({ name: null, licensePlate: null })],
    );
    expect(proposals[0]!.bulkConfirmable).toBe(true);
    expect(bulkConfirmableProposals(proposals)).toHaveLength(1);
  });

  it.each([
    ["plate", { vin: null }, { vin: null }],
    ["number", { vin: null, licensePlateNumber: null }, { vin: null, licensePlate: null, name: "104" }],
  ])("never marks a tier-'%s' match bulk-confirmable", (_label, s, t) => {
    const proposals = propose([source(s)], [target(t)]);
    expect(proposals).not.toHaveLength(0);
    expect(proposals.every((p) => !p.bulkConfirmable)).toBe(true);
    expect(bulkConfirmableProposals(proposals)).toHaveLength(0);
  });

  it("never marks a tier-4 (weak name) match bulk-confirmable", () => {
    const proposals = propose(
      [source({ vin: null, licensePlateNumber: null, number: "104" })],
      [target({ vin: null, licensePlate: null, name: "Truck 104" })],
    );
    expect(proposals[0]!.tier).toBe("name");
    expect(bulkConfirmableProposals(proposals)).toHaveLength(0);
  });

  it("bulk-confirmable is empty when every VIN match is ambiguous", () => {
    const proposals = propose(
      [source({ vehicleId: "m-1", number: null, licensePlateNumber: null })],
      [
        target({ vehicleId: "t-1", name: null, licensePlate: null }),
        target({ vehicleId: "t-2", name: null, licensePlate: null }),
      ],
    );
    expect(bulkConfirmableProposals(proposals)).toHaveLength(0);
  });
});

describe("already-linked exclusion", () => {
  it("excludes vehicles that already hold an active link", () => {
    const sources = [
      source({ vehicleId: "m-1", number: null, licensePlateNumber: null }),
      source({ vehicleId: "m-2", vin: "BBB222", number: null, licensePlateNumber: null }),
    ];
    const targets = [
      target({ vehicleId: "t-1", name: null, licensePlate: null }),
      target({ vehicleId: "t-2", vin: "BBB222", name: null, licensePlate: null }),
    ];
    const proposals = proposeVehicleMatches({
      sources,
      targets,
      alreadyLinkedSourceIds: ["m-1"],
      alreadyLinkedTargetIds: ["t-1"],
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.sourceVehicleId).toBe("m-2");
  });

  it("excluding a rival BEFORE ambiguity means the survivor is no longer flagged", () => {
    // t-1 and t-2 share a VIN with m-1. Once t-1 is already linked, the m-1↔t-2
    // proposal is a clean one-to-one and becomes bulk-confirmable.
    const sources = [source({ vehicleId: "m-1", number: null, licensePlateNumber: null })];
    const targets = [
      target({ vehicleId: "t-1", name: null, licensePlate: null }),
      target({ vehicleId: "t-2", name: null, licensePlate: null }),
    ];
    expect(proposeVehicleMatches({ sources, targets }).every((p) => p.ambiguous)).toBe(true);

    const after = proposeVehicleMatches({ sources, targets, alreadyLinkedTargetIds: ["t-1"] });
    expect(after).toHaveLength(1);
    expect(after[0]!.ambiguous).toBe(false);
    expect(after[0]!.bulkConfirmable).toBe(true);
  });
});

describe("contract alignment + purity", () => {
  it("every tier maps to a match_basis the DB CHECK accepts", () => {
    // The migration's CHECK allows manual + these four; drift here would surface
    // only as a runtime constraint violation on the first confirm.
    const allowed = [
      "manual",
      "suggested_vin",
      "suggested_plate",
      "suggested_number",
      "suggested_name",
    ];
    for (const tier of MATCH_TIERS) {
      expect(allowed).toContain(TIER_MATCH_BASIS[tier]);
    }
    expect(new Set(Object.values(TIER_MATCH_BASIS)).size).toBe(MATCH_TIERS.length);
  });

  it("does not mutate its inputs", () => {
    const sources = [source()];
    const targets = [target()];
    const sourcesCopy = JSON.parse(JSON.stringify(sources));
    const targetsCopy = JSON.parse(JSON.stringify(targets));
    proposeVehicleMatches({ sources, targets });
    expect(sources).toEqual(sourcesCopy);
    expect(targets).toEqual(targetsCopy);
  });

  it("handles empty inputs without throwing", () => {
    expect(proposeVehicleMatches({ sources: [], targets: [] })).toEqual([]);
    expect(proposeVehicleMatches({ sources: [source()], targets: [] })).toEqual([]);
    expect(proposeVehicleMatches({ sources: [], targets: [target()] })).toEqual([]);
  });

  it("scales to a realistic fleet page without pathological output", () => {
    const sources = Array.from({ length: 100 }, (_, i) =>
      source({ vehicleId: `m-${i}`, vin: `VIN${i}`, number: `${i}`, licensePlateNumber: `P${i}` }),
    );
    const targets = Array.from({ length: 100 }, (_, i) =>
      target({ vehicleId: `t-${i}`, vin: `VIN${i}`, name: `Truck ${i}`, licensePlate: `P${i}` }),
    );
    const proposals = proposeVehicleMatches({ sources, targets });
    // One clean VIN pairing per vehicle — not a 100×100 cross product.
    expect(proposals).toHaveLength(100);
    expect(proposals.every((p) => p.tier === "vin" && p.bulkConfirmable)).toBe(true);
  });
});

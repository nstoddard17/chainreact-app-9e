/**
 * @jest-environment node
 *
 * Pure-helper tests for ambiguity-aware run/edit eligibility
 * (Slice 4.CONN-SHARE / CS-3a). No DB, no I/O. `credentialSharing` +
 * `workflowCredentialScope` run for real, so provider classification +
 * WF-RUNPERM delegation are exercised end-to-end.
 */

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  computeProviderSharingStatus,
  computeRunEditEligibility,
  distinctPrivateProviders,
} from "@/core/integrations/sharingEligibility";
import { viewerMayRunEdit } from "@/core/integrations/workflowCredentialScope";

let nodeSeq = 0;
function node(provider: string, kind: "trigger" | "action" = "action") {
  return {
    id: `n${nodeSeq++}`,
    kind,
    provider,
    type: "x",
    config: {},
    position: { x: 0, y: 0 },
  };
}
function def(...providers: string[]): WorkflowDefinition {
  nodeSeq = 0;
  return { nodes: providers.map((p, i) => node(p, i === 0 ? "trigger" : "action")), edges: [] };
}

const CREATOR = "creator-1";
const OTHER = "member-2";

describe("computeProviderSharingStatus", () => {
  it.each([
    ["gmail", 0, "unshared"],
    ["gmail", 1, "single_shared_connector"],
    ["gmail", 2, "ambiguous_shared_connectors"],
    ["gmail", 5, "ambiguous_shared_connectors"],
    ["google-drive", 0, "unshared"],
    ["unknown-provider", 0, "unshared"], // unknown → personal (fail-safe) → private
    ["unknown-provider", 1, "single_shared_connector"],
    ["slack", 0, "not_private"], // account provider
    ["slack", 3, "not_private"],
    ["native", 0, "not_private"], // native pseudo-provider
  ] as const)("%s with %i shared ⇒ %s", (provider, count, expected) => {
    expect(computeProviderSharingStatus(provider, count)).toBe(expected);
  });
});

describe("distinctPrivateProviders", () => {
  it("returns only distinct private providers (excludes account + native)", () => {
    expect(distinctPrivateProviders(def("native", "gmail", "gmail", "slack", "google-drive")).sort()).toEqual([
      "gmail",
      "google-drive",
    ]);
  });
  it("malformed definition ⇒ [] (no throw)", () => {
    expect(distinctPrivateProviders({ nodes: null } as unknown as WorkflowDefinition)).toEqual([]);
  });
});

const NONE: ReadonlyMap<string, number> = new Map();
function counts(rec: Record<string, number>): ReadonlyMap<string, number> {
  return new Map(Object.entries(rec));
}

describe("computeRunEditEligibility — flag OFF preserves WF-RUNPERM exactly", () => {
  it.each([
    ["no private (native+slack), non-creator", def("native", "slack"), OTHER],
    ["private (gmail), creator", def("native", "gmail"), CREATOR],
    ["private (gmail), non-creator", def("native", "gmail"), OTHER],
  ] as const)("%s matches viewerMayRunEdit", (_label, definition, caller) => {
    const res = computeRunEditEligibility({
      definition,
      createdByUserId: CREATOR,
      callerUserId: caller,
      sharedConnectorCountByProvider: NONE,
      flagEnabled: false,
    });
    expect(res.reason).toBe("flag_off_legacy");
    expect(res.allowed).toBe(viewerMayRunEdit({ createdByUserId: CREATOR, definition }, caller));
    expect(res.providerStatuses).toEqual([]);
  });
});

describe("computeRunEditEligibility — flag ON", () => {
  it("no private providers ⇒ allowed (no_private_credentials)", () => {
    const res = computeRunEditEligibility({
      definition: def("native", "slack"),
      createdByUserId: CREATOR,
      callerUserId: OTHER,
      sharedConnectorCountByProvider: NONE,
      flagEnabled: true,
    });
    expect(res).toEqual({ allowed: true, reason: "no_private_credentials", providerStatuses: [] });
  });

  it("creator with private providers ⇒ allowed (creator)", () => {
    const res = computeRunEditEligibility({
      definition: def("native", "gmail"),
      createdByUserId: CREATOR,
      callerUserId: CREATOR,
      sharedConnectorCountByProvider: NONE,
      flagEnabled: true,
    });
    expect(res).toEqual({ allowed: true, reason: "creator", providerStatuses: [] });
  });

  it("non-creator, gmail UNSHARED ⇒ blocked_unshared", () => {
    const res = computeRunEditEligibility({
      definition: def("native", "gmail"),
      createdByUserId: CREATOR,
      callerUserId: OTHER,
      sharedConnectorCountByProvider: counts({ gmail: 0 }),
      flagEnabled: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("blocked_unshared");
    expect(res.providerStatuses).toEqual([{ provider: "gmail", status: "unshared" }]);
  });

  it("non-creator, gmail SINGLE shared connector ⇒ eligible (all_providers_single_shared)", () => {
    const res = computeRunEditEligibility({
      definition: def("native", "gmail"),
      createdByUserId: CREATOR,
      callerUserId: OTHER,
      sharedConnectorCountByProvider: counts({ gmail: 1 }),
      flagEnabled: true,
    });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe("all_providers_single_shared");
    expect(res.providerStatuses).toEqual([{ provider: "gmail", status: "single_shared_connector" }]);
  });

  it("non-creator, gmail TWO shared connectors ⇒ blocked_ambiguous (fail closed)", () => {
    const res = computeRunEditEligibility({
      definition: def("native", "gmail"),
      createdByUserId: CREATOR,
      callerUserId: OTHER,
      sharedConnectorCountByProvider: counts({ gmail: 2 }),
      flagEnabled: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("blocked_ambiguous");
    expect(res.providerStatuses).toEqual([
      { provider: "gmail", status: "ambiguous_shared_connectors" },
    ]);
  });

  describe("mixed providers", () => {
    it("all single-shared ⇒ eligible", () => {
      const res = computeRunEditEligibility({
        definition: def("native", "gmail", "google-drive"),
        createdByUserId: CREATOR,
        callerUserId: OTHER,
        sharedConnectorCountByProvider: counts({ gmail: 1, "google-drive": 1 }),
        flagEnabled: true,
      });
      expect(res.allowed).toBe(true);
      expect(res.reason).toBe("all_providers_single_shared");
    });

    it("one unshared ⇒ blocked_unshared", () => {
      const res = computeRunEditEligibility({
        definition: def("native", "gmail", "google-drive"),
        createdByUserId: CREATOR,
        callerUserId: OTHER,
        sharedConnectorCountByProvider: counts({ gmail: 1, "google-drive": 0 }),
        flagEnabled: true,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("blocked_unshared");
    });

    it("one ambiguous ⇒ blocked_ambiguous (ambiguous reported before unshared)", () => {
      const res = computeRunEditEligibility({
        definition: def("native", "gmail", "google-drive", "microsoft-outlook"),
        createdByUserId: CREATOR,
        callerUserId: OTHER,
        sharedConnectorCountByProvider: counts({ gmail: 1, "google-drive": 2, "microsoft-outlook": 0 }),
        flagEnabled: true,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("blocked_ambiguous");
    });

    it("account + native nodes are unaffected (not counted as private)", () => {
      const res = computeRunEditEligibility({
        definition: def("native", "slack", "gmail"),
        createdByUserId: CREATOR,
        callerUserId: OTHER,
        sharedConnectorCountByProvider: counts({ gmail: 1 }),
        flagEnabled: true,
      });
      expect(res.allowed).toBe(true);
      expect(res.providerStatuses.map((p) => p.provider)).toEqual(["gmail"]); // slack/native absent
    });
  });

  it("malformed definition ⇒ blocked_malformed (fail closed)", () => {
    const res = computeRunEditEligibility({
      definition: { nodes: null } as unknown as WorkflowDefinition,
      createdByUserId: CREATOR,
      callerUserId: OTHER,
      sharedConnectorCountByProvider: NONE,
      flagEnabled: true,
    });
    expect(res).toEqual({ allowed: false, reason: "blocked_malformed", providerStatuses: [] });
  });

  it("NO LEAK: providerStatuses carry only {provider, status} — no ids/counts", () => {
    const res = computeRunEditEligibility({
      definition: def("native", "gmail"),
      createdByUserId: CREATOR,
      callerUserId: OTHER,
      sharedConnectorCountByProvider: counts({ gmail: 2 }),
      flagEnabled: true,
    });
    for (const p of res.providerStatuses) {
      expect(Object.keys(p).sort()).toEqual(["provider", "status"]);
    }
  });
});

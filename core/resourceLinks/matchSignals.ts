/**
 * 5.TRUCK-BRIDGE-1 CS-2 — pure vehicle-match signals.
 *
 * Proposes candidate Motive↔Fleetio vehicle pairings for a HUMAN to confirm.
 * Plan: docs/slices/phase-5/truck-bridge-vehicle-mapping-plan.md §4.5.
 *
 * ── What this module is NOT ─────────────────────────────────────────────────
 * It does not decide anything. It never writes a link, never picks a winner
 * between candidates, never scores, and is never consulted at runtime — the
 * execution path does exact-key lookup against a stored, confirmed link and
 * nothing else. A suggestion is an invitation to click Confirm, and its evidence
 * is shown verbatim so the user can judge it. That is the whole product promise
 * behind "no silent fuzzy matching".
 *
 * PURE by construction (and by `tests/structure/core-purity.test.ts`): no I/O,
 * no clock, no randomness, no repository/service imports. Inputs are plain
 * projections the callers already hold; output is plain data.
 *
 * ── Tiers, strongest first ──────────────────────────────────────────────────
 *   1 `vin`    — VIN equal after trim + uppercase.               EXACT
 *   2 `plate`  — plate equal after trim + uppercase + removing
 *                spaces/hyphens (Motive splits state from number;
 *                Fleetio stores one combined string).            STRONG
 *   3 `number` — Motive `number` equals Fleetio `name`,
 *                case-insensitive.                               MODERATE
 *   4 `name`   — Motive `number` appears as a WHOLE TOKEN inside
 *                Fleetio `name` ("104" in "Truck 104").          WEAK
 *
 * A pair is proposed at its STRONGEST matching tier only — one proposal per
 * pair, never four.
 *
 * ── Ambiguity ───────────────────────────────────────────────────────────────
 * A proposal is `ambiguous` when, AT ITS OWN TIER, its source matches more than
 * one target or its target matches more than one source. Ambiguous proposals are
 * still returned (the user may well know which is right) but are flagged so the
 * UI can require an explicit per-row choice. Nothing is auto-resolved and there
 * is no tie-break heuristic.
 *
 * `bulkConfirmable` is true ONLY for an unambiguous tier-1 (VIN) proposal — the
 * one signal strong enough that confirming in bulk is still a real decision.
 *
 * ── Null-safety ─────────────────────────────────────────────────────────────
 * Blank never matches blank. A field that is null/empty/whitespace on either
 * side simply does not participate in that tier. Fleets that leave VIN empty
 * fall through to tiers 3–4 or manual pairing; nothing breaks and nothing is
 * silently paired on two absent values.
 */

/** Match tiers, strongest first. Mirrors the `suggested_*` match_basis values. */
export const MATCH_TIERS = ["vin", "plate", "number", "name"] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

/** Confidence label for the tier — presentation only, never a numeric score. */
export const TIER_CONFIDENCE: Readonly<Record<MatchTier, "exact" | "strong" | "moderate" | "weak">> =
  {
    vin: "exact",
    plate: "strong",
    number: "moderate",
    name: "weak",
  };

/**
 * The `match_basis` column value a link created from a tier must record.
 * Keeping the mapping here means the DB value and the tier can never drift.
 */
export const TIER_MATCH_BASIS: Readonly<Record<MatchTier, string>> = {
  vin: "suggested_vin",
  plate: "suggested_plate",
  number: "suggested_number",
  name: "suggested_name",
};

/** Telematics-side vehicle (shape of V2's `ProjectedMotiveVehicle`). */
export interface SourceVehicleIdentity {
  readonly vehicleId: string;
  readonly number: string | null;
  readonly vin: string | null;
  readonly licensePlateNumber: string | null;
}

/** Fleetio-side vehicle (shape of the CS-2-widened `FleetioVehicleSummary`). */
export interface TargetVehicleIdentity {
  readonly vehicleId: string;
  readonly name: string | null;
  readonly vin: string | null;
  readonly licensePlate: string | null;
}

export interface MatchProposal {
  readonly sourceVehicleId: string;
  readonly targetVehicleId: string;
  readonly tier: MatchTier;
  readonly confidence: "exact" | "strong" | "moderate" | "weak";
  /** `match_basis` to persist if the user confirms this proposal. */
  readonly matchBasis: string;
  /**
   * Human-readable evidence, shown verbatim in the UI. Never a score.
   * e.g. `VIN 1FUJ… matches`, `Unit 104 appears in "Truck 104"`.
   */
  readonly evidence: string;
  /** True when this proposal's source or target has rivals at this same tier. */
  readonly ambiguous: boolean;
  /** True ONLY for an unambiguous VIN match — the sole bulk-confirmable case. */
  readonly bulkConfirmable: boolean;
}

// ── Normalizers ─────────────────────────────────────────────────────────────

/** Trim + uppercase. Returns null for null/empty/whitespace — never "". */
function normalizeVin(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim().toUpperCase();
  return v.length === 0 ? null : v;
}

/**
 * Trim + uppercase + strip spaces and hyphens. Motive stores plate state and
 * number separately; Fleetio stores one combined `license_plate`. Punctuation
 * and spacing are entered inconsistently by humans in both systems, so it is
 * removed on both sides before comparing.
 */
function normalizePlate(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return v.length === 0 ? null : v;
}

/** Trim + casefold, for the unit-number/name comparisons. */
function normalizeLabel(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim();
  return v.length === 0 ? null : v.toLowerCase();
}

/**
 * True when `needle` appears in `haystack` as a WHOLE token — bounded by a
 * non-alphanumeric character or a string edge.
 *
 * Whole-token, not substring, is what keeps tier 4 honest: unit "10" must NOT
 * match "Truck 104". The needle is escaped, so a unit number containing regex
 * metacharacters can never alter the pattern.
 */
function containsWholeToken(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(haystack);
}

/** Shorten a VIN for display evidence — full VINs are long and noisy in a list. */
function shortVin(vin: string): string {
  return vin.length > 8 ? `${vin.slice(0, 8)}…` : vin;
}

// ── Tier evaluation ─────────────────────────────────────────────────────────

interface RawPair {
  sourceVehicleId: string;
  targetVehicleId: string;
  tier: MatchTier;
  evidence: string;
}

function evaluateTier(
  tier: MatchTier,
  source: SourceVehicleIdentity,
  target: TargetVehicleIdentity,
): RawPair | null {
  const id = { sourceVehicleId: source.vehicleId, targetVehicleId: target.vehicleId };

  if (tier === "vin") {
    const a = normalizeVin(source.vin);
    const b = normalizeVin(target.vin);
    if (a !== null && b !== null && a === b) {
      return { ...id, tier, evidence: `VIN ${shortVin(a)} matches` };
    }
    return null;
  }

  if (tier === "plate") {
    const a = normalizePlate(source.licensePlateNumber);
    const b = normalizePlate(target.licensePlate);
    if (a !== null && b !== null && a === b) {
      // Evidence shows the plate as the USER typed it, not the normalized form.
      return { ...id, tier, evidence: `Plate ${source.licensePlateNumber!.trim()} matches` };
    }
    return null;
  }

  if (tier === "number") {
    const a = normalizeLabel(source.number);
    const b = normalizeLabel(target.name);
    if (a !== null && b !== null && a === b) {
      return { ...id, tier, evidence: `Unit ${source.number!.trim()} matches "${target.name!.trim()}"` };
    }
    return null;
  }

  // tier === "name" — whole-token containment, and never a duplicate of tier 3.
  const a = normalizeLabel(source.number);
  const b = normalizeLabel(target.name);
  if (a !== null && b !== null && a !== b && containsWholeToken(b, a)) {
    return {
      ...id,
      tier,
      evidence: `Unit ${source.number!.trim()} appears in "${target.name!.trim()}"`,
    };
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Propose Motive↔Fleetio vehicle pairings for human confirmation.
 *
 * Pure. Returns proposals ordered strongest-tier-first, then by source id, so
 * output is deterministic for a given input (no clock, no randomness).
 *
 * `alreadyLinkedSourceIds` / `alreadyLinkedTargetIds` let the caller exclude
 * vehicles that already hold an active link, so the screen only proposes work
 * that remains to be done. Exclusion happens BEFORE ambiguity is computed —
 * otherwise an already-resolved rival would keep flagging its neighbours.
 */
export function proposeVehicleMatches(input: {
  readonly sources: readonly SourceVehicleIdentity[];
  readonly targets: readonly TargetVehicleIdentity[];
  readonly alreadyLinkedSourceIds?: readonly string[];
  readonly alreadyLinkedTargetIds?: readonly string[];
}): readonly MatchProposal[] {
  const linkedSources = new Set(input.alreadyLinkedSourceIds ?? []);
  const linkedTargets = new Set(input.alreadyLinkedTargetIds ?? []);

  const sources = input.sources.filter((s) => !linkedSources.has(s.vehicleId));
  const targets = input.targets.filter((t) => !linkedTargets.has(t.vehicleId));

  // Evaluate every pair, keeping only its STRONGEST matching tier.
  const strongestByPair = new Map<string, RawPair>();
  for (const source of sources) {
    for (const target of targets) {
      for (const tier of MATCH_TIERS) {
        const hit = evaluateTier(tier, source, target);
        if (hit) {
          strongestByPair.set(`${source.vehicleId} ${target.vehicleId}`, hit);
          break; // MATCH_TIERS is strongest-first — stop at the first hit.
        }
      }
    }
  }

  const pairs = [...strongestByPair.values()];

  // Ambiguity is computed WITHIN a tier: a tier-1 rival does not make a tier-3
  // proposal ambiguous, and vice versa.
  const sourceCount = new Map<string, number>();
  const targetCount = new Map<string, number>();
  for (const p of pairs) {
    const sKey = `${p.tier} ${p.sourceVehicleId}`;
    const tKey = `${p.tier} ${p.targetVehicleId}`;
    sourceCount.set(sKey, (sourceCount.get(sKey) ?? 0) + 1);
    targetCount.set(tKey, (targetCount.get(tKey) ?? 0) + 1);
  }

  const proposals = pairs.map((p): MatchProposal => {
    const ambiguous =
      (sourceCount.get(`${p.tier} ${p.sourceVehicleId}`) ?? 0) > 1 ||
      (targetCount.get(`${p.tier} ${p.targetVehicleId}`) ?? 0) > 1;
    return {
      sourceVehicleId: p.sourceVehicleId,
      targetVehicleId: p.targetVehicleId,
      tier: p.tier,
      confidence: TIER_CONFIDENCE[p.tier],
      matchBasis: TIER_MATCH_BASIS[p.tier],
      evidence: p.evidence,
      ambiguous,
      // Only an UNAMBIGUOUS VIN match may be confirmed in bulk.
      bulkConfirmable: p.tier === "vin" && !ambiguous,
    };
  });

  const tierRank = (t: MatchTier): number => MATCH_TIERS.indexOf(t);
  return proposals.sort(
    (a, b) =>
      tierRank(a.tier) - tierRank(b.tier) ||
      a.sourceVehicleId.localeCompare(b.sourceVehicleId) ||
      a.targetVehicleId.localeCompare(b.targetVehicleId),
  );
}

/** The subset a "Confirm all exact VIN matches" affordance may act on. */
export function bulkConfirmableProposals(
  proposals: readonly MatchProposal[],
): readonly MatchProposal[] {
  return proposals.filter((p) => p.bulkConfirmable);
}

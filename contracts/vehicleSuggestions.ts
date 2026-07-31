import { z } from "zod";
import { ResourceLinkExternalIdSchema } from "./resourceLinks";
import {
  EvidenceFingerprintSchema,
  ResourceLinkMatchTierSchema,
} from "./resourceLinkDismissals";
import type { ResourceLinkMatchTier } from "./resourceLinkDismissals";
import type { LinkHealthStatus } from "./linkHealth";

/**
 * 5.TRUCK-BRIDGE-1 CS-5 — UI/route contracts for suggestions and link health.
 *
 * Like [`vehicleLinks.ts`](./vehicleLinks.ts), these are the shapes that cross
 * the server→client boundary, and they are deliberately narrower than what the
 * server holds.
 *
 * **VIN and plate never cross.** The matcher reads them server-side; what ships
 * is the already-rendered `evidence` sentence the user is meant to read. That is
 * not merely tidy — a fleet's full VIN list is exactly the sort of inventory
 * detail that has no business sitting in a page payload when one sentence per
 * row conveys the whole claim.
 */

/** A proposed pairing, as the Suggested tab renders it. */
export interface VehicleSuggestionView {
  readonly sourceVehicleId: string;
  readonly sourceLabel: string;
  readonly targetVehicleId: string;
  readonly targetLabel: string;
  readonly tier: ResourceLinkMatchTier;
  /** Presentation label for the tier. Never a percentage or a score. */
  readonly confidence: "exact" | "strong" | "moderate" | "weak";
  /** The verbatim reason, e.g. `Unit 104 appears in "Truck 104"`. */
  readonly evidence: string;
  /** `<tier>|<evidence>` — echoed back on dismiss so it can be pinned. */
  readonly evidenceFingerprint: string;
  /** True when this source or target has rivals AT THIS TIER. */
  readonly ambiguous: boolean;
  /** True only for an unambiguous VIN match with both sides free. */
  readonly bulkConfirmable: boolean;
}

/** Health annotation for one confirmed link. */
export interface VehicleLinkHealthView {
  readonly linkId: string;
  readonly statuses: readonly LinkHealthStatus[];
  readonly needsAttention: boolean;
}

/** Why a suggestion set could not be computed. */
export type SuggestionsStatus =
  /** Both provider lists loaded; `suggestions` is authoritative. */
  | "ok"
  /** At least one side has no connection — nothing can be proposed. */
  | "disconnected"
  /** At least one list failed to load. NOT "there are no matches". */
  | "unavailable";

export interface VehicleSuggestionsView {
  readonly status: SuggestionsStatus;
  readonly suggestions: readonly VehicleSuggestionView[];
  /**
   * Whether the "Confirm all exact VIN matches" affordance may be offered.
   * False while `ENABLE_VEHICLE_VIN_BULK_CONFIRM` is off — see the flag's note
   * on why live VIN verification gates it.
   */
  readonly bulkConfirmEnabled: boolean;
  /** How many suggestions WOULD be bulk-confirmable if the gate were open. */
  readonly bulkConfirmableCount: number;
  /** True when the loaded pages were truncated, so matches may be missing. */
  readonly partialInventory: boolean;
}

// ── Route bodies ────────────────────────────────────────────────────────────

/**
 * Confirm one suggested pairing. `.strict()` — and deliberately NO `matchBasis`:
 * the server RECOMPUTES the proposal set and reads the tier from its own
 * matcher, so a client cannot claim a stronger evidence tier than the one that
 * actually holds, and a suggestion that has gone stale since the page loaded is
 * caught at confirm time.
 */
export const ConfirmSuggestionBodySchema = z
  .object({
    sourceVehicleId: ResourceLinkExternalIdSchema,
    targetVehicleId: ResourceLinkExternalIdSchema,
  })
  .strict();
export type ConfirmSuggestionBody = z.infer<typeof ConfirmSuggestionBodySchema>;

/**
 * Dismiss one suggested pairing. The fingerprint is echoed from the row the user
 * saw, so the dismissal pins the CLAIM and not merely the pair — if the evidence
 * later changes materially the suggestion legitimately returns.
 */
export const DismissSuggestionBodySchema = z
  .object({
    sourceVehicleId: ResourceLinkExternalIdSchema,
    targetVehicleId: ResourceLinkExternalIdSchema,
    tier: ResourceLinkMatchTierSchema,
    evidenceFingerprint: EvidenceFingerprintSchema,
  })
  .strict();
export type DismissSuggestionBody = z.infer<typeof DismissSuggestionBodySchema>;

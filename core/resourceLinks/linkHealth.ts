/**
 * 5.TRUCK-BRIDGE-1 CS-5 — pure stale-link health assessment.
 *
 * Answers one question per confirmed link: "can ChainReact still see both
 * vehicles this mapping points at?" Nothing here decides, archives, replaces, or
 * re-links anything — it produces a label the UI renders next to a mapping the
 * user then acts on. That separation is the whole point: a mapping that looks
 * stale is a prompt for a human, never an automatic mutation.
 *
 * PURE by construction (and by `tests/structure/core-purity.test.ts`): no I/O,
 * no clock, no randomness, no repository/service imports.
 *
 * ── The rule that matters most: an outage is not a deletion ─────────────────
 * `sourceListAvailable` / `targetListAvailable` are load-bearing. When a
 * provider list could not be loaded — disconnected, rate-limited, timed out —
 * EVERY link on that side is `*_unknown`, never `*_missing`. Without this, a
 * five-minute Fleetio outage would render an entire fleet as "no longer
 * visible", which is both false and alarming, and would invite users to remove
 * mappings that are perfectly fine. Absence of evidence is reported as absence
 * of evidence.
 *
 * ── Archived targets, stated honestly ──────────────────────────────────────
 * `target_archived` is only reachable when the caller's target list actually
 * CONTAINS the vehicle with a non-null `archivedAt`. Today `GET /vehicles`
 * excludes archived vehicles by default (integrations/fleetio/api/vehicles.ts),
 * so a vehicle archived in Fleetio normally disappears from the list entirely
 * and is reported as `target_missing` — the honest answer, since from
 * ChainReact's vantage point "archived" and "deleted" are indistinguishable
 * without a second, archived-inclusive request. The state exists because the
 * projection carries `archived_at` and a caller that ever supplies an
 * archived-inclusive list should get the more specific answer for free.
 */

/** One confirmed link, reduced to what a health check needs. */
export interface LinkHealthInput {
  readonly id: string;
  readonly sourceVehicleId: string;
  readonly targetVehicleId: string;
}

/** A vehicle the provider currently reports. `archivedAt` is target-side only. */
export interface VisibleVehicle {
  readonly vehicleId: string;
  readonly archivedAt?: string | null;
}

/**
 * Health of one mapping, worst-first in the order the UI should surface them.
 *
 *   `ok`                — both sides visible.
 *   `source_missing`    — Motive no longer lists this vehicle.
 *   `target_missing`    — Fleetio no longer lists this vehicle.
 *   `target_archived`   — Fleetio lists it, explicitly archived.
 *   `source_unknown`    — Motive's list could not be loaded. NOT missing.
 *   `target_unknown`    — Fleetio's list could not be loaded. NOT missing.
 */
export type LinkHealthStatus =
  | "ok"
  | "source_missing"
  | "target_missing"
  | "target_archived"
  | "source_unknown"
  | "target_unknown";

export interface LinkHealth {
  readonly linkId: string;
  readonly statuses: readonly LinkHealthStatus[];
  /** True when at least one status needs the user's attention. */
  readonly needsAttention: boolean;
}

/**
 * `ok` is reported ONLY when both lists loaded and both vehicles were found. A
 * link is never silently promoted to healthy on the strength of an unavailable
 * list.
 */
export function assessLinkHealth(input: {
  readonly links: readonly LinkHealthInput[];
  readonly sources: readonly VisibleVehicle[];
  readonly targets: readonly VisibleVehicle[];
  /** False when the Motive list could not be loaded (disconnected or failed). */
  readonly sourceListAvailable: boolean;
  /** False when the Fleetio list could not be loaded. */
  readonly targetListAvailable: boolean;
}): readonly LinkHealth[] {
  const sourceIds = new Set(input.sources.map((v) => v.vehicleId));
  const targetById = new Map(input.targets.map((v) => [v.vehicleId, v]));

  return input.links.map((link) => {
    const statuses: LinkHealthStatus[] = [];

    // ── Source side ──────────────────────────────────────────────────────────
    if (!input.sourceListAvailable) {
      // Outage, not deletion. Say so.
      statuses.push("source_unknown");
    } else if (!sourceIds.has(link.sourceVehicleId)) {
      statuses.push("source_missing");
    }

    // ── Target side ──────────────────────────────────────────────────────────
    if (!input.targetListAvailable) {
      statuses.push("target_unknown");
    } else {
      const target = targetById.get(link.targetVehicleId);
      if (target === undefined) {
        statuses.push("target_missing");
      } else if (target.archivedAt != null) {
        // More specific than "missing" — only reachable when the caller's list
        // includes archived vehicles (see the module header).
        statuses.push("target_archived");
      }
    }

    if (statuses.length === 0) {
      return { linkId: link.id, statuses: ["ok"], needsAttention: false };
    }
    return {
      linkId: link.id,
      statuses,
      // An UNKNOWN side is not a problem to act on — it is a gap in what we can
      // see. Only a genuinely missing/archived vehicle asks for a decision.
      needsAttention: statuses.some(
        (s) => s === "source_missing" || s === "target_missing" || s === "target_archived",
      ),
    };
  });
}

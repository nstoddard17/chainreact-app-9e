import type { ActionHandler } from "@/services/execution/handlers/types";
import { findActiveLink } from "@/repositories/resourceLinks/accountResourceLinks";
import {
  FindLinkedVehicleConfigSchema,
  FIND_LINKED_VEHICLE_RESOURCE_KIND,
  FIND_LINKED_VEHICLE_SOURCE_LABELS,
  FIND_LINKED_VEHICLE_TARGET_PROVIDER,
} from "./findLinkedVehicle.schema";
import { toFindLinkedVehicleOutput } from "./findLinkedVehicle.output";

/**
 * `fleetio:find_linked_vehicle` action handler (5.TRUCK-BRIDGE-1 CS-3) — the
 * bridge between a telematics vehicle id and the Fleetio vehicle id every
 * Fleetio write needs.
 *
 * **This action makes ZERO provider calls.** It imports no API wrapper and not
 * `runFleetioApiCall`; it reads exactly one row from ChainReact's own
 * `account_resource_links` table. Three properties fall out of that:
 *
 *   1. It declares `requiresIntegration: false`, so the real `testModeGate`
 *      ALLOWS it — a user can test the flagship workflow end to end up to the
 *      Fleetio write.
 *   2. An expired / disconnected Fleetio connection does NOT break vehicle
 *      resolution. The later write fails with the existing reconnect error, so
 *      failure attribution stays correct.
 *   3. No rate limit is consumed and no provider data bleeds into test runs.
 *
 * ── Account isolation ───────────────────────────────────────────────────────
 * The account comes from `input.accountId` — the account that owns the
 * workflow, threaded by the engine — and is NEVER taken from config (the strict
 * schema has no account field, so a client-supplied account id is a parse
 * error, not an authorization input). `findActiveLink` carries a mandatory
 * `account_id` predicate, so account B's identical Motive vehicle id is not a
 * candidate row: it simply does not match. There is no cross-account fallback
 * and `connected_by_user_id` / the DTO's provenance ids are never consulted.
 *
 * The unmapped path is therefore identical whether or not another account holds
 * a matching row: same error, same message, same fields. Nothing about another
 * account's target id, labels, confirmer, or even the existence of a row can be
 * inferred from either the output or the failure.
 *
 * ── Unmapped and archived ───────────────────────────────────────────────────
 * `findActiveLink` excludes archived rows, so a removed link reads EXACTLY like
 * a link that never existed. Both throw `UnmappedVehicleError`; neither returns
 * a `{success:false}` envelope, a fabricated vehicle id, or a `found: false`
 * flag. A silent skip would let preventive-maintenance scheduling drift with no
 * signal, so a loud, typed failure is the correct behavior here.
 */

/**
 * Typed `UNMAPPED_VEHICLE` failure: no ACTIVE link exists for this account +
 * telematics vehicle id.
 *
 * `name` is stable (the engine classifies handler throws by `err.name`; an
 * unrecognized name lands on `HANDLER_FAILED`, which is the correct engine-level
 * classification per CLAUDE.md rule 8 — this is a handler failure, not an auth
 * or transient provider condition). `code` is the action-level contract the
 * management UI and tests key on.
 *
 * The message names ONLY values already inside this run's own authorized
 * context — the telematics system the user chose and the vehicle id their own
 * trigger supplied — plus where to fix it. It never carries a label, id, or
 * confirmer belonging to another account, because no other account's row is
 * ever read.
 */
export class UnmappedVehicleError extends Error {
  readonly code = "UNMAPPED_VEHICLE" as const;
  readonly sourceProvider: string;
  readonly sourceVehicleId: string;

  constructor(
    sourceProviderLabel: string,
    sourceProvider: string,
    sourceVehicleId: string,
  ) {
    super(
      `${sourceProviderLabel} vehicle "${sourceVehicleId}" isn't linked to a Fleetio vehicle yet. ` +
        `Link it in Apps → Vehicle Links, then run this workflow again.`,
    );
    this.name = "UnmappedVehicleError";
    this.sourceProvider = sourceProvider;
    this.sourceVehicleId = sourceVehicleId;
  }
}

export const findLinkedVehicle: ActionHandler = async (input) => {
  const config = FindLinkedVehicleConfigSchema.parse(input.config);

  const link = await findActiveLink(
    // The workflow's owning account — never a client-supplied value.
    input.accountId,
    FIND_LINKED_VEHICLE_RESOURCE_KIND,
    config.sourceProvider,
    config.sourceVehicleId,
    FIND_LINKED_VEHICLE_TARGET_PROVIDER,
  );

  if (!link) {
    throw new UnmappedVehicleError(
      FIND_LINKED_VEHICLE_SOURCE_LABELS[config.sourceProvider],
      config.sourceProvider,
      config.sourceVehicleId,
    );
  }

  // Spread into a fresh literal so the bounded projection satisfies the engine's
  // Record<string, unknown> output contract (Get Vehicle / Create Meter Entry
  // precedent). The repository DTO itself is never spread.
  return { output: { ...toFindLinkedVehicleOutput(link) } };
};

import { z } from "zod";
import { ResourceLinkExternalIdSchema } from "@/contracts/resourceLinks";

/**
 * Runtime config schema for `fleetio:find_linked_vehicle`
 * (5.TRUCK-BRIDGE-1 CS-3).
 *
 * `.strict()` — the authoritative validation of the RESOLVED config (the engine
 * pre-resolves `{{...}}` before the handler runs, so every value here is
 * concrete). Two fields, nothing else:
 *
 *   - `sourceProvider` — which telematics id NAMESPACE the supplied vehicle id
 *     belongs to. v1 ships exactly ONE option (`motive`) because Motive is the
 *     only telematics provider V2 has. It is REQUIRED with NO default (Q11):
 *     a silently-defaulted namespace would make a future second telematics
 *     provider silently look up the wrong side of the link table.
 *
 *     This is NOT a dispatcher / router field (CLAUDE.md rule 1). It never
 *     changes which system is queried, which code path runs, or what shape
 *     comes back — the action always reads ChainReact's own link table and
 *     always returns a Fleetio vehicle. It only qualifies the id's namespace.
 *
 *   - `sourceVehicleId` — the opaque telematics vehicle id, normally MAPPED
 *     from an upstream Motive step (`{{trigger.vehicleId}}`), with direct
 *     entry allowed. Accepts a number as well as a string because the
 *     canonical resolver preserves an upstream value's real type (a mapped id
 *     may legitimately arrive as `88231` rather than `"88231"`).
 *
 * Deliberately NOT accepted: an account id, a link row id, a Fleetio vehicle
 * id, an integration id, a resource kind, a target provider, or any raw
 * provider field. `.strict()` makes each of those a parse error rather than an
 * ignored key — the account is taken from the execution context ONLY, and the
 * kind/target sides of the lookup key are fixed by this action's identity.
 */

/** Telematics id namespaces this action can look up. v1: Motive only. */
export const FIND_LINKED_VEHICLE_SOURCE_PROVIDERS = ["motive"] as const;
export type FindLinkedVehicleSourceProvider =
  (typeof FIND_LINKED_VEHICLE_SOURCE_PROVIDERS)[number];

/** User-facing name per namespace — used in the unmapped-vehicle message. */
export const FIND_LINKED_VEHICLE_SOURCE_LABELS: Readonly<
  Record<FindLinkedVehicleSourceProvider, string>
> = { motive: "Motive" };

/** The side of the link this action always resolves. Never user-supplied. */
export const FIND_LINKED_VEHICLE_TARGET_PROVIDER = "fleetio";

/** The link kind this action always looks up. Never user-supplied. */
export const FIND_LINKED_VEHICLE_RESOURCE_KIND = "vehicle";

/**
 * A telematics vehicle id supplied as a string or a number, normalized to a
 * trimmed non-blank string.
 *
 * The bound is REUSED from `ResourceLinkExternalIdSchema` (the same contract
 * `account_resource_links.source_external_id` is written through) rather than
 * restated, so this action can never be asked to look up an id the table could
 * not have stored. Non-finite numbers (`NaN`, `±Infinity`) are rejected before
 * they can stringify into a garbage lookup key.
 */
const SourceVehicleIdInput = z
  .union([z.string(), z.number()])
  .transform((raw, ctx) => {
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A telematics vehicle id is required.",
        });
        return z.NEVER;
      }
      return String(raw);
    }
    return raw;
  })
  .pipe(ResourceLinkExternalIdSchema);

export const FindLinkedVehicleConfigSchema = z
  .object({
    sourceProvider: z.enum(FIND_LINKED_VEHICLE_SOURCE_PROVIDERS, {
      errorMap: () => ({
        message: "Choose the telematics system the vehicle id comes from.",
      }),
    }),
    sourceVehicleId: SourceVehicleIdInput,
  })
  .strict();

export type FindLinkedVehicleConfig = z.infer<typeof FindLinkedVehicleConfigSchema>;

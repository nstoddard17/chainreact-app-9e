import { z } from "zod";
import {
  ResourceLinkExternalIdSchema,
  ResourceLinkLabelSchema,
  type ResourceLinkMatchBasis,
} from "./resourceLinks";

/**
 * 5.TRUCK-BRIDGE-1 CS-4 — UI/route contracts for the Vehicle Links screen.
 *
 * Deliberately separate from [`resourceLinks.ts`](./resourceLinks.ts), which
 * owns the DATABASE-facing shapes (the repository DTO and its write input) and
 * says in its own header that UI contracts belong in their own module.
 *
 * The views below are what crosses the server→client boundary. They are
 * NARROWER than `ResourceLinkDTO` on purpose:
 *
 *   - no `accountId` — the tenant boundary never travels to the browser,
 *   - no `createdByUserId` / `confirmedByUserId` — raw user ids are replaced by
 *     ONE already-resolved co-member display label, so the client cannot
 *     correlate ids across surfaces,
 *   - no `resourceKind` / `sourceProvider` / `targetProvider` — fixed by this
 *     screen's identity (`vehicle`, `motive` → `fleetio`),
 *   - never any token, credential, integration id, or provider payload. The
 *     backing table stores none of those, and this projection could not carry
 *     one even if it did.
 */

/** The one telematics system v1 links FROM (mirrors CS-3's action enum). */
export const VEHICLE_LINK_SOURCE_PROVIDER = "motive";
/** The one maintenance system v1 links TO. */
export const VEHICLE_LINK_TARGET_PROVIDER = "fleetio";

/**
 * One confirmed vehicle mapping, as the screen renders it.
 *
 * `sourceLabel` / `targetLabel` are LAST-SEEN display snapshots, not truth —
 * the UI labels them as such, and a renamed vehicle shows its old name until a
 * live list refreshes it. `confirmedByLabel` is a co-member display name (or
 * email, matching the Team page) resolved SERVER-side through the membership
 * identity RPC; it is audit information and is never used for authorization.
 */
export interface VehicleLinkView {
  readonly id: string;
  readonly sourceVehicleId: string;
  readonly sourceLabel: string | null;
  readonly targetVehicleId: string;
  readonly targetLabel: string | null;
  readonly matchBasis: ResourceLinkMatchBasis;
  readonly confirmedByLabel: string | null;
  readonly confirmedAt: string;
}

/** A Motive vehicle with no active link — one row of the Unlinked list. */
export interface UnlinkedVehicleView {
  readonly sourceVehicleId: string;
  readonly label: string;
}

/** One choice in a vehicle picker. Mirrors the options-resolver `OptionItem`. */
export interface VehicleOptionView {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/**
 * Why a vehicle list could not be shown. Distinguishing `disconnected` from
 * `error` matters: the first is a setup step the user can take (connect the
 * app), the second is a transient failure they should retry. Never carries a
 * provider message, host, or status code.
 */
export type VehicleListStatus = "ok" | "disconnected" | "error";

export interface VehicleListResult {
  readonly status: VehicleListStatus;
  readonly items: readonly VehicleOptionView[];
  readonly hasMore: boolean;
}

// ── Write input (route body) ────────────────────────────────────────────────

/**
 * Body for confirming a manual pairing. `.strict()` — an unknown key is a
 * caller bug, and silently accepting one is how a column that shouldn't be
 * written gets written. There is deliberately NO `accountId`, no `matchBasis`
 * (CS-4 only ships `manual`; suggestion bases arrive with CS-5), no
 * `confirmedAt`, and no user id: the server derives every one of those.
 *
 * The two labels ARE client-supplied, and that is a considered decision. They
 * are non-secret display snapshots the client just read out of this same
 * account's own vehicle pickers; re-deriving them server-side would cost a
 * second provider round-trip per confirm to protect a field whose worst-case
 * abuse (an owner/admin typing a misleading name for their own fleet) is
 * strictly weaker than renaming the vehicle in Motive. They are bounded and
 * trimmed by `ResourceLinkLabelSchema` so nothing unbounded reaches the table.
 */
export const CreateVehicleLinkBodySchema = z
  .object({
    sourceVehicleId: ResourceLinkExternalIdSchema,
    sourceLabel: ResourceLinkLabelSchema.nullish(),
    targetVehicleId: ResourceLinkExternalIdSchema,
    targetLabel: ResourceLinkLabelSchema.nullish(),
    /**
     * Explicit confirmation that an EXISTING active link for this Motive
     * vehicle may be archived and replaced. Absent/false ⇒ the service refuses
     * with `source_already_linked` and names the current target, so a mapping
     * is never silently overwritten.
     */
    replaceExisting: z.boolean().optional(),
  })
  .strict();

export type CreateVehicleLinkBody = z.infer<typeof CreateVehicleLinkBodySchema>;

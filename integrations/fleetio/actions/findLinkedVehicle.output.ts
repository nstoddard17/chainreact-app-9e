import type { OutputMeta } from "@/contracts/actionMeta";
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";

/**
 * Bounded `fleetio:find_linked_vehicle` output (5.TRUCK-BRIDGE-1 CS-3).
 *
 * Built EXPLICITLY from four approved keys of the repository DTO. The DTO is
 * NEVER spread — and that matters more here than on a provider action, because
 * `ResourceLinkDTO` carries fields that must not reach a workflow variable:
 *
 *   - `id` — the DATABASE row id. Never emitted. Nothing downstream addresses a
 *     link by row id (the repository has no by-id-alone read), so surfacing it
 *     would grant a workflow-visible handle with no legitimate consumer.
 *   - `accountId` — the tenant boundary itself. Never emitted.
 *   - `createdByUserId` / `confirmedByUserId` — provenance user ids. Never
 *     emitted; they are audit data for the management screen, not run data.
 *   - `resourceKind` / `sourceProvider` / `targetProvider` — fixed by this
 *     action's identity (`vehicle`, the configured namespace, `fleetio`). They
 *     are inputs, not discoveries, so echoing them adds noise, not information.
 *   - `matchBasis` — how a human came to confirm the link. Audit/UX only, never
 *     consulted at runtime (contracts/resourceLinks.ts), so it stays out of the
 *     variable surface.
 *   - `archivedAt` — always `null` here by construction (the lookup excludes
 *     archived rows), so emitting it would be a constant masquerading as data.
 *   - `createdAt` / `updatedAt` — row bookkeeping. `linkedAt` (the human
 *     confirmation instant) is the honest, meaningful timestamp.
 *
 * There is deliberately NO `found: boolean` (plan §4.4): an unmapped truck is a
 * SETUP GAP, not a data condition. Expressing it as branchable data invites
 * workflows that quietly do nothing for half a fleet. The handler throws
 * instead — see `UnmappedVehicleError`.
 *
 * No secret can reach this shape: the backing table stores provider resource
 * ids and non-secret display snapshots only — no tokens, no credentials, no
 * integration metadata.
 */
export interface FindLinkedVehicleOutput {
  /** The FLEETIO vehicle id — shaped to drop into Create Meter Entry's Vehicle. */
  vehicleId: string;
  /** Stored target-label snapshot ("Truck 104"). Last-seen name, not truth. */
  vehicleName: string | null;
  /** The telematics vehicle id that was looked up (echoed for traceability). */
  sourceVehicleId: string;
  /** When a human confirmed this link (ISO 8601). */
  linkedAt: string;
}

export function toFindLinkedVehicleOutput(
  link: ResourceLinkDTO,
): FindLinkedVehicleOutput {
  return {
    vehicleId: link.targetExternalId,
    // The stored snapshot — NOT a live Fleetio read. This action makes zero
    // provider calls, so a renamed vehicle shows its last-seen name until the
    // management screen refreshes the snapshot.
    vehicleName: link.targetLabel,
    sourceVehicleId: link.sourceExternalId,
    linkedAt: link.confirmedAt,
  };
}

/** Variable-picker output shape — mirrors `FindLinkedVehicleOutput` exactly. */
export const FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS: readonly OutputMeta[] = [
  {
    name: "vehicleId",
    type: "string",
    description:
      "The linked Fleetio vehicle id. Map this into a Fleetio step's Vehicle field (e.g. Create Meter Entry).",
  },
  {
    name: "vehicleName",
    type: "string",
    description:
      "The Fleetio vehicle's name as it was last seen when the link was reviewed. A display snapshot — it may be out of date if the vehicle was renamed in Fleetio.",
    nullable: true,
  },
  {
    name: "sourceVehicleId",
    type: "string",
    description: "The telematics vehicle id that was looked up.",
  },
  {
    name: "linkedAt",
    type: "string",
    description: "When someone on your team confirmed this vehicle link (ISO 8601).",
  },
];

import type { VehicleLinkConflict } from "@/lib/api/vehicleLinks";

/**
 * Friendly copy for vehicle-link failures (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Maps the server's STABLE error codes to user-facing sentences. Raw server
 * text is never rendered, so a future server-side message change can't leak
 * into the page and no provider/DB detail can reach a user.
 *
 * The conflict messages DO name the other vehicle — deliberately. Both sides of
 * a conflict belong to the SAME account (the service only ever compares that
 * account's own links), so naming them cannot cross a tenant boundary, and
 * "already linked" without saying *to what* is not actionable.
 */
export function vehicleLinkErrorCopy(
  code: string,
  conflict: VehicleLinkConflict | null = null,
): string {
  switch (code) {
    case "SOURCE_ALREADY_LINKED": {
      const target = conflict?.targetLabel;
      return target
        ? `This Motive vehicle is already linked to “${target}”. Replace that link to point it somewhere else.`
        : "This Motive vehicle is already linked to a Fleetio vehicle. Replace that link to point it somewhere else.";
    }
    case "TARGET_ALREADY_LINKED": {
      const source = conflict?.sourceLabel;
      return source
        ? `That Fleetio vehicle is already linked to “${source}”. Remove that link first, then link it here.`
        : "That Fleetio vehicle is already linked to a different Motive vehicle. Remove that link first, then link it here.";
    }
    case "LINK_CONFLICT":
      return "Someone changed this vehicle's link at the same time. Reload the page and try again.";
    case "INVALID_INPUT":
      return "Choose both a Motive vehicle and a Fleetio vehicle.";
    case "FORBIDDEN":
      return "Only account owners and admins can change vehicle links.";
    case "NOT_ACCOUNT_MEMBER":
      return "You no longer have access to this account.";
    case "ACCOUNT_PENDING_DELETION":
      return "This account is pending deletion, so vehicle links can't be changed.";
    case "NOT_FOUND":
      return "That link no longer exists. Reload the page to see the current mappings.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}

/** Copy for a vehicle list that could not be shown. */
export function vehicleListStatusCopy(
  status: "disconnected" | "error",
  provider: "Motive" | "Fleetio",
): string {
  return status === "disconnected"
    ? `${provider} isn't connected for this account yet. Connect it on the Apps page to see its vehicles.`
    : `Couldn't load ${provider} vehicles just now. Try again in a moment.`;
}

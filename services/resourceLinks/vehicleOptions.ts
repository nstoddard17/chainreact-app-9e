import { getActiveForExecution } from "@/repositories/integrations";
import { getOptionsResolver } from "@/services/options/_registry";
import type {
  VehicleListResult,
  VehicleOptionView,
} from "@/contracts/vehicleLinks";

/**
 * Account-scoped vehicle-option loading for the Vehicle Links screen
 * (5.TRUCK-BRIDGE-1 CS-4).
 *
 * ── Why this exists rather than `/api/options/[source]` ─────────────────────
 * The generic options endpoint resolves an integration through
 * `decideOptionsCredential`, which is keyed off a WORKFLOW. With no
 * `workflowId` — and this screen has none — it falls back to the editor's
 * PERSONAL account. The Vehicle Links screen must read the caller's ACTIVE
 * account (a team account's Motive/Fleetio connections, not the caller's
 * personal ones), and `OptionsResolverContext` carries no `accountId` (plan
 * §2.3 / §4.3, Q3 — widening that shared contract is deliberately its own
 * slice with its own regression run).
 *
 * So this module does the one thing the screen needs: resolve the ACCOUNT's
 * active integration and dispatch the EXISTING, unmodified `motive:vehicles` /
 * `fleetio:vehicles` resolvers against it. No resolver is added, changed, or
 * duplicated, and the options contract is untouched.
 *
 * Both providers are `credentialSharing: "account"`
 * ([credentialSharing.ts](../../core/integrations/credentialSharing.ts)), so an
 * account-scoped lookup is exactly the right credential decision for them —
 * there is no personal-provider pin to honor here.
 *
 * ── No-leak posture ────────────────────────────────────────────────────────
 * Callers get `{ status, items, hasMore }` and nothing else. A missing
 * connection is `disconnected`; ANY thrown failure — resolver error, provider
 * 4xx/5xx, timeout, malformed body — collapses to `error` with NO message, so
 * a provider host, status code, account id, or raw body can never reach the
 * browser. The option items themselves are the resolvers' own bounded
 * `{ value, label, description? }` projections (vehicle names + status), which
 * already exclude tokens, credential labels, and owner ids.
 */

/** The two pickers this screen owns. Not a general provider dispatcher. */
export const VEHICLE_OPTION_SOURCES = {
  motive: "motive:vehicles",
  fleetio: "fleetio:vehicles",
} as const;

export type VehicleOptionSide = keyof typeof VEHICLE_OPTION_SOURCES;

/** True for exactly the two sides this screen supports. */
export function isVehicleOptionSide(value: string): value is VehicleOptionSide {
  return value === "motive" || value === "fleetio";
}

const EMPTY: readonly VehicleOptionView[] = [];

/**
 * One bounded page of vehicles for `side`, scoped to `accountId`.
 *
 * Never throws: every failure mode is a typed `status`, because the screen
 * renders a distinct state for each and a thrown error would collapse them all
 * into one unhelpful crash.
 */
export async function listVehicleOptions(input: {
  accountId: string;
  userId: string;
  side: VehicleOptionSide;
  q?: string;
}): Promise<VehicleListResult> {
  const source = VEHICLE_OPTION_SOURCES[input.side];
  const resolver = getOptionsResolver(source);
  // Unreachable in practice (both resolvers are registered at module load and a
  // structure test proves it) — but a missing resolver must not throw a raw
  // registry error into a page render.
  if (!resolver) return { status: "error", items: EMPTY, hasMore: false };

  let integration;
  try {
    integration = await getActiveForExecution(input.accountId, resolver.provider, null);
  } catch {
    return { status: "error", items: EMPTY, hasMore: false };
  }
  if (integration === null) {
    return { status: "disconnected", items: EMPTY, hasMore: false };
  }

  try {
    const result = await resolver.resolve({
      userId: input.userId,
      integration,
      q: (input.q ?? "").trim().slice(0, 256),
      deps: {},
    });
    return {
      status: "ok",
      items: result.items.map((item) => ({
        value: item.value,
        label: item.label,
        ...(item.description !== undefined && { description: item.description }),
      })),
      hasMore: result.hasMore,
    };
  } catch {
    // Deliberately message-free. `OptionsResolverError` messages are already
    // sanitized, but collapsing every failure to one opaque status means no
    // future resolver change can start leaking provider text through here.
    return { status: "error", items: EMPTY, hasMore: false };
  }
}

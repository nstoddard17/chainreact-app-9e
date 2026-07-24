import type {
  VehicleLinkView,
  VehicleListResult,
} from "@/contracts/vehicleLinks";

/**
 * Typed client API for the Vehicle Links screen (5.TRUCK-BRIDGE-1 CS-4).
 *
 * The ONLY client bridge to the vehicle-link routes — per
 * project-structure-and-module-boundaries.md §5, components never `fetch()`
 * these directly. Nothing here receives or stores a credential: the routes
 * return vehicle ids, display snapshots, and one resolved co-member label.
 *
 * Failures surface as `VehicleLinkApiError` with a STABLE server `code`, which
 * the UI maps to friendly copy (`errorCopy.ts`). Raw server text is never
 * rendered, so a future server-side message change cannot leak into the page.
 */

export interface VehicleLinkConflict {
  readonly sourceLabel: string | null;
  readonly targetLabel: string | null;
}

export class VehicleLinkApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly conflict: VehicleLinkConflict | null;
  constructor(code: string, status: number, conflict: VehicleLinkConflict | null = null) {
    super(code);
    this.name = "VehicleLinkApiError";
    this.code = code;
    this.status = status;
    this.conflict = conflict;
  }
}

async function toApiError(response: Response): Promise<VehicleLinkApiError> {
  let code = "request_failed";
  let conflict: VehicleLinkConflict | null = null;
  try {
    const body = (await response.json()) as {
      code?: unknown;
      conflict?: unknown;
    };
    if (typeof body.code === "string") code = body.code;
    if (body.conflict && typeof body.conflict === "object") {
      const c = body.conflict as Record<string, unknown>;
      conflict = {
        sourceLabel: typeof c.sourceLabel === "string" ? c.sourceLabel : null,
        targetLabel: typeof c.targetLabel === "string" ? c.targetLabel : null,
      };
    }
  } catch {
    // Non-JSON body — keep the generic code.
  }
  return new VehicleLinkApiError(code, response.status, conflict);
}

export interface ListVehicleLinksResponse {
  readonly links: readonly VehicleLinkView[];
  readonly canManage: boolean;
}

export async function fetchVehicleLinks(
  accountId: string,
): Promise<ListVehicleLinksResponse> {
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-links`,
    { method: "GET" },
  );
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as ListVehicleLinksResponse;
}

export interface CreateVehicleLinkInput {
  readonly sourceVehicleId: string;
  readonly sourceLabel?: string | null;
  readonly targetVehicleId: string;
  readonly targetLabel?: string | null;
  /** Explicit go-ahead to archive + replace this Motive vehicle's current link. */
  readonly replaceExisting?: boolean;
}

export async function createVehicleLink(
  accountId: string,
  input: CreateVehicleLinkInput,
): Promise<VehicleLinkView> {
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw await toApiError(response);
  const body = (await response.json()) as { link: VehicleLinkView };
  return body.link;
}

export async function archiveVehicleLink(
  accountId: string,
  linkId: string,
): Promise<void> {
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-links/${encodeURIComponent(linkId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await toApiError(response);
}

// ── Suggestions (5.TRUCK-BRIDGE-1 CS-5) ─────────────────────────────────────

export interface ConfirmSuggestionInput {
  readonly sourceVehicleId: string;
  readonly targetVehicleId: string;
}

/**
 * Confirm one proposed pairing. Note the body carries NO match tier: the server
 * re-derives it from its own matcher, so the client cannot claim stronger
 * evidence than actually holds.
 */
export async function confirmSuggestion(
  accountId: string,
  input: ConfirmSuggestionInput,
): Promise<VehicleLinkView> {
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-links/suggestions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw await toApiError(response);
  const body = (await response.json()) as { link: VehicleLinkView };
  return body.link;
}

export interface DismissSuggestionInput {
  readonly sourceVehicleId: string;
  readonly targetVehicleId: string;
  readonly tier: "vin" | "plate" | "number" | "name";
  /** Echoed from the row the user saw, so the dismissal pins that exact claim. */
  readonly evidenceFingerprint: string;
}

export async function dismissSuggestion(
  accountId: string,
  input: DismissSuggestionInput,
): Promise<void> {
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-links/suggestions/dismiss`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw await toApiError(response);
}

export interface BulkConfirmResponse {
  readonly confirmed: readonly VehicleLinkView[];
  readonly skipped: number;
}

/** Empty body on purpose — the server recomputes eligibility itself. */
export async function bulkConfirmVinMatches(
  accountId: string,
): Promise<BulkConfirmResponse> {
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-links/suggestions/bulk-confirm`,
    { method: "POST" },
  );
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as BulkConfirmResponse;
}

export async function fetchVehicleOptions(
  accountId: string,
  provider: "motive" | "fleetio",
  q = "",
): Promise<VehicleListResult> {
  const search = new URLSearchParams({ provider });
  if (q.trim().length > 0) search.set("q", q.trim());
  const response = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/vehicle-options?${search.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as VehicleListResult;
}

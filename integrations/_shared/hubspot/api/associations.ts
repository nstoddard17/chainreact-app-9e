import { hubspotRequest } from "./_request";

/**
 * HubSpot CRM v4 default-typed associations helper — Slice 13 Commit 4.
 *
 * V1 uses HubSpot's `/crm/v4/objects/{fromType}/{fromId}/associations/
 * {toType}/{toId}` PUT endpoint with a body of
 * `[{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: N }]`
 * across notes / tasks / calls / meetings. V1's createTicket and
 * createLineItem use the older deprecated v3 URL-label form
 * (`/crm/v3/objects/.../associations/{to}/{id}/{labelString}`). V2
 * standardizes on the v4 default-typed form across ALL Batch 2
 * actions for consistency.
 *
 * Association type IDs (HUBSPOT_DEFINED, sourced from V1 + verified
 * against current HubSpot association-type docs):
 *
 *   - note → contact   202        - note → company   190
 *     note → deal      214          note → ticket    218
 *   - task → contact   204          task → company   192
 *     task → deal      216          task → ticket    220
 *   - call → contact   194          call → company   182
 *     call → deal      206          call → ticket    210
 *   - meeting → contact 200         meeting → company 188
 *     meeting → deal    212         meeting → ticket  216
 *   - ticket → contact 16           ticket → company 26
 *     ticket → deal    28
 *   - line_item → deal 20
 *
 * `meeting→ticket = 216` collides ID-wise with `task→deal = 216` —
 * this is HubSpot's design, NOT a typo. Association type IDs are
 * scoped to (fromType, toType) so the same numeric id can be reused
 * across different from/to pairs.
 *
 * Slice 13 Batch 2 boundary:
 *   Each create_* action takes optional `associatedContactId`,
 *   `associatedCompanyId`, `associatedDealId`, and (for engagements)
 *   `associatedTicketId`. The wrapper batches the PUT calls in
 *   parallel and returns the per-association success/failure shape so
 *   the handler can attach `associationWarnings` to its output. A
 *   failed association does NOT roll back the parent object create
 *   (same as V1) — the object is the load-bearing artifact and the
 *   workflow can compensate via downstream logic if needed.
 */

export type HubSpotFromType =
  | "notes"
  | "tasks"
  | "calls"
  | "meetings"
  | "tickets"
  | "line_items";

export type HubSpotToType = "contacts" | "companies" | "deals" | "tickets";

/**
 * Association type ID lookup. Returns `null` for unsupported (from, to)
 * pairs — caller skips the PUT in that case (e.g. line_item → contact
 * isn't a documented association).
 */
const ASSOCIATION_TYPE_IDS: Readonly<
  Record<HubSpotFromType, Partial<Record<HubSpotToType, number>>>
> = Object.freeze({
  notes: {
    contacts: 202,
    companies: 190,
    deals: 214,
    tickets: 218,
  },
  tasks: {
    contacts: 204,
    companies: 192,
    deals: 216,
    tickets: 220,
  },
  calls: {
    contacts: 194,
    companies: 182,
    deals: 206,
    tickets: 210,
  },
  meetings: {
    contacts: 200,
    companies: 188,
    deals: 212,
    tickets: 216,
  },
  tickets: {
    contacts: 16,
    companies: 26,
    deals: 28,
  },
  line_items: {
    deals: 20,
  },
});

export function getAssociationTypeId(
  fromType: HubSpotFromType,
  toType: HubSpotToType,
): number | null {
  return ASSOCIATION_TYPE_IDS[fromType]?.[toType] ?? null;
}

export interface AssociationInput {
  accessToken: string;
  fromType: HubSpotFromType;
  fromId: string;
  toType: HubSpotToType;
  toId: string;
}

/**
 * Issue a single PUT to associate two CRM objects with the
 * HubSpot-defined association type for the (fromType, toType) pair.
 *
 * Throws if the (fromType, toType) pair isn't in the lookup table —
 * caller should never invoke for unsupported pairs.
 */
export async function associateCrmObjects(
  input: AssociationInput,
): Promise<unknown> {
  const typeId = getAssociationTypeId(input.fromType, input.toType);
  if (typeId === null) {
    throw new Error(
      `HubSpot association: no default association type id for ${input.fromType} → ${input.toType}.`,
    );
  }
  return hubspotRequest<unknown>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/crm/v4/objects/${input.fromType}/${encodeURIComponent(input.fromId)}/associations/${input.toType}/${encodeURIComponent(input.toId)}`,
    body: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }],
    resourceForNotFound: `association ${input.fromType}/${input.fromId} → ${input.toType}/${input.toId}`,
  });
}

export interface AttachAssociationsInput {
  accessToken: string;
  fromType: HubSpotFromType;
  fromId: string;
  /**
   * Map of optional target object ids to associate. Missing /
   * undefined keys are skipped silently. Each provided id triggers
   * one PUT call.
   */
  toIds: Partial<Record<HubSpotToType, string | undefined>>;
}

export interface AttachAssociationsResult {
  /** Successful (toType, toId) pairs. */
  attached: Array<{ toType: HubSpotToType; toId: string }>;
  /** Failed (toType, toId) pairs with the error message. */
  warnings: Array<{
    toType: HubSpotToType;
    toId: string;
    message: string;
  }>;
}

/**
 * Attach multiple associations in parallel. Failures don't throw —
 * the caller decides how to surface partial failures (typically via
 * an `associationWarnings` field in the handler output). The parent
 * object create has already succeeded by the time this helper runs.
 *
 * Skips (toType, toId) pairs where the id is empty / undefined OR
 * where the (fromType, toType) pair isn't in `ASSOCIATION_TYPE_IDS`.
 * The latter shouldn't happen for Slice 13 Batch 2 callers (they all
 * use documented pairs), but the skip-on-unsupported behavior
 * future-proofs the helper against schemas that grow ahead of the
 * lookup table.
 */
export async function attachAssociations(
  input: AttachAssociationsInput,
): Promise<AttachAssociationsResult> {
  const entries = Object.entries(input.toIds) as Array<
    [HubSpotToType, string | undefined]
  >;
  const calls: Array<Promise<{
    toType: HubSpotToType;
    toId: string;
    ok: boolean;
    error?: string;
  }>> = [];

  for (const [toType, toId] of entries) {
    if (typeof toId !== "string" || toId.length === 0) continue;
    if (getAssociationTypeId(input.fromType, toType) === null) continue;
    calls.push(
      associateCrmObjects({
        accessToken: input.accessToken,
        fromType: input.fromType,
        fromId: input.fromId,
        toType,
        toId,
      })
        .then(() => ({ toType, toId, ok: true as const }))
        .catch((err: unknown) => ({
          toType,
          toId,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        })),
    );
  }

  const results = await Promise.all(calls);
  const attached: AttachAssociationsResult["attached"] = [];
  const warnings: AttachAssociationsResult["warnings"] = [];
  for (const r of results) {
    if (r.ok) {
      attached.push({ toType: r.toType, toId: r.toId });
    } else {
      warnings.push({
        toType: r.toType,
        toId: r.toId,
        message: r.error ?? "unknown error",
      });
    }
  }
  return { attached, warnings };
}

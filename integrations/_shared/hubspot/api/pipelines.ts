import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `pipelines` resource wrappers — Slice 3.HUBSPOT-2.
 *
 * Endpoint:
 *   - GET /crm/v3/pipelines/{objectType}
 *     - Lists every pipeline for the given CRM object type (deals,
 *       tickets, custom objects). Each pipeline carries an inline
 *       `stages[]` array.
 *
 * Backs the four HubSpot pipeline / stage option resolvers:
 *   - `hubspot:deal-pipelines` (objectType = "deals")
 *   - `hubspot:deal-stages` (objectType = "deals", filter by id, flatten `stages[]`)
 *   - `hubspot:ticket-pipelines` (objectType = "tickets")
 *   - `hubspot:ticket-stages` (objectType = "tickets", filter by id, flatten `stages[]`)
 *
 * Scope requirements (already in the HubSpot manifest):
 *   - `crm.schemas.deals.read` for deals pipelines.
 *   - `tickets` scope for ticket pipelines.
 * No manifest change needed for Slice 3.HUBSPOT-2; users do NOT need
 * to reconnect.
 *
 * The Pipelines API is unpaginated — HubSpot returns every pipeline
 * for the object type in one call. Portals typically have 1–5 deal
 * pipelines and 1–3 ticket pipelines; a single response is bounded.
 *
 * Mirrors the `_shared/hubspot/api/owners.ts` shape: thin typed
 * wrapper around `hubspotRequest` with `resourceForNotFound` set so
 * the user-visible error is meaningful when the objectType is
 * misconfigured (shouldn't happen in production — the resolver pins
 * "deals" / "tickets" — but the wrapper stays defensive).
 */

export interface HubSpotPipelineStage {
  id: string;
  label?: string | null;
  displayOrder?: number | null;
  /**
   * HubSpot returns a `metadata` map with shape-varying entries —
   * `probability` (deals), `ticketState` (tickets), etc. Kept as
   * `unknown` so future stage-shape changes don't break the wrapper.
   */
  metadata?: Record<string, unknown>;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface HubSpotPipeline {
  id: string;
  label?: string | null;
  displayOrder?: number | null;
  archived?: boolean;
  stages?: HubSpotPipelineStage[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PipelinesListResponse {
  /** HubSpot wraps the list under `results` for consistency with other v3 surfaces. */
  results: HubSpotPipeline[];
}

export interface PipelinesListInput {
  accessToken: string;
  /**
   * CRM object type — `"deals"` or `"tickets"` (or custom object id).
   * The resolver pins this string literal; the wrapper trusts it.
   */
  objectType: "deals" | "tickets";
}

/**
 * GET /crm/v3/pipelines/{objectType}. Returns every pipeline (and its
 * inline stages) for the given CRM object type. Unpaginated.
 */
export async function pipelinesList(
  input: PipelinesListInput,
): Promise<PipelinesListResponse> {
  return hubspotRequest<PipelinesListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`pipelines/${input.objectType}`),
    resourceForNotFound: `${input.objectType} pipelines`,
  });
}

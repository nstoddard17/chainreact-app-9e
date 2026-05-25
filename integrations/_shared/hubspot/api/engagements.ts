import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 engagement-object wrappers — Slice 13 Commit 4.
 *
 * Covers four engagement object types: notes, tasks, calls, meetings.
 * Each lives at `/crm/v3/objects/{notes|tasks|calls|meetings}` and
 * follows the same `{ properties: {...} }` POST body shape — only the
 * property names differ.
 *
 * V2's wrappers expose four named functions (`notesCreate`,
 * `tasksCreate`, `callsCreate`, `meetingsCreate`) instead of one
 * generic `engagementCreate(type, props)` because:
 *   - Each engagement type has DIFFERENT required + optional property
 *     keys; the named functions force callers to pass the right
 *     property map for the right type.
 *   - Schemas / handlers stay 1:1 with HubSpot's engagement object
 *     types — debugging stays straightforward.
 *
 * Property defaults (matching V1's V1 fall-throughs):
 *   - task `hs_task_status` defaults to "NOT_STARTED" if absent.
 *   - task `hs_task_priority` defaults to "MEDIUM".
 *   - task `hs_task_type` defaults to "TODO".
 *   - call `hs_call_status` defaults to "COMPLETED".
 *   - meeting `hs_meeting_outcome` defaults to "SCHEDULED".
 *   - note / call / meeting `hs_timestamp` defaults to `Date.now()` if
 *     absent (HubSpot requires the property; UX-safe fall-through).
 *
 * Defaults belong at the SCHEMA layer (via `.default(...)`), not the
 * wrapper — so workflow authors see the resolved values at design
 * time. The wrapper is pure pass-through.
 *
 * Engagement associations (to contacts / companies / deals / tickets)
 * are handled by `_shared/hubspot/api/associations.ts:attachAssociations`
 * after the engagement is created.
 */

export interface HubSpotEngagement {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

interface EngagementCreateInput {
  accessToken: string;
  /** Engagement-type-specific properties map. */
  properties: Record<string, string>;
}

// ─── notes ──────────────────────────────────────────────────────────────────

/**
 * Create a HubSpot note engagement.
 *
 * Required property: `hs_note_body`. Schema also requires `hs_timestamp`
 * (epoch ms as string) per HubSpot's wire format — handler defaults to
 * `Date.now()` if the workflow author omits.
 */
export async function notesCreate(
  input: EngagementCreateInput,
): Promise<HubSpotEngagement> {
  return hubspotRequest<HubSpotEngagement>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/notes"),
    body: { properties: input.properties },
    resourceForNotFound: "note (create)",
  });
}

// ─── tasks ──────────────────────────────────────────────────────────────────

/**
 * Create a HubSpot task engagement.
 *
 * Required property: `hs_task_subject`. Schema also defaults
 * `hs_task_status` / `hs_task_priority` / `hs_task_type`.
 */
export async function tasksCreate(
  input: EngagementCreateInput,
): Promise<HubSpotEngagement> {
  return hubspotRequest<HubSpotEngagement>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/tasks"),
    body: { properties: input.properties },
    resourceForNotFound: "task (create)",
  });
}

// ─── calls ──────────────────────────────────────────────────────────────────

/**
 * Create a HubSpot call engagement.
 *
 * No required property — HubSpot accepts an empty call as a "logged
 * call" placeholder. Schema lets every field be optional. Defaults
 * `hs_call_status` to "COMPLETED" and `hs_timestamp` to now().
 */
export async function callsCreate(
  input: EngagementCreateInput,
): Promise<HubSpotEngagement> {
  return hubspotRequest<HubSpotEngagement>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/calls"),
    body: { properties: input.properties },
    resourceForNotFound: "call (create)",
  });
}

// ─── meetings ───────────────────────────────────────────────────────────────

/**
 * Create a HubSpot meeting engagement.
 *
 * Required property: `hs_meeting_title`. Defaults `hs_meeting_outcome`
 * to "SCHEDULED" and `hs_timestamp` to now() when omitted.
 */
export async function meetingsCreate(
  input: EngagementCreateInput,
): Promise<HubSpotEngagement> {
  return hubspotRequest<HubSpotEngagement>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/meetings"),
    body: { properties: input.properties },
    resourceForNotFound: "meeting (create)",
  });
}

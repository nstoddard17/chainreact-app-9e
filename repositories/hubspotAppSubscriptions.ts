import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `hubspot_app_subscriptions`.
 *
 * Slice 13 Commit 2 — Option A (shared subscriptions with portal-scoped
 * reference counting).
 *
 * The table represents the V2 mirror of HubSpot's app-level webhook
 * subscriptions: ONE row per (app_id, event_type, property_name) tuple.
 * The trigger lifecycle service is the only writer:
 *   - On first workflow ref for an event type: insert row + POST to
 *     `/webhooks/v3/{appId}/subscriptions` and store the returned id
 *     in `hubspot_subscription_id`.
 *   - On last ref removed: DELETE the HubSpot subscription, then delete
 *     this row.
 *
 * Service-role only — the table is `system-table` per migration. Every
 * call site supplies a `reason` string for the audit log via
 * `getServiceRoleClient`.
 *
 * Property-name semantics: `property_name` is `null` for non-property
 * event types (creation, deletion). The unique index on
 * `(app_id, event_type, COALESCE(property_name, ''))` collapses NULL and
 * empty-string-equivalent rows to the same key. All repository helpers
 * take `propertyName: string | null` to match.
 */

export interface HubSpotAppSubscriptionRecord {
  id: string;
  appId: string;
  eventType: string;
  propertyName: string | null;
  hubspotSubscriptionId: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

interface HubSpotAppSubscriptionRow {
  id: string;
  app_id: string;
  event_type: string;
  property_name: string | null;
  hubspot_subscription_id: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

function rowToRecord(
  row: HubSpotAppSubscriptionRow,
): HubSpotAppSubscriptionRecord {
  return {
    id: row.id,
    appId: row.app_id,
    eventType: row.event_type,
    propertyName: row.property_name,
    hubspotSubscriptionId: row.hubspot_subscription_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface FindAppSubscriptionInput {
  appId: string;
  eventType: string;
  propertyName: string | null;
}

/**
 * Find the row for the given (app_id, event_type, property_name) tuple,
 * or null if absent.
 *
 * Used by the activate path before deciding whether to create a new
 * HubSpot app-level subscription or reuse the existing one.
 */
export async function find(
  input: FindAppSubscriptionInput,
): Promise<HubSpotAppSubscriptionRecord | null> {
  const supabase = getServiceRoleClient(
    `hubspot_app_subscriptions: find ${input.appId}/${input.eventType}/${input.propertyName ?? "<null>"}`,
  );
  let query = supabase
    .from("hubspot_app_subscriptions")
    .select("*")
    .eq("app_id", input.appId)
    .eq("event_type", input.eventType);
  query =
    input.propertyName === null
      ? query.is("property_name", null)
      : query.eq("property_name", input.propertyName);
  const { data, error } = await query.maybeSingle<HubSpotAppSubscriptionRow>();
  if (error) {
    throw new Error(`hubspot_app_subscriptions.find failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export interface CreateAppSubscriptionInput {
  appId: string;
  eventType: string;
  propertyName: string | null;
  hubspotSubscriptionId: string;
}

/**
 * Insert a new row for an app-level subscription that was just created
 * on HubSpot. Caller has already POSTed to
 * `/webhooks/v3/{appId}/subscriptions` and obtained the id.
 *
 * Throws on UNIQUE-violation (caller should have called `find` first;
 * a unique violation here means a race condition between two workflow
 * activations for the same event type — see `findOrCreate`).
 */
export async function create(
  input: CreateAppSubscriptionInput,
): Promise<HubSpotAppSubscriptionRecord> {
  const supabase = getServiceRoleClient(
    `hubspot_app_subscriptions: create ${input.appId}/${input.eventType}/${input.propertyName ?? "<null>"}`,
  );
  const { data, error } = await supabase
    .from("hubspot_app_subscriptions")
    .insert({
      app_id: input.appId,
      event_type: input.eventType,
      property_name: input.propertyName,
      hubspot_subscription_id: input.hubspotSubscriptionId,
      status: "active",
    })
    .select()
    .single<HubSpotAppSubscriptionRow>();
  if (error || !data) {
    throw new Error(
      `hubspot_app_subscriptions.create failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * Find an existing app-subscription row, or call `creator` to provision
 * one against HubSpot and persist the result. Idempotent across
 * concurrent calls — if two activations race past the find but before
 * the insert, the second's UNIQUE-violation insert is caught and the
 * row is re-fetched.
 *
 * Caller's `creator` callback is invoked ONLY when the row doesn't yet
 * exist; it must POST to `/webhooks/v3/{appId}/subscriptions` and
 * return `{ hubspotSubscriptionId }`. If `creator` throws, the error
 * propagates verbatim.
 */
export async function findOrCreate(
  input: FindAppSubscriptionInput,
  creator: () => Promise<{ hubspotSubscriptionId: string }>,
): Promise<HubSpotAppSubscriptionRecord> {
  const existing = await find(input);
  if (existing) return existing;

  const { hubspotSubscriptionId } = await creator();

  try {
    return await create({ ...input, hubspotSubscriptionId });
  } catch (err) {
    // UNIQUE-violation (race against a concurrent activation): another
    // worker already created the row. Re-fetch and return that — our
    // own HubSpot subscription is now an orphan to clean up.
    if (
      err instanceof Error &&
      /duplicate key value violates unique constraint/i.test(err.message)
    ) {
      const racingExisting = await find(input);
      if (racingExisting) return racingExisting;
    }
    throw err;
  }
}

/**
 * Delete the row by id. Caller has already DELETEd the HubSpot
 * subscription; this just removes the V2 mirror.
 *
 * `ON DELETE CASCADE` on `hubspot_subscription_refs.app_subscription_id`
 * cleans up any straggler refs (there should be none if the lifecycle
 * removed them first, but the cascade is defense-in-depth).
 */
export async function deleteById(id: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `hubspot_app_subscriptions: deleteById ${id}`,
  );
  const { error } = await supabase
    .from("hubspot_app_subscriptions")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(
      `hubspot_app_subscriptions.deleteById failed: ${error.message}`,
    );
  }
}

/**
 * Find by id — used by the receive-route after looking up the ref.
 */
export async function findById(
  id: string,
): Promise<HubSpotAppSubscriptionRecord | null> {
  const supabase = getServiceRoleClient(
    `hubspot_app_subscriptions: findById ${id}`,
  );
  const { data, error } = await supabase
    .from("hubspot_app_subscriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle<HubSpotAppSubscriptionRow>();
  if (error) {
    throw new Error(
      `hubspot_app_subscriptions.findById failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

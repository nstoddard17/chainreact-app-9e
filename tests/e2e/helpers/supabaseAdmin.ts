import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase admin client for e2e test setup + cleanup.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY directly (the test runner is server-side
 * and has access to the secret). NOT routed through
 * repositories/supabase/serviceRoleClient.ts because that's wired for app
 * server-side use, not test runners.
 *
 * Tests use this to:
 *   - Create a fresh user with email_confirm: true (bypasses the
 *     confirmation step that interactive sign-up would require).
 *   - Delete the user at teardown so cascades clean every related row
 *     (user_profiles, integrations, workflows, workflow_runs,
 *     notifications, oauth_states, trigger_resources).
 *   - Read DB state for assertions (integration row shape, oauth_states
 *     consumption, run status, notification count).
 */

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("e2e: NEXT_PUBLIC_SUPABASE_URL not set.");
  if (!key) throw new Error("e2e: SUPABASE_SERVICE_ROLE_KEY not set.");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createTestUser(): Promise<TestUser> {
  const id = crypto.randomUUID();
  const email = `e2e-${id}@chainreact.test`;
  const password = `e2e-${id}-pw!`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true, // bypass email-confirmation flow in tests
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? "no user"}`);
  }
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string): Promise<void> {
  // Slice 4.ACCOUNT-MODEL-3: accounts.owner_user_id is ON DELETE RESTRICT
  // (the user/account deletion flow is the only legitimate path to remove
  // an account; not implemented yet). E2e teardown is best-effort and not
  // production code — explicitly clear the user's account_memberships and
  // accounts rows before calling auth.admin.deleteUser so the FK doesn't
  // block teardown.
  const client = adminClient();
  await client.from("account_memberships").delete().eq("user_id", userId);
  await client.from("accounts").delete().eq("owner_user_id", userId);
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    // Don't throw — teardown is best-effort. Log so the test runner shows it.
    console.warn(`[e2e cleanup] deleteTestUser ${userId} failed: ${error.message}`);
  }
}

export async function getIntegrationsForUser(
  userId: string,
  provider: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(`getIntegrationsForUser: ${error.message}`);
  return data ?? [];
}

export async function getOAuthStateRowCount(): Promise<number> {
  const { count, error } = await adminClient()
    .from("oauth_states")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`getOAuthStateRowCount: ${error.message}`);
  return count ?? 0;
}

export async function getWorkflowRunsForUser(
  userId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("workflow_runs")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`getWorkflowRunsForUser: ${error.message}`);
  return data ?? [];
}

export async function getNotificationsForUser(
  userId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("notifications")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`getNotificationsForUser: ${error.message}`);
  return data ?? [];
}

/**
 * Slice 2f: read trigger_resources rows for the test user. Used to
 * assert the activation hook populated `config.snapshot.historyId` and
 * that the polling cycle advanced the cursor + bumped lastPolledAt.
 */
export async function getTriggerResourcesForUser(
  userId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("trigger_resources")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`getTriggerResourcesForUser: ${error.message}`);
  return data ?? [];
}

/**
 * Slice 2f: read a single webhook_event_dedup row by (provider, event_id).
 * Used to assert dedup actually wrote on the first poll AND that the
 * row is what blocks the duplicate run on the second poll. Returns null
 * when no row matches. System table — service-role only.
 */
export async function getDedupRow(
  provider: string,
  eventId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await adminClient()
    .from("webhook_event_dedup")
    .select("*")
    .eq("provider", provider)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`getDedupRow: ${error.message}`);
  return data ?? null;
}

/**
 * Slice 2f: rewind a trigger_resources row's `config.polling.lastPolledAt`
 * to a long-past timestamp so the polling scheduler's interval gate
 * (5-minute default in Slice 2e) doesn't skip the next cron tick.
 *
 * Used by the dedup probe — between polls we need to simulate "enough
 * time has passed to poll again" without sleeping for 5 minutes. The
 * scheduler reads `config.polling.lastPolledAt` directly, so we just
 * write a value far enough in the past.
 *
 * Service-role: writes a single known row id; the test runner has
 * already authenticated the user, but the polling cron code path uses
 * service-role too.
 */
export async function rewindTriggerPollingTimestamp(
  triggerResourceId: string,
): Promise<void> {
  const long_ago = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Read current config so we update only the polling slice without
  // accidentally clearing snapshot / other keys.
  const { data, error: readErr } = await adminClient()
    .from("trigger_resources")
    .select("config")
    .eq("id", triggerResourceId)
    .single();
  if (readErr) throw new Error(`rewindTriggerPollingTimestamp read: ${readErr.message}`);
  const config = (data.config ?? {}) as Record<string, unknown>;
  const polling = (config.polling ?? {}) as Record<string, unknown>;
  const newConfig = {
    ...config,
    polling: { ...polling, lastPolledAt: long_ago },
  };
  const { error } = await adminClient()
    .from("trigger_resources")
    .update({ config: newConfig })
    .eq("id", triggerResourceId);
  if (error) throw new Error(`rewindTriggerPollingTimestamp write: ${error.message}`);
}

/**
 * Slice 13: read `hubspot_app_subscriptions` rows for a given app id.
 * Used to assert the shared-subscription invariant: one row per
 * (app_id, event_type, property_name) across all workflows.
 */
export async function getHubSpotAppSubscriptions(
  appId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("hubspot_app_subscriptions")
    .select("*")
    .eq("app_id", appId);
  if (error) throw new Error(`getHubSpotAppSubscriptions: ${error.message}`);
  return data ?? [];
}

/**
 * Slice 13: read `hubspot_subscription_refs` rows for a given user.
 * Each row binds one workflow node to the app-level subscription via
 * `app_subscription_id`. Multi-workflow activations against the same
 * subscription type produce multiple ref rows pointing at the same
 * `app_subscription_id`.
 */
export async function getHubSpotSubscriptionRefs(
  userId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("hubspot_subscription_refs")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`getHubSpotSubscriptionRefs: ${error.message}`);
  return data ?? [];
}

/**
 * Slice 13: cleanup helper for the HubSpot shared-subscription tables.
 *
 * `hubspot_app_subscriptions` is a **system table** — rows are not scoped
 * to a user. When `deleteTestUser` cascades the integration + workflows
 * + refs, the parent `hubspot_app_subscriptions` row survives (no FK to
 * user). Subsequent test runs against the same `app_id` then short-
 * circuit on `findOrCreate` without calling HubSpot, breaking the mock-
 * call count assertion in the activate path.
 *
 * Production cleanup of orphan rows belongs in a future reconciler cron
 * (see slice-13-hubspot.md). E2e teardown wipes them by app_id so each
 * test starts from a clean state.
 *
 * ON DELETE CASCADE on `hubspot_subscription_refs.app_subscription_id`
 * cleans up any straggler refs automatically.
 */
export async function deleteHubSpotAppSubscriptionsForApp(
  appId: string,
): Promise<void> {
  const { error } = await adminClient()
    .from("hubspot_app_subscriptions")
    .delete()
    .eq("app_id", appId);
  if (error) {
    // Don't throw — teardown is best-effort. Log so the test runner shows it.
    console.warn(
      `[e2e cleanup] deleteHubSpotAppSubscriptionsForApp ${appId} failed: ${error.message}`,
    );
  }
}

/**
 * Poll until the predicate returns truthy or timeout. The execution engine
 * runs in a fire-and-forget Promise after the webhook returns 200, so the
 * test must wait for the workflow_runs row to appear.
 */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<T> {
  const timeout = opts.timeoutMs ?? 10_000;
  const interval = opts.intervalMs ?? 250;
  const start = Date.now();
  let last: unknown = null;
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    last = result;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(
    `waitFor timed out after ${timeout}ms${
      opts.description ? ` (${opts.description})` : ""
    }; last value: ${JSON.stringify(last)}`,
  );
}

// ── Slack 2.4 / P-S3 — workflow_files + storage helpers ────────────────
//
// The `workflow-files` bucket is normally created out-of-band per the
// P-S3 migration header. For e2e we ensure it exists idempotently —
// `createBucket` returns a `Bucket already exists` error we treat as
// success. Seeded files use the canonical
// `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` path scheme so
// the upload action's FileRef.storagePath round-trips cleanly.

export const WORKFLOW_FILES_BUCKET = "workflow-files";

/**
 * Idempotently ensure the `workflow-files` bucket exists. Safe to call
 * from every test setup. Reports the outcome so the spec can assert
 * the bucket was usable.
 */
export async function ensureWorkflowFilesBucket(): Promise<void> {
  const client = adminClient();
  const { error } = await client.storage.createBucket(WORKFLOW_FILES_BUCKET, {
    public: false,
  });
  if (!error) return;
  // Supabase returns a structured error when the bucket exists; the
  // exact message has shifted across versions. Treat any
  // "already exists" / "duplicate"-style message as success.
  const msg = error.message?.toLowerCase() ?? "";
  if (
    msg.includes("already exists") ||
    msg.includes("duplicate") ||
    msg.includes("conflict")
  ) {
    return;
  }
  throw new Error(
    `ensureWorkflowFilesBucket: createBucket failed: ${error.message}`,
  );
}

export interface SeededWorkflowFile {
  /** Inserted `workflow_files` row id. */
  id: string;
  /** Canonical storage path within the workflow-files bucket. */
  storagePath: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Upload bytes to the workflow-files bucket AND insert the matching
 * metadata row. Used to seed a `FileRef(kind=v2_storage)` consumed by
 * `slack:upload_file` in the e2e.
 *
 * The runId can be synthetic (no matching `workflow_runs` row exists)
 * — `workflow_files.run_id` has no FK by P-S3 design.
 */
export async function seedWorkflowFile(input: {
  userId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<SeededWorkflowFile> {
  await ensureWorkflowFilesBucket();
  const storagePath = `${input.userId}/${input.workflowId}/${input.runId}/${input.nodeId}/${input.fileName}`;
  const client = adminClient();

  const { error: uploadErr } = await client.storage
    .from(WORKFLOW_FILES_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: input.mimeType,
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(
      `seedWorkflowFile: storage upload failed: ${uploadErr.message}`,
    );
  }

  const { data, error } = await client
    .from("workflow_files")
    .insert({
      user_id: input.userId,
      workflow_id: input.workflowId,
      run_id: input.runId,
      node_id: input.nodeId,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.bytes.byteLength,
      metadata: { seedBy: "e2e" },
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    throw new Error(
      `seedWorkflowFile: workflow_files insert failed: ${error?.message ?? "no row"}`,
    );
  }
  return {
    id: data.id,
    storagePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
  };
}

/**
 * Read every `workflow_files` row belonging to a user, ordered by
 * created_at ASC so the test can pick the most-recently-staged file
 * deterministically with `.at(-1)`.
 */
export async function getWorkflowFilesForUser(
  userId: string,
): Promise<readonly Record<string, unknown>[]> {
  const { data, error } = await adminClient()
    .from("workflow_files")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getWorkflowFilesForUser: ${error.message}`);
  return data ?? [];
}

/**
 * Download a storage object as a Uint8Array. Used by tests that want
 * to assert the staged bytes match what the mock served.
 */
export async function readWorkflowFileObject(
  storagePath: string,
): Promise<Uint8Array> {
  const client = adminClient();
  const { data, error } = await client.storage
    .from(WORKFLOW_FILES_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(
      `readWorkflowFileObject: ${error?.message ?? "no data"} (path=${storagePath})`,
    );
  }
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Best-effort cleanup of staged files between tests so the storage
 * bucket doesn't accumulate per-test debris. Removes both the
 * storage objects and the metadata rows. Per-user scoped.
 */
export async function cleanupWorkflowFilesForUser(
  userId: string,
): Promise<void> {
  const client = adminClient();
  const { data, error } = await client
    .from("workflow_files")
    .select("storage_path")
    .eq("user_id", userId);
  if (error) {
    console.warn(
      `[e2e cleanup] cleanupWorkflowFilesForUser select failed: ${error.message}`,
    );
    return;
  }
  const paths = (data ?? [])
    .map((row) => (row as { storage_path?: string }).storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    const { error: rmErr } = await client.storage
      .from(WORKFLOW_FILES_BUCKET)
      .remove(paths);
    if (rmErr) {
      console.warn(
        `[e2e cleanup] storage.remove failed: ${rmErr.message}`,
      );
    }
  }
  const { error: delErr } = await client
    .from("workflow_files")
    .delete()
    .eq("user_id", userId);
  if (delErr) {
    console.warn(
      `[e2e cleanup] workflow_files delete failed: ${delErr.message}`,
    );
  }
}

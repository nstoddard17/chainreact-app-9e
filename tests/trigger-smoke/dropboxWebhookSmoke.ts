/**
 * Trigger-smoke — Dropbox WEBHOOK pure spec (Lane C direct-seed + REAL cursor
 * reconcile), on the generic orchestrator in directSeedWebhookSmoke.ts.
 *
 * Covers the single registered Dropbox trigger: dropbox:new_file.
 *
 * ARCHITECTURE: Dropbox's webhook is APP-LEVEL — one URL receives
 * `{ list_folder: { accounts: [dbid…] } }` for every connected account,
 * signed with `X-Dropbox-Signature` (HMAC-SHA256-hex over the raw body keyed
 * DROPBOX_CLIENT_SECRET). The notification carries NO file data; the route
 * reconciles each affected trigger row's stored `list_folder` cursor via the
 * REAL `list_folder/continue`, diffs the delta, and enqueues one run per new
 * file (state gate → row-scoped dedup → enqueueRun; NOTE: Dropbox's
 * account-fan-out reconciler enqueues directly and bypasses
 * dispatchTriggerEvent by design, like HubSpot's shared-subscription model).
 *
 * HYBRID HONESTY SCOPE: the NOTIFICATION is synthetic (Dropbox did NOT
 * deliver; no App Console webhook is involved) but everything else is REAL —
 * the seeded cursor comes from the live `get_latest_cursor` exactly the way
 * the activation hook captures it, the changed-account id is the REAL
 * connected account's dbid, the smoke file is a REAL upload, and the route's
 * reconcile fetches the delta from LIVE Dropbox. Certifies the V2 ingestion
 * path (signature verify → account fan-out → real cursor walk → path scope →
 * state gate → dedup → enqueue → drain → terminal). Provider-side webhook
 * registration (App Console URL + challenge handshake delivery) is NOT
 * certified, though the route's GET ?challenge echo is live-probed.
 *
 * FRESHNESS is proven in TWO layers by the deps' redeliver step:
 *   1. WATERMARK — re-POSTing the identical notification reconciles from the
 *      ADVANCED cursor and sees nothing.
 *   2. DEDUP — the pre-change snapshot (cursor) JSON is RESTORED, the same
 *      notification re-POSTs, `list_folder/continue` re-surfaces the same
 *      file entry, and the ROW-scoped `${rowId}:${fileId}:${rev}` dedup key
 *      drops it (still exactly 1 run).
 *
 * The spec is pure (no I/O). Real wiring lives in dropboxWebhookSmokeDeps.ts.
 */
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

export interface DropboxSmokeIdentity extends DirectSeedSmokeIdentity {
  /**
   * Reporting handle only. Dropbox dedup keys are ROW-scoped
   * (`${rowId}:${fileId}:${rev}`) and the row id is only known after seeding
   * — the deps track it internally and LIKE-clean on that prefix.
   */
  readonly eventId: string;
  /** Run-unique crsmoke marker; the uploaded smoke file is `${marker}.txt`. */
  readonly marker: string;
}

/** The Dropbox notification body — the deps sign this and POST it. */
export function buildDropboxNotificationBody(dropboxAccountId: string): string {
  return JSON.stringify({
    list_folder: { accounts: [dropboxAccountId] },
    delta: { users: [] },
  });
}

export type DropboxSpec = DirectSeedWebhookSpec<DropboxSmokeIdentity>;

export const DROPBOX_NEW_FILE_SPEC: DropboxSpec = {
  label: "dropbox:new_file",
  provider: "dropbox",
  expectedEventType: "new_file",
  // The watched path is decided deps-side (a run-unique smoke folder); the
  // node config's path is a builder placeholder — the reconcile path reads
  // the SEEDED ROW config.
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "dropbox",
      "new_file",
      { path: "", recursive: false },
      "dropbox:new_file",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_file") return false;
    if (run.triggerPayload?.changeKind !== "new_file") return false;
    // eventId: `new_file:${providerAccountId}:${fileId}:${rev}`.
    if (typeof run.eventId !== "string" || !run.eventId.startsWith("new_file:")) {
      return false;
    }
    // Marker proof: the REAL list_folder/continue delta entry's name is the
    // marker filename the smoke uploaded.
    return run.triggerPayload?.name === `${identity.marker}.txt`;
  },
};

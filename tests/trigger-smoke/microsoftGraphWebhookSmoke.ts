/**
 * Trigger-smoke — Microsoft Graph WEBHOOK pure specs (Lane C direct-seed +
 * REAL resource fetch), on the generic orchestrator in directSeedWebhookSmoke.ts.
 *
 * Covers all 6 registered Microsoft Graph change-notification triggers:
 *   microsoft-outlook:new_email / email_sent / email_flagged
 *   microsoft-outlook-calendar:event_changed
 *   microsoft-onedrive:file_changed
 *   microsoft-teams:new_channel_message
 *
 * ARCHITECTURE (shared across all four providers): Graph notifications carry
 * ONLY ids. Each receive route does per-notification trigger lookup by
 * `config.subscriptionId` → verifies `clientState` (the auth layer the smoke
 * exercises UNWEAKENED — both values are smoke-minted on the direct-seeded
 * trigger_resources row) → fetches the REAL resource from LIVE Graph
 * (getMessage / eventsGet / driveItem get / channel-message get via
 * refreshAndRetry on the action-certified Microsoft integration) → applies
 * receive-time filters → normalize → dispatchTriggerEvent → dedup → enqueue.
 *
 * HYBRID HONESTY SCOPE: the NOTIFICATION is synthetic (direct-seeded
 * subscription row; NO Graph subscription is created and Microsoft did NOT
 * deliver anything), but the RESOURCE is REAL — seeded through the certified
 * action-smoke patterns (Outlook self-send / calendar create_event / OneDrive
 * upload_file / Teams send_channel_message into the smoke channel) and
 * re-fetched from live Graph by the production receive path. This certifies
 * the V2 ingestion path (validation handshake + clientState verify + real
 * hydration fetch + filters + normalize + dispatch + dedup + terminal run)
 * for each trigger's event shape. It does NOT certify Graph subscription
 * activation/renewal or Microsoft delivery.
 *
 * DEDUP: every normalize keys `webhook_event_dedup` on
 * `${subscriptionId}:${resourceId}:${discriminator}`. The smoke-minted
 * subscriptionId is therefore a run-unique PREFIX of every dedup row this run
 * writes — the identity's `eventId` is that subscriptionId and the deps'
 * cleanupDedup deletes by `${subscriptionId}:%` LIKE. Re-sending the SAME
 * notification re-fetches the unchanged resource → same dedup key → dropped.
 *
 * Every spec is pure (no I/O). Real wiring (routes, certified seeding actions,
 * Graph fetches) lives in microsoftGraphWebhookSmokeDeps.ts and only runs in
 * the gated dev integration test.
 */
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

/** Shared identity for all Microsoft Graph webhook specs. */
export interface GraphWebhookSmokeIdentity extends DirectSeedSmokeIdentity {
  /**
   * = subscriptionId. Doubles as the generic orchestrator's dedup handle:
   * every dedup row this run writes is prefixed `${subscriptionId}:` and the
   * deps' cleanupDedup LIKE-deletes on that prefix.
   */
  readonly eventId: string;
  /** Smoke-minted Graph subscription id (never a real subscription). */
  readonly subscriptionId: string;
  /** Smoke-minted clientState secret (the receive route's auth check). */
  readonly clientState: string;
  /** Run-unique crsmoke marker carried by the seeded resource. */
  readonly marker: string;
}

/** The Graph change-notification envelope the deps POST to the real route. */
export function buildGraphNotificationBody(
  identity: GraphWebhookSmokeIdentity,
  input: {
    changeType: string;
    resourceId: string;
    resource: string;
    odataType?: string;
  },
): string {
  return JSON.stringify({
    value: [
      {
        subscriptionId: identity.subscriptionId,
        clientState: identity.clientState,
        changeType: input.changeType,
        resource: input.resource,
        resourceData: {
          id: input.resourceId,
          ...(input.odataType ? { "@odata.type": input.odataType } : {}),
        },
        tenantId: "crsmoke-tenant",
        subscriptionExpirationDateTime: "2030-01-01T00:00:00Z",
      },
    ],
  });
}

function eventIdShapeOk(
  run: DirectSeedSmokeRun,
  identity: GraphWebhookSmokeIdentity,
  changeTypeSuffix: string | null,
): boolean {
  if (typeof run.eventId !== "string") return false;
  if (!run.eventId.startsWith(`${identity.subscriptionId}:`)) return false;
  if (changeTypeSuffix !== null && !run.eventId.endsWith(`:${changeTypeSuffix}`)) {
    return false;
  }
  return true;
}

function payloadStringIncludes(
  run: DirectSeedSmokeRun,
  field: string,
  needle: string,
): boolean {
  const v = run.triggerPayload?.[field];
  return typeof v === "string" && v.includes(needle);
}

export type GraphSpec = DirectSeedWebhookSpec<GraphWebhookSmokeIdentity>;

// ─── microsoft-outlook ───────────────────────────────────────────────────────

export const OUTLOOK_NEW_EMAIL_SPEC: GraphSpec = {
  label: "microsoft-outlook:new_email",
  provider: "microsoft-outlook",
  expectedEventType: "new_email",
  // All meta fields are optional; the DETERMINISM lives on the seeded trigger
  // row (subject substring filter pinned to the run marker) — the receive-time
  // filters read the ROW config, so concurrent real mail cannot fire this.
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "microsoft-outlook",
      "new_email",
      { subjectExactMatch: false },
      "microsoft-outlook:new_email",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_email") return false;
    if (!eventIdShapeOk(run, identity, "created")) return false;
    // Marker proof: the REAL fetched inbox message's subject carries the marker.
    return payloadStringIncludes(run, "subject", identity.marker);
  },
};

export const OUTLOOK_EMAIL_SENT_SPEC: GraphSpec = {
  label: "microsoft-outlook:email_sent",
  provider: "microsoft-outlook",
  expectedEventType: "email_sent",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "microsoft-outlook",
      "email_sent",
      { subjectExactMatch: false },
      "microsoft-outlook:email_sent",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "email_sent") return false;
    if (!eventIdShapeOk(run, identity, "created")) return false;
    // Marker proof: the REAL fetched Sent Items copy's subject carries the marker.
    return payloadStringIncludes(run, "subject", identity.marker);
  },
};

export const OUTLOOK_EMAIL_FLAGGED_SPEC: GraphSpec = {
  label: "microsoft-outlook:email_flagged",
  provider: "microsoft-outlook",
  expectedEventType: "email_flagged",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "microsoft-outlook",
      "email_flagged",
      {},
      "microsoft-outlook:email_flagged",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "email_flagged") return false;
    // email_flagged watches changeType "updated" (the flag PATCH).
    if (!eventIdShapeOk(run, identity, "updated")) return false;
    // Marker proof: the flagged seed message's subject carries the marker.
    // (Firing at all ALSO proves the receive-time flagStatus === "flagged"
    // gate passed on the REAL fetched message the smoke flagged.)
    return payloadStringIncludes(run, "subject", identity.marker);
  },
};

// ─── microsoft-outlook-calendar ──────────────────────────────────────────────

export const CALENDAR_EVENT_CHANGED_SPEC: GraphSpec = {
  label: "microsoft-outlook-calendar:event_changed",
  provider: "microsoft-outlook-calendar",
  expectedEventType: "event_changed",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "microsoft-outlook-calendar",
      "event_changed",
      {},
      "microsoft-outlook-calendar:event_changed",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "event_changed") return false;
    if (!eventIdShapeOk(run, identity, "updated")) return false;
    if (run.triggerPayload?.changeType !== "updated") return false;
    // Marker proof: the REAL fetched calendar event's subject is the marker.
    return payloadStringIncludes(run, "subject", identity.marker);
  },
};

// ─── microsoft-onedrive ──────────────────────────────────────────────────────

export const ONEDRIVE_FILE_CHANGED_SPEC: GraphSpec = {
  label: "microsoft-onedrive:file_changed",
  provider: "microsoft-onedrive",
  expectedEventType: "file_changed",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "microsoft-onedrive",
      "file_changed",
      {},
      "microsoft-onedrive:file_changed",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "file_changed") return false;
    // OneDrive's dedup discriminator is the item's lastModifiedDateTime —
    // not a static changeType suffix; assert the subscription prefix only.
    if (!eventIdShapeOk(run, identity, null)) return false;
    // Marker proof: the REAL fetched DriveItem's name is the marker filename.
    return payloadStringIncludes(run, "name", identity.marker);
  },
};

// ─── microsoft-teams ─────────────────────────────────────────────────────────

/** Placeholders keep buildWorkflow pure when the env is absent (unit tests). */
function smokeTeamId(): string {
  return process.env.SMOKE_TEAMS_TEAM_ID ?? "crsmoke-team";
}
function smokeChannelId(): string {
  return process.env.SMOKE_TEAMS_CHANNEL_ID ?? "crsmoke-channel";
}

export const TEAMS_NEW_CHANNEL_MESSAGE_SPEC: GraphSpec = {
  label: "microsoft-teams:new_channel_message",
  provider: "microsoft-teams",
  expectedEventType: "new_channel_message",
  // teamId + channelId are the meta's REQUIRED builder fields; the receive
  // path reads them from the SEEDED ROW config (real env values) for the
  // real channel-message fetch.
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "microsoft-teams",
      "new_channel_message",
      { teamId: smokeTeamId(), channelId: smokeChannelId() },
      "microsoft-teams:new_channel_message",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_channel_message") return false;
    if (!eventIdShapeOk(run, identity, "created")) return false;
    // Marker proof: the REAL fetched channel message body carries the marker.
    return payloadStringIncludes(run, "bodyContent", identity.marker);
  },
};

export const ALL_GRAPH_WEBHOOK_SPECS: readonly GraphSpec[] = [
  OUTLOOK_NEW_EMAIL_SPEC,
  OUTLOOK_EMAIL_SENT_SPEC,
  OUTLOOK_EMAIL_FLAGGED_SPEC,
  CALENDAR_EVENT_CHANGED_SPEC,
  ONEDRIVE_FILE_CHANGED_SPEC,
  TEAMS_NEW_CHANNEL_MESSAGE_SPEC,
];

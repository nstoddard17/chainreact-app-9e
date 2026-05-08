import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Google Calendar provider manifest.
 *
 * Capability flags follow the V2 honest-state convention — they flip true
 * only when a real handler/trigger lands. As of this slice (Calendar Batch 1
 * step 4 — manifest + OAuth + registry), `oauth` is true and the rest are
 * still false. Subsequent commits in the same batch flip `actions` (when the
 * 5 action handlers register) and `webhookTrigger` (when the watch-based
 * `event_changed` trigger registers).
 *
 * Scopes — narrowest practical set for Batch 1:
 *   - `calendar.events` covers the five action handlers (events.insert /
 *     events.list / events.update / events.delete / events.patch) AND the
 *     watch trigger (events.watch). It does NOT grant calendarList.list,
 *     which means the Calendar dropdown UI (deferred) will need a separate
 *     scope OR continue to require a manually-supplied calendarId. For
 *     Batch 1 the action's calendarId field defaults to "primary".
 *   - `userinfo.email` is the OIDC scope that lets us identify the
 *     connected account at callback time via the OIDC userinfo endpoint
 *     (oauth2.googleapis.com). Calendar's own API doesn't expose a
 *     getProfile-like endpoint that works with `calendar.events` alone, so
 *     userinfo is the cleanest source of the user's email.
 *
 * tokenScope: "user" matches Gmail — one Calendar integration per
 * (user, email). A user with both Gmail and Calendar connected has two
 * separate integration rows under the same Google identity.
 *
 * Health-check interval: 6h matches Gmail's cadence (CLAUDE.md
 * "Google/Microsoft: 6h").
 */
export const googleCalendarManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "google-calendar",
    displayName: "Google Calendar",
    isEnabled: true,
    apiVersion: "v3",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // Flips true when the watch-based event_changed trigger registers
      // (later commit in this same batch).
      webhookTrigger: false,
      pollingTrigger: false,
      // Flips true when the 5 action handlers register (later commit in
      // this same batch).
      actions: false,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000, // 6h
    refreshable: true,
  });

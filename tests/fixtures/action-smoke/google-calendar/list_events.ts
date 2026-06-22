import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-calendar:list_events — read-only event list (one bounded window).
 *
 * calendarId defaults to "primary" in the schema, so it is hardcoded here and
 * the fixture runs with just a connection. maxResults is kept small. Read-only.
 */
export default defineActionSmokeFixture({
  provider: "google-calendar",
  action: "list_events",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { calendarId: "primary", maxResults: 10 },
  requiredEnv: ["SMOKE_GOOGLE_CALENDAR_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Google Calendar events (primary calendar, max 10); needs only SMOKE_GOOGLE_CALENDAR_CONNECTED.",
});

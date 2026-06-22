import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook-calendar:list_events — read-only event list.
 *
 * The schema has no calendarId field (defaults to the user's default calendar
 * via /me/events). start/end are optional and must be supplied together, so
 * they are omitted here. top is kept small. Runs with just a connection.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-outlook-calendar",
  action: "list_events",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 10, orderBy: "start" },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CALENDAR_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Outlook Calendar events (default calendar, top 10); needs only SMOKE_MICROSOFT_OUTLOOK_CALENDAR_CONNECTED.",
});

import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:search_emails — read-only message search (raw-query mode).
 *
 * Runs `searchMode: "query"` with the q string from SMOKE_GMAIL_QUERY
 * (overlaid onto config), capped at maxResults 3 to bound the per-message
 * hydration. Reads real mail metadata against the connected mailbox, so it
 * SKIPs before workflow creation until SMOKE_GMAIL_QUERY is set — point it
 * at a throwaway / smoke mailbox.
 *
 * The action's `messages` output is handler-marked sensitive (subjects /
 * addresses / snippets); the smoke report is status-only and never surfaces
 * it. A query that matches nothing returns an empty page and is still a
 * success.
 */
export default defineActionSmokeFixture({
  provider: "gmail",
  action: "search_emails",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { searchMode: "query", maxResults: 3 },
  configFromEnv: { query: "SMOKE_GMAIL_QUERY" },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_QUERY"],
  expect: { outcome: "success" },
  notes:
    "Read-only Gmail search (raw-query mode, max 3); needs a connected Gmail + a q-syntax query in SMOKE_GMAIL_QUERY. Reads real mail metadata — prefer a throwaway mailbox. Empty result is still a success.",
});

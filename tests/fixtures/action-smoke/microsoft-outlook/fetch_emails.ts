import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:fetch_emails — read-only message fetch (one page).
 *
 * Lists up to 5 recent messages (cross-folder) on the connected mailbox.
 * SMOKE_OUTLOOK_QUERY is optional — when set it is overlaid onto `query`
 * (Graph $search); when unset the action lists recent messages. Reads real
 * mail metadata, so it SKIPs before workflow creation until the mailbox is
 * connected — point it at a throwaway / smoke mailbox.
 *
 * The action's `messages` output is handler-marked sensitive (subjects /
 * addresses / body previews); the smoke report is status-only and never
 * surfaces it. An empty mailbox / no-match query is still a success.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-outlook",
  action: "fetch_emails",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { maxResults: 5 },
  configFromEnv: { query: "SMOKE_OUTLOOK_QUERY" },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED"],
  expect: { outcome: "success" },
  notes:
    "Read-only Outlook message fetch (max 5); needs a connected Outlook. Optional SMOKE_OUTLOOK_QUERY narrows via Graph $search. Reads real mail metadata — prefer a throwaway mailbox. Empty result is still a success.",
});

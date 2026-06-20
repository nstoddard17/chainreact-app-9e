import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:list_users — read-only workspace user list (one page).
 *
 * Lists workspace users/bots, bounded to a small page. Needs only a
 * connected Notion; no selectors. The report asserts only the terminal run
 * status — never user names or emails. No page/database content.
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "list_users",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 5 },
  requiredEnv: ["SMOKE_NOTION_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Notion user list (one page, max 5); needs only SMOKE_NOTION_CONNECTED.",
});

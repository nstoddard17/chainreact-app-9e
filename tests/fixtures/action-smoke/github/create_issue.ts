import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * github:create_issue (writeSafe, artifact left) — open a deterministic issue on
 * the dev-test-staged shared crsmoke repo, then prove it via an INDEPENDENT issue
 * GET.
 *
 *   target   SMOKE_GITHUB_REPO — the dev test stages ONE fresh crsmoke repo
 *            (auto_init, private) and overlays its owner/repo; every issue / comment
 *            / branch / PR fixture targets ONLY that repo (containment).
 *   execute  create_issue -> marker title + body. Capture { issueNumber } into
 *            ledger key "issue". markerEchoPath proves the stored title.
 *   verify   issue_state (SMOKE READ-BACK) -> GET issues/{number}; markerPath
 *            proves the marker on the PERSISTED issue title.
 *
 * DISPOSITION: none. GitHub registers no issue-close/delete action, and the parent
 * repo cannot be deleted (no scope), so the marked issue is an honest left artifact.
 */
export default defineWriteSmokeFixture({
  provider: "github",
  action: "create_issue",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    repository: "{{env.SMOKE_GITHUB_REPO}}",
    title: "{{smokeMarker}}issue",
    body: "{{smokeMarker}}issue body - safe to ignore",
  },
  requiredEnv: ["SMOKE_GITHUB_CONNECTED", "SMOKE_GITHUB_REPO"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "issue", idPath: "issueNumber", kind: "issue" },
    markerEchoPath: "title",
    verify: {
      provider: "github",
      action: "issue_state",
      config: { repository: "{{env.SMOKE_GITHUB_REPO}}", issueNumber: "{{ledger.issue.id}}" },
      smokeRead: true,
      markerPath: "title",
    },
    // No cleanup: no registered issue close/delete -> marked issue left.
  },
  notes:
    "create_issue (marker title/body on the staged shared repo) -> issue_state " +
    "read-back proves the persisted title marker. writeSafe; marked issue left (no " +
    "registered close/delete).",
});

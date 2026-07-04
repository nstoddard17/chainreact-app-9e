import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * github:add_comment (writeSafe, artifact left) — comment on a smoke-owned issue on
 * the dev-test-staged shared crsmoke repo, then prove it via an INDEPENDENT comment
 * list read.
 *
 *   setup    create_issue -> a marker comment-target issue on SMOKE_GITHUB_REPO.
 *            Capture ledger "issue".
 *   execute  add_comment { issueNumber = the ledger issue } -> marker body. Capture
 *            { commentId } into ledger key "comment".
 *   verify   issue_comments (SMOKE READ-BACK) -> GET issues/{number}/comments;
 *            markerPath proves the marker is present in the PERSISTED comments list
 *            (the write echo is never trusted).
 *
 * DISPOSITION: none. GitHub registers no comment-delete action, and the parent repo
 * cannot be deleted (no scope), so the marked comment is an honest left artifact.
 */
export default defineWriteSmokeFixture({
  provider: "github",
  action: "add_comment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    repository: "{{env.SMOKE_GITHUB_REPO}}",
    issueNumber: "{{ledger.issue.id}}",
    body: "{{smokeMarker}}comment body - safe to ignore",
  },
  requiredEnv: ["SMOKE_GITHUB_CONNECTED", "SMOKE_GITHUB_REPO"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "github",
        action: "create_issue",
        config: {
          repository: "{{env.SMOKE_GITHUB_REPO}}",
          title: "{{smokeMarker}}commenttarget",
          body: "{{smokeMarker}}comment target issue - safe to ignore",
        },
        captureResource: { resourceKey: "issue", idPath: "issueNumber", kind: "issue" },
      },
    ],
    captureResource: { resourceKey: "comment", idPath: "commentId", kind: "comment" },
    verify: {
      provider: "github",
      action: "issue_comments",
      config: { repository: "{{env.SMOKE_GITHUB_REPO}}", issueNumber: "{{ledger.issue.id}}" },
      smokeRead: true,
      markerPath: "comments",
    },
    // No cleanup: no registered comment delete -> marked comment left.
  },
  notes:
    "create_issue (setup seed) -> add_comment (marker body) -> issue_comments " +
    "read-back proves the marker in the persisted comments list. writeSafe; marked " +
    "issue + comment left (no registered delete).",
});

import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * github:create_pull_request (writeSafe, artifact left) — open a deterministic PR on
 * the dev-test-staged shared crsmoke repo, then prove it via an INDEPENDENT PR GET.
 *
 *   target   SMOKE_GITHUB_REPO + SMOKE_GITHUB_PR_HEAD — the dev test stages the
 *            shared repo AND a marker head branch that carries a REAL diff commit
 *            (GitHub 422s "No commits between ..." without a diff; no registered
 *            action commits file contents, so staging owns that write). base is
 *            omitted -> the handler auto-detects the repo's default branch.
 *   execute  create_pull_request { head = staged head branch } -> marker title/body.
 *            Capture { pullRequestNumber } into ledger key "pr". markerEchoPath
 *            proves the stored title.
 *   verify   pull_request_state (SMOKE READ-BACK) -> GET pulls/{number}; markerPath
 *            proves the marker on the PERSISTED PR title.
 *
 * DISPOSITION: none. GitHub registers no PR-close action, and the parent repo
 * cannot be deleted (no scope), so the marked open PR is an honest left artifact.
 */
export default defineWriteSmokeFixture({
  provider: "github",
  action: "create_pull_request",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    repository: "{{env.SMOKE_GITHUB_REPO}}",
    title: "{{smokeMarker}}pr",
    head: "{{env.SMOKE_GITHUB_PR_HEAD}}",
    body: "{{smokeMarker}}pr body - safe to ignore",
  },
  requiredEnv: ["SMOKE_GITHUB_CONNECTED", "SMOKE_GITHUB_REPO", "SMOKE_GITHUB_PR_HEAD"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "pr", idPath: "pullRequestNumber", kind: "pull_request" },
    markerEchoPath: "title",
    verify: {
      provider: "github",
      action: "pull_request_state",
      config: { repository: "{{env.SMOKE_GITHUB_REPO}}", pullRequestNumber: "{{ledger.pr.id}}" },
      smokeRead: true,
      markerPath: "title",
    },
    // No cleanup: no registered PR-close action -> marked open PR left.
  },
  notes:
    "create_pull_request (staged head branch with a real diff -> auto-detected " +
    "default base) -> pull_request_state read-back proves the persisted title " +
    "marker. writeSafe; marked open PR left (no registered close action).",
});

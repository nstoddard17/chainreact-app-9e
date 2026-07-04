import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * github:create_branch (writeSafe, artifact left) — cut a deterministic branch on
 * the dev-test-staged shared crsmoke repo, then prove it via an INDEPENDENT git-ref
 * GET.
 *
 *   target   SMOKE_GITHUB_REPO — the staged shared repo (auto_init gives a default
 *            branch to cut from; sourceBranch omitted -> handler auto-detects the
 *            repo's default branch, never a silent 'main').
 *   execute  create_branch { branchName = marker } -> a new ref off the default
 *            branch. Capture { branchName } into ledger key "branch".
 *   verify   branch_state (SMOKE READ-BACK) -> GET git/ref/heads/{branch};
 *            markerPath proves the marker on the PERSISTED ref (refs/heads/<marker>).
 *
 * DISPOSITION: none. GitHub registers no delete-branch action, and the parent repo
 * cannot be deleted (no scope), so the marked branch is an honest left artifact.
 */
export default defineWriteSmokeFixture({
  provider: "github",
  action: "create_branch",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    repository: "{{env.SMOKE_GITHUB_REPO}}",
    branchName: "{{smokeMarker}}branch",
  },
  requiredEnv: ["SMOKE_GITHUB_CONNECTED", "SMOKE_GITHUB_REPO"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "branch", idPath: "branchName", kind: "branch" },
    markerEchoPath: "branchName",
    verify: {
      provider: "github",
      action: "branch_state",
      config: { repository: "{{env.SMOKE_GITHUB_REPO}}", branch: "{{smokeMarker}}branch" },
      smokeRead: true,
      markerPath: "ref",
    },
    // No cleanup: no registered delete-branch action -> marked branch left.
  },
  notes:
    "create_branch (marker branch off the staged shared repo's default branch) -> " +
    "branch_state read-back proves the marker on the persisted ref. writeSafe; " +
    "marked branch left (no registered delete-branch action).",
});

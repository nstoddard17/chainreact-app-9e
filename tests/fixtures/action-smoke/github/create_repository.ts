import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * github:create_repository (writeSafe, artifact left) — create a deterministic
 * private crsmoke- repository owned by the connected account, then prove it via an
 * INDEPENDENT repository GET.
 *
 *   execute  create_repository -> marker name, PRIVATE (safest visibility),
 *            auto_init:true (a real initial commit). Capture { repository:fullName }
 *            into ledger key "repo". markerEchoPath proves the stored name.
 *   verify   repo_state (SMOKE READ-BACK) -> GET repos/{owner}/{repo}; markerPath
 *            proves the marker on the PERSISTED repo name (GitHub registers no read
 *            actions, so the seam is the only independent read).
 *
 * CONTAINMENT: the action under test CREATES its own repo; it never targets a
 * discovered repo. DISPOSITION: none. The granted token has no `delete_repo`
 * scope, so the marked private repo is an honest left artifact.
 */
export default defineWriteSmokeFixture({
  provider: "github",
  action: "create_repository",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}repo",
    description: "{{smokeMarker}}repo - safe to delete",
    private: true,
    auto_init: true,
  },
  requiredEnv: ["SMOKE_GITHUB_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "repo", idPath: "fullName", kind: "repository" },
    markerEchoPath: "name",
    verify: {
      provider: "github",
      action: "repo_state",
      config: { repository: "{{ledger.repo.id}}" },
      smokeRead: true,
      markerPath: "name",
    },
    // No cleanup: no delete_repo scope -> marked private repo left.
  },
  notes:
    "create_repository (marker name, private, auto_init) -> repo_state read-back " +
    "proves the persisted name marker. writeSafe; marked private repo left (no " +
    "delete_repo scope).",
});

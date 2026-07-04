import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:add_comment_to_task (writeSafe) — post one crsmoke- comment on the env-pinned
 * smoke task.
 *
 * VERIFICATION LIMITATION (documented, not silent): this slice ships no comment READ
 * surface (no list_comments action, no smoke read-back seam for stories), so the only
 * available proof is the execute ECHO (`markerEchoPath: "text"` — the provider-returned
 * story text must carry the marker). Weaker than an independent read-back; upgrade to a
 * real read-back when a comment-read action ships. No cleanup (no delete-story action)
 * — the crsmoke- comment on the dedicated smoke task is the intentional artifact.
 */
export default defineWriteSmokeFixture({
  provider: "asana",
  action: "add_comment_to_task",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    taskGid: "{{env.SMOKE_ASANA_TASK_ID}}",
    text: "{{smokeMarker}}comment ChainReact action-smoke - safe to ignore",
  },
  requiredEnv: ["SMOKE_ASANA_CONNECTED", "SMOKE_ASANA_TASK_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "story", idPath: "storyGid", kind: "comment" },
    markerEchoPath: "text",
  },
  notes:
    "add_comment_to_task on the env-pinned smoke task; verification = execute echo only " +
    "(markerEchoPath text) — no comment-read action ships in this slice, documented " +
    "limitation. Comment artifact intentionally left on the smoke task.",
});

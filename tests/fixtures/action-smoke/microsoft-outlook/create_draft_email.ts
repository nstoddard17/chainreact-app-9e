import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:create_draft_email (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-43.
 *
 * A DRAFT is NOT a send: `POST /me/messages` creates a draft message in the smoke
 * account's Drafts folder (201, `isDraft:true`) and NEVER delivers it — no broadcast, no
 * external side effect. The draft is a fully smoke-owned resource the run creates + hard-
 * deletes. The `to` recipient is a reserved non-deliverable `.invalid` address as defense
 * in depth (the draft is never sent regardless). No user/customer mail is mutated.
 *
 *   execute  create_draft_email -> create a marker-subjected draft. Capture { draftId }
 *            into ledger key "draft". The handler's draftId/subject echo is never trusted.
 *   verify   fetch_emails       -> INDEPENDENT read of the Drafts folder (certified read);
 *            confirm the unique marker(+suffix "draft") subject is present among the drafts
 *            (the run token makes the subject unique, so only THIS draft matches — a failed
 *            create has no such subject).
 *   cleanup  delete_email       -> permanently delete exactly the ledger draft (same
 *            provider — NOT cross-provider). The smoke-owned guard restricts the delete to
 *            the captured draft id.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked. requiredEnv is only the
 * connection signal (no target folder/recipient env — the draft lands in the account's own
 * Drafts folder).
 *
 * NOT live-certified yet — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP (`workflow_runs.status = "queued"` not yet in the DB enum). NOT_RUN_READY: authored
 * + offline-validated; cert deferred until the engine unblocks. (Live cert also needs the
 * Outlook connection to carry `Mail.ReadWrite`.)
 *
 * HONESTY — `delete_email` with `deleteMode:"permanent"` issues a Graph hard delete of the
 * draft (a true erase, not a move to Deleted Items), so the harness reports artifact
 * "cleaned"; the cert note will confirm the erase semantics on the live run.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "create_draft_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // Reserved, never-deliverable TLD — and a draft is never sent anyway.
    to: "smoke-draft@example.invalid",
    subject: "{{smokeMarker}}draft",
    body: "{{smokeMarker}}body",
    isHtml: false,
    importance: "normal",
  },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    // The execute action IS the resource creator (no setup) — capture its draft id.
    captureResource: { resourceKey: "draft", idPath: "draftId", kind: "draft" },
    // Independent read-back: list the Drafts folder and confirm the unique marker subject.
    verify: {
      provider: "microsoft-outlook",
      action: "fetch_emails",
      config: { folderId: "drafts", maxResults: 50 },
      markerPath: "messages",
      markerSuffix: "draft",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-outlook",
      action: "delete_email",
      config: { emailId: "{{ledger.draft.id}}", deleteMode: "permanent" },
    },
  },
  notes:
    "SMOKE-WRITE-43 — create_draft_email makes a marker-subjected DRAFT (never sent; reserved " +
    ".invalid recipient) -> independent fetch_emails on the Drafts folder confirms the unique " +
    "marker(+suffix draft) subject -> delete_email permanent erases exactly the captured draft. " +
    "destructiveSafe, same-provider cleanup. NOT live-certified yet (durable-queue enum blocker; " +
    "live cert also needs Mail.ReadWrite on the Outlook connection).",
});

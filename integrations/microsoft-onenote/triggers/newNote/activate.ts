import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesList } from "../../api/pagesList";

/**
 * OneNote `new_note` activation hook — Slice 3.ONENOTE-5.
 *
 * Implements the V1 CLAUDE.md "first-poll-miss" rule for polling
 * triggers: BEFORE the first poll tick can fire, seed
 * `snapshot.lastSeenCreatedDateTime` from the section's CURRENT
 * newest-created page. Without this baseline, the first poll would
 * establish its own baseline and silently drop pages that were
 * created between activation and the first tick.
 *
 * Validates required config:
 *   - `node.config.sectionId` — OneNote section id. The poll loop
 *     reads this verbatim; the schema validator at `schema.ts`
 *     re-checks at poll-tick time.
 *   - `node.config.notebookId` — present but not used by Graph for
 *     `/me/onenote/sections/{id}/pages`; preserved for re-activation
 *     idempotency + payload echo.
 *
 * Empty-section handling: when the section has zero existing pages,
 * `pagesList({orderBy: "createdDateTime desc", top: 1})` returns
 * `pages: []`. Seed with the activation timestamp (ISO 8601 UTC) so
 * every real page Graph creates AFTER this activation has a strictly
 * larger `createdDateTime`. Mirrors Discord's "synthesize a high-water
 * snowflake from current wall-clock" idea but using ISO timestamps
 * (Graph's natural ordering).
 *
 * Re-activation idempotency: the orchestrator calls activate every
 * time the workflow transitions to `active`. Each call re-seeds the
 * snapshot from the section's CURRENT newest page; pages created
 * during the "disabled" window are intentionally NOT replayed
 * (workflow re-enables are not history-replay events). Matches the
 * Gmail + Discord patterns.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = node.config ?? {};

  const sectionId = (config as { sectionId?: unknown }).sectionId;
  if (typeof sectionId !== "string" || sectionId.length === 0) {
    throw new Error(
      "microsoft-onenote new_note activate: node.config.sectionId is required.",
    );
  }
  const notebookId = (config as { notebookId?: unknown }).notebookId;
  if (typeof notebookId !== "string" || notebookId.length === 0) {
    throw new Error(
      "microsoft-onenote new_note activate: node.config.notebookId is required.",
    );
  }

  const result = await refreshAndRetry({
    userId: integration.userId,
    provider: "microsoft-onenote",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      pagesList({
        accessToken,
        sectionId,
        orderBy: "createdDateTime desc",
        top: 1,
      }),
  });

  const nowIso = new Date().toISOString();
  let lastSeenCreatedDateTime: string;
  const newest = result.pages[0];
  if (
    newest &&
    typeof newest.createdDateTime === "string" &&
    newest.createdDateTime.length > 0
  ) {
    lastSeenCreatedDateTime = newest.createdDateTime;
  } else {
    // Empty section — high-water seed from current wall-clock so the
    // first real page strictly exceeds it (ISO 8601 string ordering
    // matches chronological order).
    lastSeenCreatedDateTime = nowIso;
  }

  return {
    notebookId,
    sectionId,
    pollingEnabled: true,
    snapshot: {
      lastSeenCreatedDateTime,
      capturedAt: nowIso,
    },
  };
};

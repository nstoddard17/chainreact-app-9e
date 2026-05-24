import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesList } from "../../api/pagesList";

/**
 * OneNote `updated_note` activation hook — Slice 3.ONENOTE-5.
 *
 * Implements the V1 CLAUDE.md "first-poll-miss" rule for polling
 * triggers: BEFORE the first poll tick can fire, seed
 * `snapshot.lastSeenModifiedDateTime` from the section's CURRENT
 * most-recently-modified page. Without this baseline, the first poll
 * would establish its own baseline and silently drop updates that
 * arrived between activation and the first tick.
 *
 * Validates required config: `notebookId`, `sectionId` (UI cascade
 * parent; preserved for payload echo + re-activation idempotency).
 * Optional `pageId` filter is preserved as-is (null when not set).
 *
 * Empty-section handling: when the section has zero existing pages,
 * `pagesList({orderBy: "lastModifiedDateTime desc", top: 1})` returns
 * `pages: []`. Seed with the activation timestamp so every real page
 * update Graph performs AFTER this activation has a strictly larger
 * `lastModifiedDateTime`. Same approach as new_note.
 *
 * Re-activation idempotency: each call re-seeds the snapshot from the
 * section's CURRENT most-recently-modified page; updates that
 * happened during the "disabled" window are intentionally NOT
 * replayed. Matches Gmail / Discord / new_note conventions.
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = node.config ?? {};

  const sectionId = (config as { sectionId?: unknown }).sectionId;
  if (typeof sectionId !== "string" || sectionId.length === 0) {
    throw new Error(
      "microsoft-onenote updated_note activate: node.config.sectionId is required.",
    );
  }
  const notebookId = (config as { notebookId?: unknown }).notebookId;
  if (typeof notebookId !== "string" || notebookId.length === 0) {
    throw new Error(
      "microsoft-onenote updated_note activate: node.config.notebookId is required.",
    );
  }
  const rawPageId = (config as { pageId?: unknown }).pageId;
  const pageId =
    typeof rawPageId === "string" && rawPageId.length > 0 ? rawPageId : null;

  const result = await refreshAndRetry({
    userId: integration.userId,
    provider: "microsoft-onenote",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      pagesList({
        accessToken,
        sectionId,
        orderBy: "lastModifiedDateTime desc",
        top: 1,
      }),
  });

  const nowIso = new Date().toISOString();
  let lastSeenModifiedDateTime: string;
  const newest = result.pages[0];
  if (
    newest &&
    typeof newest.lastModifiedDateTime === "string" &&
    newest.lastModifiedDateTime.length > 0
  ) {
    lastSeenModifiedDateTime = newest.lastModifiedDateTime;
  } else {
    lastSeenModifiedDateTime = nowIso;
  }

  return {
    notebookId,
    sectionId,
    pageId,
    pollingEnabled: true,
    snapshot: {
      lastSeenModifiedDateTime,
      capturedAt: nowIso,
    },
  };
};

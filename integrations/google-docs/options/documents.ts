import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { filesList } from "@/integrations/google-drive/api/filesList";

/**
 * `google-docs:documents` options resolver — Slice 3.GDOCS-3.
 *
 * Backs the `documentId` field on the four document-targeted Google
 * Docs actions shipped in GDOCS-2 (`update_document`, `share_document`,
 * `get_document`, `export_document`). `create_document` doesn't take
 * a documentId; `share_document` / `export_document` operate on any
 * Drive file the user has access to but the picker is scoped to
 * Docs-only files to match author intent.
 *
 * The resolver enumerates Drive files filtered by Docs' mimeType
 * (`application/vnd.google-apps.document`) and `trashed=false`. The
 * Google Sheets analog (`google-sheets:spreadsheets`) ships its own
 * Drive list wrapper under `integrations/google-sheets/api/`; GDOCS-3
 * instead reuses the shared `integrations/google-drive/api/filesList.ts`
 * wrapper (extended in this slice to accept `mimeType` + `orderBy`).
 * Going forward, new Google-Workspace options resolvers should also
 * route through `filesList` rather than duplicate Drive list logic per
 * provider tree.
 *
 * Architecture:
 *   - `requiresIntegration: true` — the route loads an active Google
 *     Docs integration row before invocation and short-circuits with
 *     `INTEGRATION_DISCONNECTED` if no row exists.
 *   - No `requiredDeps` — documents are account-scoped; the picker
 *     opens against the connected Drive.
 *   - Wraps the Drive call in `refreshAndRetry({provider: "google-docs",
 *     accountId: null})` so a stale access token triggers exactly one
 *     refresh + retry cycle. Google access tokens default to a 1h TTL
 *     so the refresh path is the production-safe choice.
 *   - The Drive `drive` scope is already in the Google Docs manifest
 *     (`integrations/google-docs/manifest.ts`) — no scope addition
 *     required for this resolver.
 *
 * Mapping (Drive file → OptionItem):
 *   - `value`: Drive file id (the documentId).
 *   - `label`: file name. Drive guarantees a string `name` on
 *     Workspace-mimeType files; defensive null-check stays in the
 *     mapping loop.
 *   - `description`: `modifiedTime` formatted as "Modified
 *     YYYY-MM-DD" (date only — minute precision would feel stale by
 *     the time the picker renders). Omitted when Drive doesn't return
 *     a modifiedTime or the prefix isn't ISO-shaped.
 *
 * Pagination:
 *   - `pageSize: 200` — matches the Slack / Sheets / HubSpot resolvers.
 *     Single-page UI; `hasMore` is a "refine search to narrow"
 *     affordance, not a cursor.
 *   - `hasMore: true` when the returned file count hits the 200 cap.
 *     Per the GDOCS-3 spec, this is page-cap-based (not
 *     nextPageToken-based) — the renderer's contract is "show a
 *     refinement hint when the picker can't show everything", and the
 *     cap-hit signal is closer to that intent than a Drive cursor
 *     (Drive occasionally returns a nextPageToken with strictly less
 *     than `pageSize` files on the first page).
 *
 * Sort order: `orderBy: "modifiedTime desc"`. Workflow authors picking
 * a document usually want the one they were just editing.
 *
 * Client-side `q` filter — case-insensitive substring match on the
 * rendered label. Same shape as `google-sheets:spreadsheets`.
 *
 * Error sanitization:
 *   - `IntegrationActionRequiredError` from refreshAndRetry (refresh
 *     failed or refresh-not-supported) → `INTEGRATION_DISCONNECTED`
 *     with a reconnect prompt.
 *   - Leaked `Unauthorized401Error` (defense in depth — refreshAndRetry
 *     should swallow + retry 401s) → `INTEGRATION_DISCONNECTED`.
 *   - Any other thrown error from the wrapper (generic Error from a
 *     non-401 4xx/5xx, network failure, decode failure) →
 *     `PROVIDER_ERROR` with a sanitized message. The raw Drive error
 *     body is dropped from the user-visible string.
 *   - Never logs the access token, never echoes raw Drive response
 *     bodies.
 */

const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";
const PAGE_SIZE = 200;

function formatDescription(modifiedTime: unknown): string | undefined {
  if (typeof modifiedTime !== "string" || modifiedTime.length === 0) {
    return undefined;
  }
  const datePart = modifiedTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
  return `Modified ${datePart}`;
}

export const googleDocsDocumentsResolver: OptionsResolver = {
  source: "google-docs:documents",
  provider: "google-docs",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      // Defense in depth — the route guards against this. The
      // `requiresIntegration: true` resolvers receive a non-null
      // integration record OR the route short-circuits with
      // `INTEGRATION_DISCONNECTED` before dispatch.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Docs integration. Connect Google Docs first.",
      );
    }

    let page;
    try {
      page = await refreshAndRetry({
        userId: ctx.userId,
        provider: "google-docs",
        accountId: null,
        apiCall: (accessToken) =>
          filesList({
            accessToken,
            mimeType: GOOGLE_DOCS_MIME_TYPE,
            pageSize: PAGE_SIZE,
            orderBy: "modifiedTime desc",
            // Trim the default fields mask to what the resolver needs.
            // Keeps the response small and avoids surfacing fields
            // (parents, webViewLink) we don't render.
            fields: "files(id,name,modifiedTime),nextPageToken",
          }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Docs and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Docs and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google Docs. Try again.",
      );
    }

    const rawFiles = Array.isArray(page.files) ? page.files : [];
    const items: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [];
    for (const raw of rawFiles) {
      const id =
        typeof (raw as { id?: unknown }).id === "string"
          ? ((raw as { id: string }).id)
          : null;
      const name =
        typeof (raw as { name?: unknown }).name === "string"
          ? ((raw as { name: string }).name)
          : null;
      if (!id || id.length === 0) continue;
      if (!name || name.length === 0) continue;
      const description = formatDescription(
        (raw as { modifiedTime?: unknown }).modifiedTime,
      );
      items.push(
        description !== undefined
          ? { value: id, label: name, description }
          : { value: id, label: name },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    // hasMore is page-cap-based per the GDOCS-3 spec. The renderer
    // uses it as a "refine to narrow" affordance — we want to surface
    // it whenever the picker has clearly capped, even if Drive didn't
    // hand back a nextPageToken on this particular page.
    return {
      items: filtered,
      hasMore: rawFiles.length >= PAGE_SIZE,
    };
  },
};

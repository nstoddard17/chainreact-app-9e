import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { notebooksList } from "@/integrations/microsoft-onenote/api/notebooksList";

/**
 * `microsoft-onenote:notebooks` options resolver — Slice 3.ONENOTE-3.
 *
 * Top-level OneNote picker. Account-scoped (one notebook list per
 * connected user). Backs the future `notebookId` field on the
 * notebook-targeted action metas (`create_section`,
 * `get_notebook_details`, plus the `notebookId` step in the future
 * `create_page` / `create_notebook` UX). The resolver ships
 * resolver-first ahead of ONENOTE-4's action metas; OneNote stays
 * OUT of `COVERED_PROVIDERS` until those land.
 *
 * Architecture:
 *   - `requiresIntegration: true` — the route loads an active OneNote
 *     integration row via `getActiveForExecution(userId,
 *     "microsoft-onenote", null)` and short-circuits with
 *     `INTEGRATION_DISCONNECTED` if no row exists.
 *   - No `requiredDeps` — notebooks are account-scoped.
 *   - Wrapper goes through `refreshAndRetry({provider:
 *     "microsoft-onenote", accountId: ctx.integration.providerAccountId})`
 *     so a stale Microsoft access token triggers exactly one refresh +
 *     retry cycle. Microsoft v2 access tokens default to a 60-90 minute
 *     TTL — refresh is the production-safe choice. `accountId` is
 *     pinned to the integration the route resolved (matches the
 *     Mailchimp resolver pattern; explicit > implicit even though
 *     tokenScope is "user" today).
 *
 * Sort: Graph-side `$orderby=displayName asc`. Notebook lists are
 * small (typically <20 per user) and alphabetical is the natural UX
 * for a top-level picker — workflow authors usually know the notebook
 * name they want and a case-insensitive `q` filter against the label
 * narrows further.
 *
 * Pagination:
 *   - `top: 100` — single-page UI. OneNote users rarely have >100
 *     notebooks; if they do, `hasMore` flags it and the renderer
 *     surfaces the "refine search" hint.
 *   - `hasMore: result.nextLink !== null` — Graph's pagination signal.
 *     Different from the Drive page-cap pattern because Graph's
 *     nextLink is authoritative (Graph always returns it when more
 *     pages exist; doesn't underfill the first page).
 *
 * Mapping (OneNote notebook → OptionItem):
 *   - `value`: `id` (Graph notebook id; used by every notebook-targeted
 *     action).
 *   - `label`: `displayName` when non-empty, else the id as fallback.
 *     Graph guarantees displayName on notebooks, but the defensive
 *     fallback matches the cross-provider pattern.
 *   - `description`: `lastModifiedDateTime` formatted as
 *     `"Modified YYYY-MM-DD"` (date only — minute precision feels
 *     stale by the time the picker renders). Omitted when Graph
 *     doesn't return the field or the prefix isn't ISO-shaped. Mirrors
 *     `google-docs:documents`' description shape.
 *
 * Client-side `q` filter — case-insensitive substring match on the
 * label. Same shape as every other resolver.
 *
 * Error sanitization:
 *   - `IntegrationActionRequiredError` from refreshAndRetry (refresh
 *     failed or refresh-not-supported) → `INTEGRATION_DISCONNECTED`
 *     with a reconnect prompt.
 *   - Leaked `Unauthorized401Error` (defense in depth — refreshAndRetry
 *     should swallow + retry 401s) → `INTEGRATION_DISCONNECTED`.
 *   - Any other thrown error from the wrapper (generic Error from a
 *     non-401 4xx/5xx, network failure, decode failure) →
 *     `PROVIDER_ERROR` with a sanitized message. The raw Graph error
 *     body is dropped from the user-visible string.
 *   - Never logs the access token, never echoes raw Graph response
 *     bodies.
 */

const PAGE_SIZE = 100;

function formatDescription(lastModifiedDateTime: unknown): string | undefined {
  if (
    typeof lastModifiedDateTime !== "string" ||
    lastModifiedDateTime.length === 0
  ) {
    return undefined;
  }
  const datePart = lastModifiedDateTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
  return `Modified ${datePart}`;
}

export const microsoftOneNoteNotebooksResolver: OptionsResolver = {
  source: "microsoft-onenote:notebooks",
  provider: "microsoft-onenote",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      // Defense in depth — the route guards against this. The
      // `requiresIntegration: true` resolvers receive a non-null
      // integration record OR the route short-circuits with
      // `INTEGRATION_DISCONNECTED` before dispatch.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active OneNote integration. Connect OneNote first.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "microsoft-onenote",
        accountId,
        apiCall: (accessToken) =>
          notebooksList({
            accessToken,
            orderBy: "displayName asc",
            top: PAGE_SIZE,
          }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect OneNote and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect OneNote and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load OneNote notebooks. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const nb of result.notebooks) {
      if (typeof nb.id !== "string" || nb.id.length === 0) continue;
      const label =
        typeof nb.displayName === "string" && nb.displayName.length > 0
          ? nb.displayName
          : nb.id;
      const description = formatDescription(nb.lastModifiedDateTime);
      items.push(
        description !== undefined
          ? { value: nb.id, label, description }
          : { value: nb.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: result.nextLink !== null,
    };
  },
};

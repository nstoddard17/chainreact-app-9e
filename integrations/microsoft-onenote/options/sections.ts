import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { sectionsList } from "@/integrations/microsoft-onenote/api/sectionsList";

/**
 * `microsoft-onenote:sections` options resolver — Slice 3.ONENOTE-3.
 *
 * Backs the `sectionId` field on the section-targeted OneNote actions
 * (`create_page`, `get_section_details`, `list_pages`) and on the
 * future `copy_page` action's `targetSectionId` / `sourceSectionId`
 * fields. The dep name is pinned to `notebookId` verbatim — every
 * consumer field name uses camelCase (`notebookId` / `sectionId`)
 * matching the ONENOTE-2 Zod schemas. No snake_case normalization
 * (same rule applied to every prior provider arc).
 *
 * Architecture mirrors `mailchimp:segments` / `hubspot:deal_stages`:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["notebookId"]` — route validates + short-circuits
 *     with `MISSING_DEPENDENCY` before dispatch.
 *   - Wrapper goes through `refreshAndRetry({provider:
 *     "microsoft-onenote", providerAccountId: ctx.integration.accountId})`.
 *
 * Sort: Graph-side `$orderby=displayName asc`. OneNote sections within
 * a notebook are usually <30; alphabetical matches Notebook → Section
 * UX expectations.
 *
 * Pagination: `top: 100`, `hasMore: result.nextLink !== null` (Graph's
 * pagination signal). Notebooks with >100 sections are rare; the
 * picker surfaces a refinement hint when they exist.
 *
 * Mapping (OneNote section → OptionItem):
 *   - `value`: `id` (Graph section id; used by every section-targeted
 *     action).
 *   - `label`: `displayName` when non-empty, else the id as fallback.
 *
 * Description: deliberately omitted. Section `lastModifiedDateTime`
 * tracks page-edit churn inside the section rather than the section
 * itself; surfacing it would noisily change the description every
 * time a page in the section gets touched. Future polish (page count,
 * `isDefault` badge) can land when there's a real consumer need.
 *
 * Notebook-not-found / 404 handling: if the parent `notebookId` was
 * deleted between picker mounts, the OneNote wrapper throws
 * `NotFoundError`. We map to empty `items` rather than throw —
 * mirrors `mailchimp:segments` cascade fallback. The workflow author's
 * natural next move is to re-pick the parent notebook, and the
 * cascade clears `sectionId` automatically when they do.
 *
 * Error sanitization mirrors `microsoft-onenote:notebooks`. Provider
 * error bodies never reach the browser.
 */

const PAGE_SIZE = 100;

export const microsoftOneNoteSectionsResolver: OptionsResolver = {
  source: "microsoft-onenote:sections",
  provider: "microsoft-onenote",
  requiresIntegration: true,
  requiredDeps: ["notebookId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active OneNote integration. Connect OneNote first.",
      );
    }

    const integration = ctx.integration;

    const notebookId = ctx.deps.notebookId;
    if (typeof notebookId !== "string" || notebookId.length === 0) {
      // Defense in depth — the route's requiredDeps guard fires before
      // dispatch. This branch covers direct in-process invocations and
      // any future caller that bypasses the route.
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a notebook first.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-onenote",
        providerAccountId,
        apiCall: (accessToken) =>
          sectionsList({
            accessToken,
            notebookId,
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
      if (err instanceof NotFoundError) {
        // Parent notebook id no longer exists (deleted) — empty picker.
        // NOT a thrown error: re-picking the notebook clears `sectionId`
        // and triggers a fresh fetch under the new parent value.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load OneNote sections. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const sec of result.sections) {
      if (typeof sec.id !== "string" || sec.id.length === 0) continue;
      const label =
        typeof sec.displayName === "string" && sec.displayName.length > 0
          ? sec.displayName
          : sec.id;
      items.push({ value: sec.id, label });
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

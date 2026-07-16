import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { sectionsListAll } from "@/integrations/microsoft-onenote/api/sectionsListAll";

/**
 * `microsoft-onenote:target_sections` options resolver — RESOLVERS-1.
 *
 * Backs the `targetSectionId` picker on `copy_page` — the field the
 * ONENOTE-4 "dual-hierarchy picker limitation" left as a raw text
 * input. Sections are listed ACROSS ALL notebooks in one flat picker
 * labeled "Notebook › Section", which needs NO parent dep — chosen
 * deliberately because `copyPage.schema.ts` is `.strict()`: a
 * `targetNotebookId` cascade parent would be rejected at runtime, and
 * the source cascade already claims the `notebookId` field name. Zero
 * runtime-schema changes.
 *
 * Endpoint: `GET /v1.0/me/onenote/sections?$expand=parentNotebook($select=id,displayName)&$top=100`
 * via the new `api/sectionsListAll.ts` wrapper.
 * Docs: https://learn.microsoft.com/en-us/graph/api/onenote-list-sections
 * Scope: covered by the manifest's existing `Notes.ReadWrite`.
 *
 * Mapping (section → OptionItem):
 *   - `value`: section `id` (what `copy_page.targetSectionId` stores).
 *   - `label`: `"<notebook displayName> › <section displayName>"`;
 *     falls back to the section name alone when the parent notebook is
 *     missing, and to the id when even the name is absent.
 *   - `description`: omitted (the notebook context is already in the
 *     label).
 *
 * Sort: local alphabetical on the composed label — groups sections by
 * notebook naturally. One bounded page (`$top=100`); `hasMore:
 * result.nextLink !== null`. Local case-insensitive `q` filter on the
 * label (matches notebook OR section name because both are in it).
 *
 * Error sanitization mirrors `microsoft-onenote:notebooks` (no parent
 * dep → no NotFound cascade fallback): auth →
 * `INTEGRATION_DISCONNECTED`; anything else → `PROVIDER_ERROR`. Raw
 * Graph bodies / tokens / page content never reach the browser.
 *
 * Needs live smoke — coded against the official Graph docs; no live
 * verification was possible in this slice.
 */

const PAGE_SIZE = 100;

export const microsoftOneNoteTargetSectionsResolver: OptionsResolver = {
  source: "microsoft-onenote:target_sections",
  provider: "microsoft-onenote",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active OneNote integration. Connect OneNote first.",
      );
    }

    const integration = ctx.integration;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-onenote",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          sectionsListAll({ accessToken, top: PAGE_SIZE }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect OneNote and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load OneNote sections. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const sec of result.sections) {
      if (typeof sec.id !== "string" || sec.id.length === 0) continue;
      const sectionName =
        typeof sec.displayName === "string" && sec.displayName.length > 0
          ? sec.displayName
          : sec.id;
      const notebookName =
        typeof sec.parentNotebook?.displayName === "string" &&
        sec.parentNotebook.displayName.length > 0
          ? sec.parentNotebook.displayName
          : undefined;
      const label =
        notebookName !== undefined
          ? `${notebookName} › ${sectionName}`
          : sectionName;
      items.push({ value: sec.id, label });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;
    filtered.sort((a, b) => a.label.localeCompare(b.label));

    return {
      items: filtered,
      hasMore: result.nextLink !== null,
    };
  },
};

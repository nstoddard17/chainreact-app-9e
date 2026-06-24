/**
 * Write smoke harness deps — Notion discovery seams.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 * Notion verifies via registered read actions, so there is no Notion smoke
 * read-back here — only target discovery (parent page + database). The database
 * search runs through `refreshAndRetry` (seam-refresh-guard.test.ts).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getOptionsResolver } from "@/services/options/_registry";
import { search as notionSearch, type SearchHit } from "@/integrations/notion/api/search";
import { pickNotionSmokeDatabase, type ChosenNotionDatabase, type NotionDatabaseHitLite } from "../writeTargets";

/**
 * Discover a safe Notion PARENT page for `create_page` via the read-only
 * `notion:pages` resolver (POST /search, object=page). Prefers a smoke/test-named
 * page; on a THROWAWAY smoke account, falls back to the first accessible page
 * (creating a marked child page + archiving it is harmless there). Returns the
 * parent page id (env-overlay only) + its title for the report, or null.
 */
export async function discoverNotionSmokeParentPage(
  accountId: string,
  userId: string,
): Promise<{ pageId: string; title: string } | null> {
  const integration = await getActiveForExecution(accountId, "notion", null);
  if (!integration) return null;
  const pagesR = getOptionsResolver("notion:pages");
  if (!pagesR) return null;
  const pages = await pagesR.resolve({ userId, integration, q: "", deps: {} });
  if (pages.items.length === 0) return null;
  const named = pages.items.find((p) => /smoke|test|chainreact/i.test(p.label ?? ""));
  const chosen = named ?? pages.items[0]!;
  return { pageId: chosen.value, title: chosen.label ?? chosen.value };
}

/**
 * Discover a safe smoke Notion DATABASE (+ its title-property name) for
 * `create_database_entry` via the read-only search API (object=database). When
 * `pinnedId` (SMOKE_NOTION_DATABASE_ID) is set, that exact database is used; else a
 * smoke/test-named DB is preferred, falling back to the first accessible DB on a
 * throwaway account. Returns the database id + title-field name (env-overlay only)
 * or null -> caller reports BLOCKED_ENV. READ-ONLY (POST /v1/search).
 */
export async function discoverNotionSmokeDatabase(
  accountId: string,
  userId: string,
  pinnedId?: string | null,
): Promise<ChosenNotionDatabase | null> {
  const integration = await getActiveForExecution(accountId, "notion", null);
  if (!integration) return null;
  let response;
  try {
    // refreshAndRetry mirrors the notion handlers + the notion:pages resolver.
    // Notion is non-refreshable today (tokens are long-lived) so this is a no-op
    // on success / surfaces a 401 on failure — but it keeps the seam on the SAME
    // path as every other Notion read, so a future Notion-refresh slice can't
    // silently leave this discovery raw (the Airtable SMOKE-WRITE-11 bug class).
    response = await refreshAndRetry({
      accountId,
      provider: "notion",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        notionSearch({
          accessToken,
          query: "",
          filter: { value: "database", property: "object" },
          pageSize: 100,
        }),
    });
  } catch {
    return null;
  }
  const hits: NotionDatabaseHitLite[] = response.results
    .filter((h) => h.object === "database")
    .map((h) => ({
      id: h.id,
      title: notionDatabaseTitle(h),
      titleFieldName: notionTitlePropertyName(h),
    }));
  return pickNotionSmokeDatabase(hits, pinnedId);
}

/** Plain-text title of a database search hit (rich-text array → string). */
function notionDatabaseTitle(hit: SearchHit): string {
  if (Array.isArray(hit.title)) {
    const text = hit.title.map((t) => t.plain_text ?? t.text?.content ?? "").join("").trim();
    if (text.length > 0) return text;
  }
  return hit.id;
}

/** The NAME of the title-type property in a database hit's schema, or null. */
function notionTitlePropertyName(hit: SearchHit): string | null {
  const props = hit.properties;
  if (props && typeof props === "object") {
    for (const [name, value] of Object.entries(props)) {
      if ((value as { type?: string })?.type === "title") return name;
    }
  }
  return null;
}

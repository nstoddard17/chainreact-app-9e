import { listOfficialTemplatesServiceRole } from "@/repositories/workflowTemplates";
import {
  matchOfficialTemplates,
  selectOfficialCatalogEntries,
  type MatchOfficialTemplatesOptions,
  type MatchOfficialTemplatesResult,
  type OfficialTemplateCatalogEntry,
} from "@/core/workflows/officialTemplateMatcher";

/**
 * Service seam for deterministic official-template matching (4.REACT-AGENT-TEMPLATE-MATCH-1).
 *
 * The clean entry point a FUTURE slice calls (from the workflow-guidance route / a React Agent
 * advisory capability) to find strong official templates for a natural-language request — so the
 * agent can prefer a confident official template over generating a workflow from scratch.
 *
 * This slice is matching-FOUNDATION ONLY: it is NOT wired into the route or any UI yet. It:
 *   1. loads the OFFICIAL catalog (repository: `source='official'`, `account_id IS NULL`) as the
 *      public-safe `MarketplaceTemplateSummary` (no account/user id, no raw definition reaches it),
 *   2. projects it to safe matcher entries (`selectOfficialCatalogEntries` — defense-in-depth
 *      official+public filter, so no user/private/unlisted template can enter the global matcher),
 *   3. runs the pure deterministic matcher.
 *
 * It NEVER mutates a workflow, uses/forks/creates a template, calls a model/provider, or returns
 * the raw definition / config / any id beyond the public template id. The matcher output is the
 * only thing it returns — safe public-catalog facts + score + confidence + reasons.
 */

export type {
  MatchOfficialTemplatesResult,
  OfficialTemplateCatalogEntry,
} from "@/core/workflows/officialTemplateMatcher";

export interface SuggestOfficialTemplatesInput {
  readonly requestText: string;
  readonly options?: MatchOfficialTemplatesOptions;
  /**
   * Optional catalog loader override (tests inject a stub so no DB is hit). Defaults to the
   * official-only repository reader.
   */
  readonly loadCatalog?: () => Promise<readonly OfficialTemplateCatalogEntry[]>;
}

/** Default loader: official-only repository read → safe matcher entries. */
async function loadOfficialCatalogEntries(): Promise<OfficialTemplateCatalogEntry[]> {
  const summaries = await listOfficialTemplatesServiceRole();
  return selectOfficialCatalogEntries(summaries);
}

/**
 * Find and rank official templates for a workflow request. Returns
 * `{ confidence: "none", matches: [] }` for vague requests or when nothing clears the threshold.
 */
export async function suggestOfficialTemplatesForRequest(
  input: SuggestOfficialTemplatesInput,
): Promise<MatchOfficialTemplatesResult> {
  const load = input.loadCatalog ?? loadOfficialCatalogEntries;
  const catalog = await load();
  return matchOfficialTemplates(input.requestText, catalog, input.options);
}

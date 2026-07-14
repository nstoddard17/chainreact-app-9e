import { listOfficialTemplatesServiceRole } from "@/repositories/workflowTemplates";
import {
  matchOfficialTemplates,
  selectOfficialCatalogEntries,
  selectOfficialTemplateRecommendation,
  type MatchOfficialTemplatesOptions,
  type MatchOfficialTemplatesResult,
  type OfficialTemplateCatalogEntry,
  type OfficialTemplateMatch,
  type TemplateMatchOutcome,
} from "@/core/workflows/officialTemplateMatcher";
import type { ActionEffectFacts, ActionEffectFactsLookup } from "@/core/workflows/actionEffect";
import { getActionMeta } from "@/services/discovery/_registry";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

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
  TemplateMatchOutcome,
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

/**
 * REACT-AGENT-TEMPLATE-MATCH-4 — the three-way decision seam the guidance route acts on: should the
 * agent RECOMMEND an official template, or build the workflow manually? Loads the official-only
 * catalog, runs the deterministic structural classifier, and maps a strong recommendation (if any)
 * into the SAFE guidance DTO. A `strong_match` carries a SINGLE recommendation; `weak_match` /
 * `no_match` carry `null` (the agent falls back to manual node-by-node construction).
 */
export interface SelectOfficialTemplateRecommendationResult {
  readonly outcome: TemplateMatchOutcome;
  /** The SAFE recommendation DTO for a `strong_match`; `null` for `weak_match` / `no_match`. */
  readonly recommendation: GuidanceOfficialTemplateMatch | null;
}

/**
 * Inject the AUTHORITATIVE `ActionMeta` side-effect facts into the pure classifier's semantic
 * action-contribution check (REACT-AGENT-TEMPLATE-MATCH-4 multi-provider hardening). Reads only the
 * SAFE subset (`category` / `isDestructive` / `requiresConfirmation` / `riskLevel`) from the discovery
 * registry — never a config value, token, or resource id. Unknown `provider:type` → `undefined`, and
 * the pure classifier falls back to its conservative action-type-verb heuristic.
 */
const actionEffectFactsLookup: ActionEffectFactsLookup = (provider, type) => {
  const meta = getActionMeta(`${provider}:${type}`);
  if (!meta) return undefined;
  const facts: ActionEffectFacts = {
    category: meta.category,
    isDestructive: meta.isDestructive,
    requiresConfirmation: meta.requiresConfirmation,
    riskLevel: meta.riskLevel,
  };
  return facts;
};

export async function selectOfficialTemplateRecommendationForRequest(
  input: SuggestOfficialTemplatesInput,
): Promise<SelectOfficialTemplateRecommendationResult> {
  const load = input.loadCatalog ?? loadOfficialCatalogEntries;
  const catalog = await load();
  const result = selectOfficialTemplateRecommendation(input.requestText, catalog, {
    effectFactsFor: actionEffectFactsLookup,
  });
  return {
    outcome: result.outcome,
    recommendation: result.recommendation
      ? (toGuidanceTemplateMatches([result.recommendation])[0] ?? null)
      : null,
  };
}

/**
 * Deterministic, model-free rail copy for the manual-fallback path (REACT-AGENT-TEMPLATE-MATCH-4).
 * Shown when a template only PARTIALLY matched (a `weak_match`) and the agent is building directly
 * instead of forcing an unsuitable template on the user.
 */
export function buildManualFallbackNoticeText(): string {
  return "I couldn't find a template that closely matches this request, so I'll build it directly.";
}

/**
 * Project matcher results into the SAFE guidance-route DTO (flatten the safe `summary` + stamp
 * `isOfficial`). Pure — carries only public-catalog facts; no definition / config / token / id
 * beyond the public template id can flow through (the input already excludes them).
 */
export function toGuidanceTemplateMatches(
  matches: readonly OfficialTemplateMatch[],
): GuidanceOfficialTemplateMatch[] {
  return matches.map((m) => ({
    templateId: m.templateId,
    name: m.name,
    description: m.description,
    score: m.score,
    confidence: m.confidence,
    reasons: m.reasons,
    isOfficial: true,
    providers: m.summary.providers,
    providerLabels: m.summary.providerLabels,
    triggerKind: m.summary.triggerKind,
    category: m.summary.category,
    categoryLabel: m.summary.categoryLabel,
    nodeCount: m.summary.nodeCount,
    stepCount: m.summary.stepCount,
    steps: m.summary.steps,
  }));
}

/** Deterministic, model-free rail copy for a high-confidence official-template match. */
export function buildOfficialTemplateMatchGuidanceText(
  matches: readonly GuidanceOfficialTemplateMatch[],
): string {
  const top = matches[0];
  if (!top) return "";
  return (
    `I found an official template that already matches this workflow: “${top.name}”. ` +
    `You can preview it before creating anything — nothing has been created or changed.`
  );
}

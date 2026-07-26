/**
 * Help Center content types (HELP-CENTER-1).
 *
 * The Help Center is a public, user-facing support surface for nontechnical
 * customers — NOT internal engineering docs and NOT a developer API portal.
 * Articles are authored as typed local data (no CMS, no DB) so the catalog is
 * reviewable in PRs and testable like any other code.
 *
 * Stable-linking contract (contextual-help readiness):
 *   - An article's canonical URL is `/help/<slug>`. Slugs are lowercase
 *     kebab-case, never renamed and never reused once shipped — future
 *     product surfaces (config fields, connection errors, failed-run cards,
 *     billing-limit messages, onboarding items) may deep-link to them.
 *   - `providerId` ties an article to a registered provider id from
 *     `integrations/_registry.ts`, so provider-scoped surfaces can look up
 *     "the help article for this app" without a hardcoded slug.
 */

export type HelpCategoryId =
  | "getting-started"
  | "workflows"
  | "connecting-apps"
  | "analytics"
  | "troubleshooting"
  | "accounts-teams"
  | "billing-usage";

export interface HelpCategoryDef {
  id: HelpCategoryId;
  /** User-facing category label ("Getting started"). */
  label: string;
  /** One-sentence description shown on the category card. */
  blurb: string;
}

/**
 * Structured article content. Deliberately small: plain-language prose,
 * ordered steps, short lists, and note/warning callouts. No markdown, no
 * embedded HTML, no screenshots — blocks render through the article page's
 * typed renderer only.
 */
export type HelpArticleBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "steps"; items: readonly string[] }
  | { kind: "list"; items: readonly string[] }
  | { kind: "note"; text: string }
  | { kind: "warning"; text: string };

export interface HelpArticle {
  /** Stable kebab-case identifier; canonical URL is `/help/<slug>`. */
  slug: string;
  title: string;
  /** One-or-two sentence plain-language summary (search + cards + article lede). */
  summary: string;
  category: HelpCategoryId;
  /** Extra search terms beyond the title/summary words. */
  keywords: readonly string[];
  content: readonly HelpArticleBlock[];
  relatedArticleSlugs?: readonly string[];
  /** Registered provider id (integrations/_registry.ts) for provider articles. */
  providerId?: string;
  /** ISO date (yyyy-mm-dd) of the last meaningful content revision. */
  updatedAt?: string;
}

/**
 * Provider entry for the "Integration help" section. Built SERVER-SIDE in
 * `app/help/_providers.ts` from the real provider registry + Apps-page
 * category/description maps, then passed to the client page as props — the
 * Help Center never carries its own provider names/icons (no second source
 * of truth, and no registry import in the client bundle).
 */
export interface HelpProviderEntry {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  articleSlug: string;
}

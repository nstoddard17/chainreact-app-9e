import type { HelpArticle, HelpCategoryId } from "./helpTypes";
import { helpCategoryLabel } from "./helpCategories";
import { GETTING_STARTED_ARTICLES } from "./articles/gettingStarted";
import { WORKFLOWS_ARTICLES } from "./articles/workflows";
import { CONNECTING_APPS_ARTICLES } from "./articles/connectingApps";
import { PROVIDER_ARTICLES } from "./articles/providers";
import { TROUBLESHOOTING_ARTICLES } from "./articles/troubleshooting";
import { ACCOUNTS_TEAMS_ARTICLES } from "./articles/accountsTeams";
import { BILLING_USAGE_ARTICLES } from "./articles/billingUsage";

/**
 * Help Center article catalog + pure accessors (HELP-CENTER-1).
 *
 * Adding an article = add it to the right `articles/<category>.ts` file
 * (or a new file concatenated below) — the Help Center pages derive
 * everything (search index, category counts, related links, static params)
 * from this catalog, so no page edits are needed.
 *
 * Everything here is pure data + pure functions: safe to import from client
 * components, server components, and tests alike. No services, no repos,
 * no provider-registry import (provider entries are built server-side in
 * app/help/_providers.ts).
 */
export const HELP_ARTICLES: readonly HelpArticle[] = [
  ...GETTING_STARTED_ARTICLES,
  ...WORKFLOWS_ARTICLES,
  ...CONNECTING_APPS_ARTICLES,
  ...PROVIDER_ARTICLES,
  ...TROUBLESHOOTING_ARTICLES,
  ...ACCOUNTS_TEAMS_ARTICLES,
  ...BILLING_USAGE_ARTICLES,
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function articlesForCategory(category: HelpCategoryId): readonly HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category);
}

export function helpArticleCount(category: HelpCategoryId): number {
  return articlesForCategory(category).length;
}

/** Resolve an article's related slugs to articles, skipping any that don't exist. */
export function relatedArticlesFor(article: HelpArticle): readonly HelpArticle[] {
  return (article.relatedArticleSlugs ?? [])
    .map((slug) => getHelpArticle(slug))
    .filter((a): a is HelpArticle => a !== undefined);
}

/**
 * Provider-scoped lookup for contextual help (stable-linking contract):
 * "the help article for this app". Returns undefined for providers without
 * a dedicated article — callers fall back to the generic connect article.
 */
export function helpArticleForProvider(providerId: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.providerId === providerId);
}

/**
 * The "Start here" onboarding path, in order. Mirrors the in-product
 * "Launch your first workflow" checklist sequence.
 */
export const QUICK_START_SLUGS: readonly string[] = [
  "connect-an-app",
  "create-your-first-workflow",
  "configure-workflow-steps",
  "test-a-workflow",
  "turn-on-a-workflow",
];

/**
 * Curated "Popular articles" set — an editorial starting list, NOT usage
 * analytics (the Help Center deliberately shows no view counts or fake
 * popularity data).
 */
export const POPULAR_SLUGS: readonly string[] = [
  "create-your-first-workflow",
  "connect-an-app",
  "test-a-workflow",
  "use-data-from-an-earlier-step",
  "understand-triggers-and-actions",
  "fix-a-disconnected-app",
  "troubleshoot-a-failed-run",
  "invite-your-team",
  "understand-task-usage",
  "change-or-cancel-your-subscription",
];

/**
 * Curated provider ids for the "Integration help" section — launch-visible,
 * commonly used, transportation-relevant first. The section renders only
 * ids that resolve in the provider registry AND are catalog-visible (the
 * server builder enforces that), so this list can never invent an app.
 */
export const HELP_PROVIDER_IDS: readonly string[] = [
  "motive",
  "fleetio",
  "gmail",
  "microsoft-outlook",
  "slack",
  "quickbooks",
];

const SEARCH_RESULT_LIMIT = 8;

interface ScoredArticle {
  article: HelpArticle;
  score: number;
}

/**
 * Local catalog search: case-insensitive substring match over title,
 * summary, keywords, and category label (same matching philosophy as the
 * builder's picker search — no fuzzy engine). Title matches rank first,
 * then keyword, then summary/category. Empty/whitespace queries return [].
 */
export function searchHelpArticles(query: string): readonly HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const scored: ScoredArticle[] = [];
  for (const article of HELP_ARTICLES) {
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    const category = helpCategoryLabel(article.category).toLowerCase();
    const keywordHit = article.keywords.some((k) => k.toLowerCase().includes(q));

    let score = 0;
    if (title.includes(q)) score = title.startsWith(q) ? 4 : 3;
    else if (keywordHit) score = 2;
    else if (summary.includes(q) || category.includes(q)) score = 1;

    if (score > 0) scored.push({ article, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((s) => s.article);
}

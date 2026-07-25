/**
 * Help Center catalog integrity + search (HELP-CENTER-1).
 *
 * Pins the stable-linking contract (unique kebab-case slugs, resolvable
 * related links, curated lists that point at real articles) and the local
 * search behavior (title / keyword / summary / category matching, ranking,
 * empty states). Also proves the "Integration help" provider ids resolve
 * in the REAL provider registry — the Help Center must never invent an app.
 */
import {
  HELP_ARTICLES,
  getHelpArticle,
  articlesForCategory,
  helpArticleCount,
  relatedArticlesFor,
  helpArticleForProvider,
  searchHelpArticles,
  QUICK_START_SLUGS,
  POPULAR_SLUGS,
  HELP_PROVIDER_IDS,
} from "@/features/marketing/help/helpCatalog";
import { HELP_CATEGORIES } from "@/features/marketing/help/helpCategories";
import { getProvider } from "@/integrations/_registry";

describe("help catalog — integrity", () => {
  it("slugs are unique and kebab-case (stable URL contract)", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("every article has a title, summary, keywords, and at least one content block", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.summary.length).toBeGreaterThan(0);
      expect(a.keywords.length).toBeGreaterThan(0);
      expect(a.content.length).toBeGreaterThan(0);
    }
  });

  it("every category has at least one article, and counts derive from the catalog", () => {
    for (const cat of HELP_CATEGORIES) {
      const articles = articlesForCategory(cat.id);
      expect(articles.length).toBeGreaterThan(0);
      expect(helpArticleCount(cat.id)).toBe(articles.length);
    }
  });

  it("related-article slugs all resolve and never self-reference", () => {
    for (const a of HELP_ARTICLES) {
      const related = a.relatedArticleSlugs ?? [];
      for (const slug of related) {
        expect(getHelpArticle(slug)).toBeDefined();
        expect(slug).not.toBe(a.slug);
      }
      // The resolver returns exactly the declared set (nothing dropped).
      expect(relatedArticlesFor(a).map((r) => r.slug)).toEqual(related);
    }
  });

  it("quick-start slugs resolve, in order, to getting-started articles", () => {
    expect(QUICK_START_SLUGS).toHaveLength(5);
    for (const slug of QUICK_START_SLUGS) {
      const article = getHelpArticle(slug);
      expect(article).toBeDefined();
      expect(article?.category).toBe("getting-started");
    }
  });

  it("popular slugs resolve to real articles", () => {
    for (const slug of POPULAR_SLUGS) {
      expect(getHelpArticle(slug)).toBeDefined();
    }
  });
});

describe("help catalog — provider articles use the real registry", () => {
  it("every curated provider id is a registered provider (no invented apps)", () => {
    for (const id of HELP_PROVIDER_IDS) {
      expect(getProvider(id)).toBeDefined();
    }
  });

  it("every curated provider id has a dedicated help article tagged with providerId", () => {
    for (const id of HELP_PROVIDER_IDS) {
      const article = helpArticleForProvider(id);
      expect(article).toBeDefined();
      expect(article?.providerId).toBe(id);
      expect(article?.category).toBe("connecting-apps");
    }
  });

  it("every providerId on any article resolves in the registry", () => {
    for (const a of HELP_ARTICLES) {
      if (a.providerId) {
        expect(getProvider(a.providerId)).toBeDefined();
      }
    }
  });
});

describe("help search", () => {
  it("matches by title and ranks title matches first", () => {
    const results = searchHelpArticles("triggers");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.slug).toBe("understand-triggers-and-actions");
  });

  it("matches by keyword", () => {
    // "quota" appears only as a keyword on the task-usage article.
    const results = searchHelpArticles("quota");
    expect(results.map((r) => r.slug)).toContain("understand-task-usage");
  });

  it("matches by summary text", () => {
    // "one-time invite link" is in the invite article's summary.
    const results = searchHelpArticles("one-time invite");
    expect(results.map((r) => r.slug)).toContain("invite-your-team");
  });

  it("matches by category label", () => {
    const results = searchHelpArticles("billing and usage");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.category).toBe("billing-usage");
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(searchHelpArticles("  SLACK  ").map((r) => r.slug)).toContain("connect-slack");
  });

  it("returns [] for empty / whitespace / no-match queries", () => {
    expect(searchHelpArticles("")).toEqual([]);
    expect(searchHelpArticles("   ")).toEqual([]);
    expect(searchHelpArticles("xyzzy-plugh-42")).toEqual([]);
  });

  it("caps the result list", () => {
    // A broad single letter hits many articles; the list stays bounded.
    expect(searchHelpArticles("a").length).toBeLessThanOrEqual(8);
  });
});

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import { HelpSearch } from "./help/HelpSearch";
import { HelpCategoryBrowser } from "./help/HelpCategoryBrowser";
import { HelpSupportCallout } from "./help/HelpSupportCallout";
import { HelpProviderIcon } from "./help/HelpProviderIcon";
import {
  getHelpArticle,
  QUICK_START_SLUGS,
  POPULAR_SLUGS,
} from "./help/helpCatalog";
import type { HelpProviderEntry } from "./help/helpTypes";

/**
 * Public Help Center landing page (HELP-CENTER-1).
 *
 * A user-facing support surface for nontechnical customers — searchable
 * articles, a quick-start path, browsable topics, integration help, and a
 * real support fallback. Follows the marketing static-page idiom
 * (Security/Privacy/Pricing): `[data-marketing-surface]` token scope,
 * MarketingHeader/Footer chrome, co-located scoped styles on `--mk-*`
 * tokens, server component with small client islands (search, category
 * browser, provider-icon fallback). Works signed-in or signed-out — no
 * auth gate, no redirect.
 *
 * Content comes exclusively from the typed catalog in ./help/ — this page
 * derives every section from it and never hardcodes article lists.
 * `providers` is built server-side from the provider registry
 * (app/help/_providers.ts) — no provider names/icons are duplicated here.
 *
 * HONESTY: no fake view counts, no fabricated support metrics, no dead
 * controls. "Popular articles" is a curated editorial set (see
 * POPULAR_SLUGS), not analytics.
 */

const SUPPORT_EMAIL = "support@chainreact.app";

interface Props {
  providers: readonly HelpProviderEntry[];
  /** Route-resolved viewer session: swaps the header CTAs for "Open ChainReact". */
  authenticated?: boolean;
}

export function HelpCenterPage({ providers, authenticated = false }: Props) {
  const quickStart = QUICK_START_SLUGS.map(getHelpArticle).filter(
    (a): a is NonNullable<typeof a> => a !== undefined,
  );
  const popular = POPULAR_SLUGS.map(getHelpArticle).filter(
    (a): a is NonNullable<typeof a> => a !== undefined,
  );

  return (
    <div data-marketing-surface className="hc-root" data-testid="help-center-page">
      <MarketingHeader authenticated={authenticated} />

      <main className="hc-main">
        <div className="hc">
          {/* 1 — Hero + search */}
          <header className="hc-hero">
            <div className="hc-eyebrow">ChainReact Help Center</div>
            <h1 className="hc-title">How can we help?</h1>
            <p className="hc-lede">
              Learn how to connect your apps, build and test workflows, and sort things out
              when a run doesn&apos;t go to plan.
            </p>
            <HelpSearch supportEmail={SUPPORT_EMAIL} />
          </header>

          {/* 2 — Quick-start path */}
          <section className="hc-section" aria-labelledby="hc-start-h" data-testid="help-quick-start">
            <h2 id="hc-start-h" className="hc-section-h">
              Start here
            </h2>
            <p className="hc-section-sub">
              New to ChainReact? These five short guides take you from your first connected
              app to a live workflow.
            </p>
            <ol className="hc-start-list">
              {quickStart.map((article, i) => (
                <li key={article.slug}>
                  <Link href={`/help/${article.slug}`} className="hc-start-item">
                    <span className="hc-start-num" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="hc-start-body">
                      <span className="hc-start-title">{article.title}</span>
                      <span className="hc-start-summary">{article.summary}</span>
                    </span>
                    <ChevronRight size={15} aria-hidden className="hc-start-chev" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          {/* 3 — Categories */}
          <section className="hc-section" aria-labelledby="hc-topics-h" data-testid="help-categories">
            <h2 id="hc-topics-h" className="hc-section-h">
              Browse by topic
            </h2>
            <HelpCategoryBrowser />
          </section>

          {/* 4 — Popular articles (curated, not analytics) */}
          <section className="hc-section" aria-labelledby="hc-popular-h" data-testid="help-popular">
            <h2 id="hc-popular-h" className="hc-section-h">
              Popular articles
            </h2>
            <ul className="hc-popular-grid">
              {popular.map((article) => (
                <li key={article.slug}>
                  <Link href={`/help/${article.slug}`} className="hc-popular-item">
                    <span>{article.title}</span>
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* 5 — Integration help (registry-derived; hidden when empty) */}
          {providers.length > 0 && (
            <section
              className="hc-section"
              aria-labelledby="hc-apps-h"
              data-testid="help-integrations"
            >
              <h2 id="hc-apps-h" className="hc-section-h">
                Help with the apps you use
              </h2>
              <p className="hc-section-sub">
                Step-by-step connection guides for commonly used apps. Every supported app is
                listed on the <Link href="/apps" className="hc-inline-link">Apps page</Link>.
              </p>
              <ul className="hc-provider-grid">
                {providers.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/help/${p.articleSlug}`}
                      className="hc-provider-card"
                      data-testid={`help-provider-${p.id}`}
                    >
                      <HelpProviderIcon name={p.name} iconUrl={p.iconUrl} />
                      <span className="hc-provider-body">
                        <span className="hc-provider-name">{p.name}</span>
                        <span className="hc-provider-desc">{p.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 6 — Support fallback */}
          <HelpSupportCallout email={SUPPORT_EMAIL} />
        </div>
      </main>

      <MarketingFooter />

      <style>{`
        .hc-root {
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
        }
        .hc-root a { text-decoration: none; }
        .hc-main { background: var(--mk-bg); }
        .hc { max-width: 940px; margin: 0 auto; padding: 52px 24px 90px; }

        .hc-hero { text-align: center; max-width: 640px; margin: 0 auto 56px; }
        .hc-eyebrow { font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mk-muted); margin-bottom: 14px; }
        .hc-title { font-size: clamp(34px, 6vw, 46px); font-weight: 700; letter-spacing: -0.035em; margin: 0 0 14px; color: var(--mk-text); line-height: 1.05; }
        .hc-lede { font-size: 16px; line-height: 1.65; color: var(--mk-muted); margin: 0 0 26px; text-wrap: pretty; }

        .hc-search { position: relative; text-align: left; }
        .hc-search-box { display: flex; align-items: center; gap: 10px; background: var(--mk-panel); border: 1px solid var(--mk-border-strong); border-radius: 12px; padding: 0 16px; transition: border-color .12s ease; }
        .hc-search-box:focus-within { border-color: var(--mk-accent); }
        .hc-search-ic { color: var(--mk-muted); flex: none; }
        .hc-search-input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: var(--mk-text); font-size: 14.5px; padding: 14px 0; font-family: inherit; }
        .hc-search-input::placeholder { color: var(--mk-muted-2); }
        .hc-search-input::-webkit-search-cancel-button { -webkit-appearance: none; }

        .hc-search-results { list-style: none; margin: 8px 0 0; padding: 6px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 12px; display: flex; flex-direction: column; gap: 2px; }
        .hc-search-result { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 8px; }
        .hc-search-result:hover, .hc-search-result.is-active { background: var(--mk-panel-2); }
        .hc-search-result:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: -2px; }
        .hc-search-result-title { font-size: 13.5px; font-weight: 600; color: var(--mk-text); }
        .hc-search-result-meta { font-size: 12px; color: var(--mk-muted); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }

        .hc-search-empty { margin-top: 8px; padding: 16px 18px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 12px; }
        .hc-search-empty-title { font-size: 13.5px; font-weight: 600; color: var(--mk-text); margin: 0 0 4px; }
        .hc-search-empty-body { font-size: 13px; color: var(--mk-muted); margin: 0; line-height: 1.6; }
        .hc-search-empty-mail, .hc-inline-link { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .hc-search-empty-mail:hover, .hc-inline-link:hover { border-bottom-color: var(--mk-text); }

        .hc-section { margin: 0 0 52px; }
        .hc-section-h { font-size: 21px; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); margin: 0 0 6px; }
        .hc-section-sub { font-size: 14px; color: var(--mk-muted); margin: 0 0 18px; text-wrap: pretty; }

        .hc-start-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; counter-reset: none; }
        .hc-start-item { display: flex; align-items: center; gap: 14px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 12px; padding: 14px 16px; transition: border-color .12s ease, transform .12s ease; }
        .hc-start-item:hover { border-color: var(--mk-border-strong); transform: translateY(-1px); }
        .hc-start-item:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-start-num { width: 26px; height: 26px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--mk-accent-soft); color: var(--mk-text); font-size: 12.5px; font-weight: 600; font-family: var(--font-mono), ui-monospace, monospace; }
        .hc-start-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .hc-start-title { font-size: 14px; font-weight: 600; color: var(--mk-text); }
        .hc-start-summary { font-size: 12.5px; color: var(--mk-muted); line-height: 1.5; }
        .hc-start-chev { color: var(--mk-muted-2); flex: none; }

        .hc-cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media (max-width: 880px) { .hc-cat-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .hc-cat-grid { grid-template-columns: 1fr; } }
        .hc-cat-card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 14px; padding: 18px; cursor: pointer; font-family: inherit; transition: border-color .12s ease, transform .12s ease; }
        .hc-cat-card:hover { border-color: var(--mk-border-strong); transform: translateY(-2px); }
        .hc-cat-card:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-cat-card.is-active { border-color: var(--mk-accent); }
        .hc-cat-ic { width: 34px; height: 34px; border-radius: 9px; background: var(--mk-accent-soft); color: var(--mk-text); display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
        .hc-cat-label { font-size: 14px; font-weight: 600; color: var(--mk-text); }
        .hc-cat-blurb { font-size: 12.5px; color: var(--mk-muted); line-height: 1.55; text-wrap: pretty; }
        .hc-cat-count { font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; color: var(--mk-muted-2); margin-top: 2px; }

        .hc-cat-panel { margin-top: 14px; background: var(--mk-panel); border: 1px solid var(--mk-border-strong); border-radius: 14px; padding: 18px 20px; }
        .hc-cat-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
        .hc-cat-panel-title { font-size: 15px; font-weight: 600; color: var(--mk-text); margin: 0; }
        .hc-cat-clear { background: transparent; border: 1px solid var(--mk-border); border-radius: 8px; color: var(--mk-text-2); font-size: 12px; font-family: inherit; padding: 6px 10px; cursor: pointer; }
        .hc-cat-clear:hover { border-color: var(--mk-border-strong); color: var(--mk-text); }
        .hc-cat-clear:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-cat-panel-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
        .hc-cat-panel-list li + li { border-top: 1px solid var(--mk-border); }
        .hc-article-link { display: flex; flex-direction: column; gap: 2px; padding: 11px 2px; border-radius: 6px; }
        .hc-article-link:hover .hc-article-link-title { color: var(--mk-text); text-decoration: underline; }
        .hc-article-link:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-article-link-title { font-size: 13.5px; font-weight: 600; color: var(--mk-text); }
        .hc-article-link-summary { font-size: 12.5px; color: var(--mk-muted); line-height: 1.5; }

        .hc-popular-grid { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (max-width: 640px) { .hc-popular-grid { grid-template-columns: 1fr; } }
        .hc-popular-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 10px; padding: 12px 14px; font-size: 13.5px; font-weight: 500; color: var(--mk-text-2); transition: border-color .12s ease, color .12s ease; }
        .hc-popular-item:hover { border-color: var(--mk-border-strong); color: var(--mk-text); }
        .hc-popular-item:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-popular-item svg { color: var(--mk-muted-2); flex: none; }

        .hc-provider-grid { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 880px) { .hc-provider-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .hc-provider-grid { grid-template-columns: 1fr; } }
        /* The li stretches to the grid row; the card fills it so every card in
           a row is equal height regardless of description length. */
        .hc-provider-grid li { display: flex; }
        .hc-provider-card { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 12px; padding: 13px 14px; transition: border-color .12s ease, transform .12s ease; }
        .hc-provider-card:hover { border-color: var(--mk-border-strong); transform: translateY(-1px); }
        .hc-provider-card:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-provider-ic { width: 36px; height: 36px; flex: none; border-radius: 9px; background: var(--mk-panel-2); border: 1px solid var(--mk-border); display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .hc-provider-ic img { width: 20px; height: 20px; display: block; }
        .hc-provider-ic-fallback { font-size: 12px; font-weight: 600; color: var(--mk-text-2); }
        .hc-provider-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .hc-provider-name { font-size: 13.5px; font-weight: 600; color: var(--mk-text); }
        .hc-provider-desc { font-size: 12px; color: var(--mk-muted); line-height: 1.45; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

        .hc-support { text-align: center; padding: 36px 28px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 16px; }
        .hc-support-h { font-size: 19px; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); margin: 0 0 8px; }
        .hc-support-p { font-size: 14px; color: var(--mk-muted); margin: 0 auto 18px; max-width: 440px; line-height: 1.6; text-wrap: pretty; }
        .hc-support-btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 18px; background: var(--mk-text); color: var(--mk-bg); border: 1px solid var(--mk-text); border-radius: 8px; font-size: 13px; font-weight: 600; transition: transform .08s ease, filter .12s ease; }
        .hc-support-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .hc-support-btn:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

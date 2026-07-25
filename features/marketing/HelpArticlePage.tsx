import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronRight, Info } from "lucide-react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import { HelpSupportCallout } from "./help/HelpSupportCallout";
import { helpCategoryLabel } from "./help/helpCategories";
import { relatedArticlesFor } from "./help/helpCatalog";
import type { HelpArticle, HelpArticleBlock } from "./help/helpTypes";

/**
 * Help article detail page (HELP-CENTER-1).
 *
 * Server component rendering one catalog article: breadcrumbs, category
 * label, title, summary lede, the typed content blocks (paragraphs, steps,
 * lists, note/warning callouts), related articles, and a way back to the
 * Help Center. Same marketing-surface idiom as the other public pages.
 *
 * Deliberately NO "Was this helpful?" controls — there is no backend to
 * receive the feedback in this batch, and dead controls must not ship.
 */

const SUPPORT_EMAIL = "support@chainreact.app";

function ArticleBlock({ block }: { block: HelpArticleBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <p className="ha-p">{block.text}</p>;
    case "heading":
      return <h2 className="ha-h2">{block.text}</h2>;
    case "steps":
      return (
        <ol className="ha-steps">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="ha-list">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "note":
      return (
        <aside className="ha-callout ha-note" role="note">
          <Info size={15} aria-hidden />
          <p>{block.text}</p>
        </aside>
      );
    case "warning":
      return (
        <aside className="ha-callout ha-warning" role="note">
          <AlertTriangle size={15} aria-hidden />
          <p>{block.text}</p>
        </aside>
      );
  }
}

interface Props {
  article: HelpArticle;
  /** Route-resolved viewer session: swaps the header CTAs for "Open ChainReact". */
  authenticated?: boolean;
}

export function HelpArticlePage({ article, authenticated = false }: Props) {
  const related = relatedArticlesFor(article);
  const categoryLabel = helpCategoryLabel(article.category);

  return (
    <div data-marketing-surface className="ha-root" data-testid="help-article-page">
      <MarketingHeader authenticated={authenticated} />

      <main className="ha-main">
        <article className="ha">
          <nav aria-label="Breadcrumb" className="ha-crumbs" data-testid="help-article-breadcrumbs">
            <Link href="/help" className="ha-crumb-link">
              Help Center
            </Link>
            <ChevronRight size={12} aria-hidden />
            <span className="ha-crumb">{categoryLabel}</span>
            <ChevronRight size={12} aria-hidden />
            <span className="ha-crumb-cur" aria-current="page">
              {article.title}
            </span>
          </nav>

          <header className="ha-head">
            <span className="ha-cat-chip">{categoryLabel}</span>
            <h1 className="ha-title">{article.title}</h1>
            <p className="ha-lede">{article.summary}</p>
          </header>

          <div className="ha-body">
            {article.content.map((block, i) => (
              <ArticleBlock key={i} block={block} />
            ))}
          </div>

          {related.length > 0 && (
            <section className="ha-related" aria-labelledby="ha-related-h" data-testid="help-article-related">
              <h2 id="ha-related-h" className="ha-related-h">
                Related articles
              </h2>
              <ul className="ha-related-list">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/help/${r.slug}`} className="ha-related-item">
                      <span className="ha-related-title">{r.title}</span>
                      <span className="ha-related-summary">{r.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="ha-foot">
            <Link href="/help" className="ha-back" data-testid="help-article-back">
              <ArrowLeft size={14} aria-hidden /> Back to Help Center
            </Link>
            <HelpSupportCallout email={SUPPORT_EMAIL} compact />
          </footer>
        </article>
      </main>

      <MarketingFooter />

      <style>{`
        .ha-root {
          --ha-warn: #fbbf24;
          --ha-warn-soft: rgba(251, 191, 36, 0.10);
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
        }
        .ha-root a { text-decoration: none; }
        .ha-main { background: var(--mk-bg); }
        .ha { max-width: 700px; margin: 0 auto; padding: 44px 24px 90px; }

        .ha-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: 12px; color: var(--mk-muted); margin-bottom: 28px; }
        .ha-crumbs svg { color: var(--mk-muted-2); flex: none; }
        .ha-crumb-link { color: var(--mk-text-2); font-weight: 500; }
        .ha-crumb-link:hover { color: var(--mk-text); }
        .ha-crumb-link:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; border-radius: 3px; }
        .ha-crumb-cur { color: var(--mk-text-2); font-weight: 500; }

        .ha-head { margin-bottom: 26px; }
        .ha-cat-chip { display: inline-block; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mk-text-2); background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 999px; padding: 4px 10px; margin-bottom: 14px; }
        .ha-title { font-size: clamp(27px, 5vw, 36px); font-weight: 700; letter-spacing: -0.03em; color: var(--mk-text); margin: 0 0 10px; line-height: 1.1; }
        .ha-lede { font-size: 15.5px; line-height: 1.65; color: var(--mk-muted); margin: 0; text-wrap: pretty; }

        .ha-body { display: flex; flex-direction: column; gap: 14px; padding-top: 22px; border-top: 1px solid var(--mk-border); }
        .ha-p { font-size: 14.5px; line-height: 1.75; color: var(--mk-text-2); margin: 0; text-wrap: pretty; }
        .ha-h2 { font-size: 18px; font-weight: 600; letter-spacing: -0.015em; color: var(--mk-text); margin: 10px 0 0; }
        .ha-steps { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 9px; }
        .ha-steps li { font-size: 14.5px; line-height: 1.7; color: var(--mk-text-2); padding-left: 4px; }
        .ha-steps li::marker { color: var(--mk-text); font-weight: 600; font-size: 13px; }
        .ha-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
        .ha-list li { font-size: 14.5px; line-height: 1.7; color: var(--mk-text-2); padding-left: 2px; }
        .ha-list li::marker { color: var(--mk-muted-2); }

        .ha-callout { display: flex; gap: 11px; align-items: flex-start; padding: 13px 15px; border-radius: 11px; margin: 2px 0; }
        .ha-callout p { font-size: 13.5px; line-height: 1.65; margin: 0; color: var(--mk-text-2); text-wrap: pretty; }
        .ha-callout svg { flex: none; margin-top: 2px; }
        .ha-note { background: var(--mk-accent-soft); border: 1px solid color-mix(in oklab, var(--mk-accent) 30%, var(--mk-border)); }
        .ha-note svg { color: var(--mk-accent); }
        .ha-warning { background: var(--ha-warn-soft); border: 1px solid color-mix(in oklab, var(--ha-warn) 30%, var(--mk-border)); }
        .ha-warning svg { color: var(--ha-warn); }

        .ha-related { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--mk-border); }
        .ha-related-h { font-size: 15px; font-weight: 600; color: var(--mk-text); margin: 0 0 12px; letter-spacing: -0.01em; }
        .ha-related-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .ha-related-item { display: flex; flex-direction: column; gap: 2px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 11px; padding: 12px 14px; transition: border-color .12s ease; }
        .ha-related-item:hover { border-color: var(--mk-border-strong); }
        .ha-related-item:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .ha-related-title { font-size: 13.5px; font-weight: 600; color: var(--mk-text); }
        .ha-related-summary { font-size: 12.5px; color: var(--mk-muted); line-height: 1.5; }

        .ha-foot { margin-top: 36px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .ha-back { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 500; color: var(--mk-text-2); border: 1px solid var(--mk-border); border-radius: 8px; padding: 8px 14px; background: var(--mk-panel); transition: border-color .12s ease, color .12s ease; }
        .ha-back:hover { border-color: var(--mk-border-strong); color: var(--mk-text); }
        .ha-back:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .hc-support-compact { font-size: 13px; color: var(--mk-muted); margin: 0; }
        .hc-support-mail { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .hc-support-mail:hover { border-bottom-color: var(--mk-text); }
      `}</style>
    </div>
  );
}

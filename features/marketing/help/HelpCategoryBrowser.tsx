"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Rocket,
  Workflow,
  Plug,
  BarChart3,
  Wrench,
  Users,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { HELP_CATEGORIES } from "./helpCategories";
import { articlesForCategory, helpArticleCount } from "./helpCatalog";
import type { HelpCategoryId } from "./helpTypes";

/**
 * "Browse by topic" category grid + in-place article browser (HELP-CENTER-1).
 *
 * Selecting a category card expands a panel below the grid listing that
 * category's articles (real links to /help/<slug>); selecting the same card
 * again — or "Show all topics" — collapses it. Article counts are derived
 * from the catalog, never hardcoded. Cards are real <button>s with
 * aria-pressed, and the panel is aria-live so the change is announced.
 */

const CATEGORY_ICONS: Record<HelpCategoryId, LucideIcon> = {
  "getting-started": Rocket,
  workflows: Workflow,
  "connecting-apps": Plug,
  analytics: BarChart3,
  troubleshooting: Wrench,
  "accounts-teams": Users,
  "billing-usage": CreditCard,
};

export function HelpCategoryBrowser() {
  const [active, setActive] = useState<HelpCategoryId | null>(null);
  const activeDef = HELP_CATEGORIES.find((c) => c.id === active) ?? null;
  const activeArticles = active ? articlesForCategory(active) : [];

  return (
    <div className="hc-topics">
      <div className="hc-cat-grid">
        {HELP_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.id];
          const count = helpArticleCount(cat.id);
          const pressed = active === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={"hc-cat-card" + (pressed ? " is-active" : "")}
              data-testid={`help-category-card-${cat.id}`}
              aria-pressed={pressed}
              aria-controls="help-category-panel"
              onClick={() => setActive(pressed ? null : cat.id)}
            >
              <span className="hc-cat-ic" aria-hidden>
                <Icon size={17} strokeWidth={1.75} />
              </span>
              <span className="hc-cat-label">{cat.label}</span>
              <span className="hc-cat-blurb">{cat.blurb}</span>
              <span className="hc-cat-count">
                {count} {count === 1 ? "article" : "articles"}
              </span>
            </button>
          );
        })}
      </div>

      <div id="help-category-panel" aria-live="polite">
        {activeDef && (
          <div className="hc-cat-panel" data-testid="help-category-panel">
            <div className="hc-cat-panel-head">
              <h3 className="hc-cat-panel-title">{activeDef.label}</h3>
              <button
                type="button"
                className="hc-cat-clear"
                data-testid="help-category-clear"
                onClick={() => setActive(null)}
              >
                Show all topics
              </button>
            </div>
            <ul className="hc-cat-panel-list">
              {activeArticles.map((article) => (
                <li key={article.slug}>
                  <Link href={`/help/${article.slug}`} className="hc-article-link">
                    <span className="hc-article-link-title">{article.title}</span>
                    <span className="hc-article-link-summary">{article.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

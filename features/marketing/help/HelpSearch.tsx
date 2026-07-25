"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchHelpArticles } from "./helpCatalog";
import { helpCategoryLabel } from "./helpCategories";

/**
 * Help Center search (HELP-CENTER-1).
 *
 * A functional combobox over the LOCAL article catalog — matches title,
 * summary, keywords, and category label as you type (searchHelpArticles).
 * No network, no external search infrastructure, and deliberately not the
 * shadcn cmdk primitive: that component is styled with the app-surface
 * token system, and marketing surfaces must stay on `--mk-*` tokens
 * (globals.css scoping — "do not mix the two").
 *
 * Keyboard support: ArrowUp/ArrowDown move the active result, Enter opens
 * it (first result when none is highlighted), Escape clears. Results render
 * IN FLOW below the input (no overlay/portal), so there's no outside-click
 * bookkeeping and the page stays calm.
 */

interface Props {
  /** Real staffed mailbox for the no-results fallback; omit to hide it. */
  supportEmail?: string;
}

export function HelpSearch({ supportEmail }: Props) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-help-search-results`;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo(() => searchHelpArticles(query), [query]);
  const open = query.trim().length > 0;
  const activeOptionId =
    activeIndex >= 0 && activeIndex < results.length
      ? `${baseId}-opt-${activeIndex}`
      : undefined;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const target = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (target) {
        e.preventDefault();
        router.push(`/help/${target.slug}`);
      }
    } else if (e.key === "Escape") {
      setQuery("");
      setActiveIndex(-1);
    }
  }

  return (
    <div className="hc-search" data-testid="help-search">
      <div className="hc-search-box">
        <Search size={16} aria-hidden className="hc-search-ic" />
        <input
          type="search"
          className="hc-search-input"
          data-testid="help-search-input"
          role="combobox"
          aria-label="Search help articles"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          placeholder="Search workflows, integrations, billing, and more"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="hc-search-results"
          data-testid="help-search-results"
        >
          {results.map((article, i) => (
            <li key={article.slug} role="presentation">
              <Link
                href={`/help/${article.slug}`}
                role="option"
                id={`${baseId}-opt-${i}`}
                aria-selected={i === activeIndex}
                className={"hc-search-result" + (i === activeIndex ? " is-active" : "")}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="hc-search-result-title">{article.title}</span>
                <span className="hc-search-result-meta">
                  {helpCategoryLabel(article.category)} · {article.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open && results.length === 0 && (
        <div
          role="status"
          className="hc-search-empty"
          data-testid="help-search-empty"
        >
          <p className="hc-search-empty-title">
            No articles match &ldquo;{query.trim()}&rdquo; yet.
          </p>
          <p className="hc-search-empty-body">
            Try a different word, or browse the topics below.
            {supportEmail && (
              <>
                {" "}
                Still stuck?{" "}
                <a href={`mailto:${supportEmail}`} className="hc-search-empty-mail">
                  Email support
                </a>{" "}
                — we read every message.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

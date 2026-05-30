"use client";

import { useState } from "react";

/**
 * Expandable "What you get" feature rows (Slice 4.HOMEPAGE-V2-1).
 *
 * Mirrors the design's `FeatureRows`. Five rows, the first one open by
 * default. Clicking a row toggles open/closed. Pure UI affordance — no
 * server side effect, no claim about counts or pricing tiers; the
 * "247 apps" wording in the design has been softened to "every app we
 * support" since the real count moves and any specific number would
 * drift out of date silently.
 *
 * `aria-expanded` + `<button>` semantics keep the rows keyboard- and
 * screen-reader-friendly.
 */
const ITEMS: ReadonlyArray<{ title: string; desc: string }> = [
  {
    title: "Built in plain English",
    desc: "Tell ChainReact what should happen the way you'd say it to a teammate. No node graphs, no JSON, no API documentation in a new tab.",
  },
  {
    title: "Yours, not just rented",
    desc: "Edit any step, swap the apps, pause for the holidays, clone what works. The automation belongs to you — not to a no-code tool you can't get out of.",
  },
  {
    title: "Quietly reliable",
    desc: "Retries automatically when something hiccups. Surfaces a one-line summary only when it actually needs your attention. No 3am crashes, no anxiety.",
  },
  {
    title: "Connects to what you already pay for",
    desc: "Gmail, Stripe, Shopify, Slack, Notion, HubSpot, and every app we support — with one click to connect each account.",
  },
  {
    title: "Honest pricing",
    desc: "Predictable monthly plans with clear task allowances. The free plan covers most small businesses, and paid plans scale only when you actually need more.",
  },
];

export function MarketingFeatureRows() {
  const [open, setOpen] = useState(0);
  return (
    <section
      className="mk-fr"
      id="what-you-get"
      aria-labelledby="mk-fr-h"
      data-testid="marketing-feature-rows"
    >
      <div className="mk-fr-inner">
        <div className="mk-fr-head">
          <div className="mk-fr-eyebrow">What you get</div>
          <h2 id="mk-fr-h" className="mk-fr-h">Five reasons it sticks.</h2>
        </div>
        <ul className="mk-fr-list">
          {ITEMS.map((it, i) => {
            const isOpen = open === i;
            return (
              <li
                key={it.title}
                className={"mk-fr-row" + (isOpen ? " is-open" : "")}
                data-testid="marketing-feature-row"
                data-row-index={i}
              >
                <button
                  type="button"
                  className="mk-fr-row-h"
                  aria-expanded={isOpen}
                  aria-controls={`mk-fr-body-${i}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span className="mk-fr-no">0{i + 1}</span>
                  <span className="mk-fr-title">{it.title}</span>
                  <span className="mk-fr-plus" aria-hidden>
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`mk-fr-body-${i}`}
                    className="mk-fr-row-body"
                    data-testid="marketing-feature-row-body"
                  >
                    <p>{it.desc}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <style>{`
        .mk-fr { padding: 100px 0; border-top: 1px solid var(--mk-border); }
        .mk-fr-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
        .mk-fr-head {
          display: grid; grid-template-columns: 1fr 2fr;
          gap: 32px; margin-bottom: 56px; align-items: end;
        }
        @media (max-width: 980px) { .mk-fr-head { grid-template-columns: 1fr; } }
        .mk-fr-eyebrow { font-size: 13px; color: var(--mk-muted); }
        .mk-fr-h {
          font-size: clamp(36px, 4.5vw, 64px);
          letter-spacing: -0.025em;
          font-weight: 500;
          line-height: 1.05;
          margin: 0;
          color: var(--mk-text);
        }
        .mk-fr-list {
          list-style: none; padding: 0; margin: 0;
          border-top: 1px solid var(--mk-border);
        }
        .mk-fr-row { border-bottom: 1px solid var(--mk-border); }
        .mk-fr-row:hover { background: var(--mk-panel-2); }
        .mk-fr-row-h {
          display: grid; grid-template-columns: 80px 1fr auto;
          gap: 32px;
          align-items: center;
          padding: 28px 0;
          width: 100%;
          background: transparent;
          border: 0;
          color: var(--mk-text);
          text-align: left;
          cursor: pointer;
        }
        .mk-fr-no {
          font-size: 14px;
          color: var(--mk-muted);
          font-family: var(--font-mono);
        }
        .mk-fr-title {
          font-size: clamp(22px, 2.4vw, 32px);
          letter-spacing: -0.02em;
          font-weight: 500;
          line-height: 1.2;
          color: var(--mk-text);
        }
        .mk-fr-plus {
          font-size: 28px;
          color: var(--mk-muted);
          font-weight: 300;
          line-height: 1;
          padding-right: 4px;
        }
        .mk-fr-row.is-open .mk-fr-plus { color: var(--mk-text); }
        .mk-fr-row-body { padding: 0 0 32px 112px; }
        .mk-fr-row-body p {
          font-size: 17px;
          color: var(--mk-muted);
          line-height: 1.55;
          max-width: 640px;
          margin: 0;
        }
      `}</style>
    </section>
  );
}

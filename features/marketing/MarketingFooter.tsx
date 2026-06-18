import Link from "next/link";

/**
 * Static site footer for marketing / public sub-pages (Slice 4.SECURITY-1).
 *
 * The homepage ships its footer woven into the cinematic `MarketingEnding`
 * scroll scene — that markup is intentionally NOT reused here because its
 * sticky-pin layout is fragile and would drag the animation onto a static
 * content page. This is a plain, server-rendered twin: same columns
 * (Product / Get started / Legal), same `--mk-*` tokens, no motion.
 *
 * Link parity with the woven footer is deliberate so the two surfaces feel
 * identical. `Security` and `Privacy` point at the real `/security` and
 * `/privacy` routes; `Terms` remains a `#` placeholder (no such route exists
 * yet) — matching the homepage footer's current honesty posture.
 */
const NAV_COLS: ReadonlyArray<{
  h: string;
  links: ReadonlyArray<{ label: string; href: string; internal?: boolean }>;
}> = [
  {
    h: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Examples", href: "/#examples" },
      { label: "Apps", href: "/apps", internal: true },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    h: "Get started",
    links: [
      { label: "Try it free", href: "/auth/sign-up", internal: true },
      { label: "Sign in", href: "/auth/sign-in", internal: true },
    ],
  },
  {
    h: "Legal",
    links: [
      { label: "Privacy", href: "/privacy", internal: true },
      { label: "Terms", href: "#" },
      { label: "Security", href: "/security", internal: true },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="mkf" aria-label="Site footer" data-testid="marketing-footer">
      <div className="mkf-grid">
        <div className="mkf-bcol">
          <div className="mkf-brand-h">
            <span className="mkf-mark" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
                <rect
                  x="8"
                  y="19"
                  width="37"
                  height="37"
                  rx="13"
                  stroke="var(--logo-brand, #38bdf8)"
                  strokeWidth="7.5"
                />
                <circle cx="51.5" cy="12.5" r="6.5" fill="var(--logo-brand, #38bdf8)" />
              </svg>
            </span>
            <span className="mkf-brand-name">ChainReact</span>
          </div>
          <p className="mkf-tag">
            The friendly way to automate the busywork. Built for small businesses who&apos;d rather be
            doing literally anything else.
          </p>
        </div>

        {NAV_COLS.map((c) => (
          <nav className="mkf-col" key={c.h} aria-label={c.h}>
            <div className="mkf-col-h">{c.h}</div>
            <ul>
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.internal ? (
                    <Link href={l.href}>{l.label}</Link>
                  ) : (
                    <a href={l.href}>{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mkf-bottom">
        <span>© 2026 ChainReact, Inc.</span>
      </div>

      <style>{`
        .mkf { position: relative; z-index: 1; max-width: 1320px; margin: 0 auto; padding: 24px 32px 48px; }
        .mkf-grid { display: grid; grid-template-columns: 1.7fr repeat(3, 1fr); gap: 36px; padding-bottom: 44px; border-bottom: 1px solid color-mix(in oklab, var(--mk-text) 12%, transparent); }
        @media (max-width: 980px) { .mkf-grid { grid-template-columns: 1fr 1fr; gap: 32px; } }
        .mkf-brand-h { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .mkf-mark { display: inline-flex; flex: none; }
        .mkf-mark svg { display: block; overflow: visible; }
        .mkf-brand-name { font-weight: 700; font-size: 17px; color: var(--mk-text); }
        .mkf-tag { font-size: 13.5px; color: var(--mk-muted); max-width: 340px; margin: 0; line-height: 1.55; }
        .mkf-col-h { font-family: var(--font-mono), ui-monospace, monospace; font-size: 10.5px; color: var(--mk-text); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; }
        .mkf-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
        .mkf-col a { font-size: 13.5px; color: var(--mk-muted); transition: color .12s ease; }
        .mkf-col a:hover { color: var(--mk-text); }
        .mkf-col a:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; border-radius: 3px; }
        .mkf-bottom { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-top: 28px; flex-wrap: wrap; }
        .mkf-bottom span { font-size: 12px; color: var(--mk-muted); }
      `}</style>
    </footer>
  );
}

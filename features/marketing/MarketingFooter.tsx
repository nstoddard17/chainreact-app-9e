import Link from "next/link";

/**
 * Marketing footer (Slice 4.HOMEPAGE-V2-1).
 *
 * Footer chrome from the design's `HomeFooter`, **minus** elements that
 * would be fake actions on a pre-launch surface:
 *   - Newsletter signup form (no /api/newsletter, no list backend)  → OMITTED
 *   - "Real humans · helpful support · usually under 2 hours" claim → OMITTED
 *
 * Column links are kept for design parity. Any link that resolves to a
 * real V2 route is wired (Apps → /integrations, Sign in → /auth/sign-in,
 * Help center → /auth/sign-in for now). Remaining links carry their
 * design slug as an in-page anchor — those marketing pages are not yet
 * built, and we document that in the slice plan rather than rendering
 * fake "coming soon" interactions.
 */
export function MarketingFooter() {
  return (
    <footer
      className="mk-ftr"
      aria-label="Site footer"
      data-testid="marketing-footer"
    >
      <div className="mk-ftr-inner">
        <div className="mk-ftr-top">
          <div className="mk-ftr-brand">
            <div className="mk-ftr-brand-h">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/chainreact-mark.png"
                alt=""
                width={28}
                height={28}
                className="mk-ftr-mark"
                aria-hidden
              />
              <span className="mk-ftr-brand-name">ChainReact</span>
            </div>
            <p className="mk-ftr-tag">
              The friendly way to automate the busywork. Built for small
              businesses who'd rather be doing literally anything else.
            </p>
          </div>

          <div className="mk-ftr-col">
            <div className="mk-ftr-col-h">Product</div>
            <ul>
              <li><a href="#how-it-works">How it works</a></li>
              <li><a href="#examples">Examples</a></li>
              <li><Link href="/apps">Apps</Link></li>
              <li><a href="#pricing">Pricing</a></li>
            </ul>
          </div>

          <div className="mk-ftr-col">
            <div className="mk-ftr-col-h">Get started</div>
            <ul>
              <li><Link href="/auth/sign-up">Try it free</Link></li>
              <li><Link href="/auth/sign-in">Sign in</Link></li>
              <li><a href="#help">Help center</a></li>
            </ul>
          </div>

          <div className="mk-ftr-col">
            <div className="mk-ftr-col-h">Legal</div>
            <ul>
              <li><a href="#privacy">Privacy</a></li>
              <li><a href="#terms">Terms</a></li>
              <li><a href="#security">Security</a></li>
            </ul>
          </div>
        </div>

        <div className="mk-ftr-bottom">
          <span>© 2026 ChainReact, Inc.</span>
        </div>
      </div>
      <style>{`
        .mk-ftr {
          background: color-mix(in oklab, var(--mk-bg-2) 90%, transparent);
          padding: 72px 0 28px;
          border-top: 1px solid var(--mk-border);
        }
        .mk-ftr-inner { max-width: 1320px; margin: 0 auto; padding: 0 24px; }
        .mk-ftr-top {
          display: grid;
          grid-template-columns: 1.6fr repeat(3, 1fr);
          gap: 32px;
          padding-bottom: 48px;
          border-bottom: 1px solid var(--mk-border);
        }
        @media (max-width: 980px) { .mk-ftr-top { grid-template-columns: 1fr 1fr; } }
        .mk-ftr-brand-h { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .mk-ftr-mark { display: block; width: 28px; height: 28px; object-fit: contain; }
        .mk-ftr-brand-name { font-weight: 700; font-size: 16px; }
        .mk-ftr-tag {
          font-size: 13.5px;
          color: var(--mk-muted);
          max-width: 320px;
          margin: 0;
          line-height: 1.5;
        }
        .mk-ftr-col-h {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--mk-text);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 14px;
        }
        .mk-ftr-col ul {
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .mk-ftr-col a {
          font-size: 13px;
          color: var(--mk-muted);
          transition: color .12s ease;
        }
        .mk-ftr-col a:hover { color: var(--mk-text); }
        .mk-ftr-bottom {
          padding: 22px 0 0;
          font-size: 12px;
          color: var(--mk-muted);
        }
      `}</style>
    </footer>
  );
}

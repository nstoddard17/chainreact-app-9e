import Link from "next/link";
import { MarketingBrandLogo } from "./MarketingBrandLogo";
import { MarketingNav } from "./MarketingNav";

/**
 * Sticky top navigation for the marketing landing page
 * (Slice 4.HOMEPAGE-V2-1).
 *
 * Server component — no scroll listener, no theme toggle (decided with
 * the user). The design's stormy/rain/lightning backdrop was an earlier
 * iteration; we ship a quiet glass nav for accessibility and to keep the
 * page mountable without client JS.
 *
 * The "Try it free" / "Sign in" CTAs route to real V2 auth pages. The
 * primary nav anchors (#how-it-works, #examples, etc.) are in-page
 * scroll targets matching the sections rendered below — design parity,
 * not fake actions.
 *
 * HELP-CENTER-CONTEXTUAL-1 (follow-up): pages that serve BOTH signed-in and
 * signed-out visitors (the Help Center) resolve the session server-side and
 * pass `authenticated` — the CTA cluster then shows a single "Open
 * ChainReact" link to /workflows instead of Sign in / Try it free. Omitted
 * (default false) everywhere else, so existing marketing pages are unchanged.
 */
export function MarketingHeader({ authenticated = false }: { authenticated?: boolean }) {
  return (
    <header className="mk-nav" aria-label="Site">
      <div className="mk-nav-inner">
        <Link
          href="/"
          className="mk-nav-brand"
          data-testid="marketing-nav-brand"
          aria-label="ChainReact home"
        >
          <MarketingBrandLogo variant="nav" size={28} fontSize={20} />
        </Link>

        <MarketingNav />

        <div className="mk-nav-cta">
          {authenticated ? (
            <Link
              href="/workflows"
              className="mk-btn-primary"
              data-testid="marketing-nav-open-app"
            >
              Open ChainReact <span aria-hidden>→</span>
            </Link>
          ) : (
            <>
              <Link
                href="/auth/sign-in"
                className="mk-btn-ghost"
                data-testid="marketing-nav-signin"
              >
                Sign in
              </Link>
              <Link
                href="/auth/sign-up"
                className="mk-btn-primary"
                data-testid="marketing-nav-tryfree"
              >
                Try it free <span aria-hidden>→</span>
              </Link>
            </>
          )}
        </div>
      </div>
      <style>{`
        .mk-nav {
          position: sticky; top: 0; z-index: 40;
          background: color-mix(in oklab, var(--mk-bg) 75%, transparent);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border-bottom: 1px solid var(--mk-border);
        }
        .mk-nav-inner {
          max-width: 1320px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          gap: 24px;
          padding: 12px clamp(16px, 4vw, 24px);
          min-width: 0;
        }
        /* Above the breakpoint the group generates NO box, so the nav sits in the
           header's flex row exactly as it did before this slice - same layout,
           same spacing. Below it, the group becomes the positioning context for
           the dropdown panel. One element, two presentations. */
        .mk-nav-group { display: contents; }
        .mk-nav-toggle { display: none; }
        .mk-nav-brand { display: inline-flex; align-items: center; color: var(--mk-text); }

        .mk-nav-links { display: flex; align-items: center; gap: 4px; }
        .mk-nav-link {
          padding: 6px 12px;
          font-size: 13px;
          color: var(--mk-text-2);
          border-radius: 999px;
          transition: color .15s ease, opacity .15s ease;
        }
        .mk-nav-link:hover { color: var(--mk-text); opacity: 0.95; }

        .mk-nav-cta { display: flex; align-items: center; gap: 8px; flex: none; }
        .mk-nav-brand, .mk-nav-cta > * { flex: none; }
        .mk-btn-ghost {
          padding: 7px 12px; font-size: 13px; color: var(--mk-text-2);
          border-radius: 6px;
        }
        .mk-btn-ghost:hover { background: var(--mk-panel); color: var(--mk-text); }
        .mk-btn-primary {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 14px; font-size: 13px; font-weight: 600;
          background: var(--mk-text); color: var(--mk-bg);
          border: 1px solid var(--mk-text);
          border-radius: 6px;
          transition: transform .08s ease, filter .12s ease;
        }
        .mk-btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }

        /* RESPONSIVE-MARKETING-9 - below 960px the links COLLAPSE into a
           disclosure instead of vanishing. The nav element is the same one the
           desktop row uses; only its presentation changes. */
        @media (max-width: 960px) {
          .mk-nav-group { display: block; }
          .mk-nav-toggle {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 7px 12px; font-size: 13px; font-weight: 500;
            color: var(--mk-text-2);
            background: var(--mk-panel); border: 1px solid var(--mk-border);
            border-radius: 8px;
            /* A comfortable touch target - the trigger is the only way to reach
               five destinations on a phone. */
            min-height: 38px;
          }
          .mk-nav-toggle:hover { color: var(--mk-text); border-color: var(--mk-border-strong); }
          /* The row carries brand + Menu + Sign in + Try it free. Measured: at
             360-448px those four cannot share one line and the CTA cluster was
             pushed past the viewport. The row WRAPS rather than compressing -
             brand and Menu keep line one, the two CTAs take line two at full
             width. Nothing is hidden and no wording changes: both auth
             destinations stay visible, which is the whole point of the funnel. */
          .mk-nav-inner { flex-wrap: wrap; gap: 10px 12px; }
          .mk-nav-cta { min-width: 0; }
          .mk-nav-toggle:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
          .mk-nav-toggle-bars { display: inline-flex; flex-direction: column; gap: 3px; }
          .mk-nav-toggle-bars > span {
            display: block; width: 15px; height: 1.5px; border-radius: 2px;
            background: currentColor;
          }

          .mk-nav-links { display: none; }
          .mk-nav-group[data-open="true"] .mk-nav-links {
            display: flex; flex-direction: column; align-items: stretch;
            /* Anchored to the HEADER's gutter, not to the trigger. The trigger
               sits partway across the row, so anchoring there and then asking for
               280px pushed the panel past the right edge at 360-376px (measured).
               .mk-nav is sticky, so it is the containing block; positioning
               against its own gutter means the panel's width is bounded by the
               viewport by construction rather than by a guess. */
            position: absolute;
            top: 100%;
            left: clamp(16px, 4vw, 24px);
            right: clamp(16px, 4vw, 24px);
            max-width: 320px;
            padding: 6px;
            background: var(--mk-bg-2);
            border: 1px solid var(--mk-border);
            border-radius: 12px;
            box-shadow: 0 18px 40px rgba(0,0,0,0.45);
            /* Short screens: the panel scrolls rather than trapping links off
               the bottom of a 568px-tall phone in landscape. */
            max-height: calc(100vh - 84px);
            overflow-y: auto;
            z-index: 50;
          }
          .mk-nav-group[data-open="true"] .mk-nav-link {
            padding: 9px 12px; border-radius: 8px; font-size: 13.5px;
          }
          .mk-nav-group[data-open="true"] .mk-nav-link:hover { background: var(--mk-panel); }
        }
      `}</style>
    </header>
  );
}

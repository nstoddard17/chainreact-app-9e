import Link from "next/link";

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
 */
export function MarketingHeader() {
  return (
    <header className="mk-nav" aria-label="Site">
      <div className="mk-nav-inner">
        <Link
          href="/"
          className="mk-nav-brand"
          data-testid="marketing-nav-brand"
          aria-label="ChainReact home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chainreact-mark.png"
            alt=""
            width={28}
            height={28}
            className="mk-brand-mark"
            aria-hidden
          />
          <span className="mk-brand-text">ChainReact</span>
        </Link>

        <nav className="mk-nav-links" aria-label="Primary">
          <a href="#how-it-works" className="mk-nav-link">
            How it works
          </a>
          <a href="#examples" className="mk-nav-link">
            Examples
          </a>
          <a href="#apps" className="mk-nav-link">
            Apps
          </a>
          <a href="#what-you-get" className="mk-nav-link">
            Why ChainReact
          </a>
        </nav>

        <div className="mk-nav-cta">
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
          padding: 12px 24px;
        }
        .mk-nav-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--mk-text); }
        .mk-brand-mark { display: block; width: 28px; height: 28px; object-fit: contain; }
        .mk-brand-text { font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }

        .mk-nav-links { display: flex; align-items: center; gap: 4px; }
        .mk-nav-link {
          padding: 6px 12px;
          font-size: 13px;
          color: var(--mk-text-2);
          border-radius: 999px;
          transition: color .15s ease, opacity .15s ease;
        }
        .mk-nav-link:hover { color: var(--mk-text); opacity: 0.95; }

        .mk-nav-cta { display: flex; align-items: center; gap: 8px; }
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

        @media (max-width: 960px) { .mk-nav-links { display: none; } }
      `}</style>
    </header>
  );
}

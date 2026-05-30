import Link from "next/link";

/**
 * Final CTA block (Slice 4.HOMEPAGE-V2-1).
 *
 * Static. The "Start building" link funnels signed-out visitors to
 * `/auth/sign-up`; signed-in users never reach this surface because the
 * server page redirects them to `/workflows`.
 */
export function MarketingFinalCta() {
  return (
    <section
      className="mk-cta2"
      aria-labelledby="mk-cta2-h"
      data-testid="marketing-final-cta"
    >
      <div className="mk-cta2-inner">
        <h2 id="mk-cta2-h" className="mk-cta2-h">
          <span>Let's get your evenings</span>
          <span className="mk-cta2-it">back.</span>
        </h2>
        <Link
          href="/auth/sign-up"
          className="mk-cta"
          data-testid="marketing-final-cta-link"
        >
          Start building <span aria-hidden>→</span>
        </Link>
      </div>
      <style>{`
        .mk-cta2 {
          padding: 160px 0;
          border-top: 1px solid var(--mk-border);
          text-align: center;
        }
        .mk-cta2-inner {
          max-width: 1320px; margin: 0 auto; padding: 0 32px;
          display: flex; flex-direction: column; align-items: center;
          gap: 40px;
        }
        .mk-cta2-h {
          font-size: clamp(48px, 7vw, 110px);
          line-height: 0.98;
          letter-spacing: -0.035em;
          font-weight: 600;
          margin: 0;
          display: flex; flex-direction: column;
          color: var(--mk-text);
        }
        .mk-cta2-h span { display: block; }
        .mk-cta2-it { font-style: italic; font-family: Georgia, serif; font-weight: 500; }
        .mk-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 16px 24px;
          background: var(--mk-text); color: var(--mk-bg);
          font-size: 15px; font-weight: 500;
          border-radius: 999px;
          transition: filter .15s ease, transform .15s ease;
        }
        .mk-cta:hover { filter: brightness(1.05); transform: translateY(-1px); }
      `}</style>
    </section>
  );
}

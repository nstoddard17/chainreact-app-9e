/**
 * "Our promise" editorial paragraph (Slice 4.HOMEPAGE-V2-1).
 *
 * Static server component — no client behavior, no data, no claims tied
 * to a named customer. Pure marketing copy from the design.
 */
export function MarketingMission() {
  return (
    <section
      className="mk-ms"
      id="how-it-works"
      aria-labelledby="mk-ms-eyebrow"
      data-testid="marketing-mission"
    >
      <div className="mk-ms-inner">
        <div id="mk-ms-eyebrow" className="mk-ms-eyebrow">Our promise</div>
        <p className="mk-ms-body">
          Most automation tools were built for engineers. ChainReact wasn't.
          We make the kind of automation that disappears into your day —
          quietly running invoices, replies, follow-ups, and tracking — so
          the work that needs your judgment gets it, and the work that
          doesn't, doesn't.
        </p>
      </div>
      <style>{`
        .mk-ms { padding: 100px 0; border-top: 1px solid var(--mk-border); }
        .mk-ms-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
        .mk-ms-eyebrow { font-size: 13px; color: var(--mk-muted); margin-bottom: 36px; }
        .mk-ms-body {
          font-size: clamp(24px, 2.8vw, 38px);
          line-height: 1.35;
          letter-spacing: -0.018em;
          font-weight: 400;
          color: var(--mk-text);
          max-width: 1080px;
          margin: 0;
        }
      `}</style>
    </section>
  );
}

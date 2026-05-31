"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "By the numbers" band (Slice 4.HOMEPAGE-V5-1).
 *
 * The design's v5 `StatsTestimonial` is a NAMED-customer quote ("Maria
 * Reyes · Rey's Plumbing & Heating") plus customer-attributed metrics
 * ("18 hrs saved every month", "$3,200 recovered in Q2"). Both are
 * fabricated and were already omitted from the v2 homepage per the
 * project honesty rule (Slice 4.HOMEPAGE-V2-1).
 *
 * Per the locked decision ("keep honesty rule, neutralize"), we KEEP the
 * section's count-up cinematic but rebuild it as a NON-ATTRIBUTED band over
 * facts that are structurally true and already stated elsewhere on the page
 * — never a customer outcome we can't back:
 *   - "0 lines of code to write"  (it's a no-code product)
 *   - "1 click to connect each app" (matches the FeatureRows copy
 *      "with one click to connect each account")
 *   - "24/7 running quietly in the background" (automations run server-side;
 *      rendered as text, not a count-up)
 * No person, no revenue figure, no hours-saved claim.
 */
function CountUp({
  to,
  durationMs = 1400,
}: {
  to: number;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      if (started.current) return;
      started.current = true;
      if (reduced) {
        setN(to);
        return;
      }
      const t0 = performance.now();
      const ease = (x: number) => 1 - Math.pow(1 - x, 3);
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / durationMs);
        setN(Math.round(to * ease(k)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === "undefined") {
      run();
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (run(), io.disconnect())),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, durationMs]);

  return <span ref={ref}>{n}</span>;
}

export function MarketingStatsBand() {
  return (
    <section className="mk-stx" aria-labelledby="mk-stx-h" data-testid="marketing-stats-band">
      <div className="mk-stx-inner">
        <div className="mk-stx-eyebrow">By the numbers</div>
        <h2 id="mk-stx-h" className="mk-stx-h">
          Powerful enough to run your business. Simple enough that you never see the machinery.
        </h2>

        <div className="mk-stx-stats">
          <div className="mk-stx-stat">
            <div className="mk-stx-stat-v"><CountUp to={0} /></div>
            <div className="mk-stx-stat-k">lines of code to write</div>
          </div>
          <div className="mk-stx-stat">
            <div className="mk-stx-stat-v"><CountUp to={1} /></div>
            <div className="mk-stx-stat-k">click to connect each app</div>
          </div>
          <div className="mk-stx-stat">
            <div className="mk-stx-stat-v">24/7</div>
            <div className="mk-stx-stat-k">running quietly in the background</div>
          </div>
        </div>
      </div>
      <style>{`
        .mk-stx { padding: 130px 0; border-top: 1px solid var(--mk-border); }
        .mk-stx-inner { max-width: 1080px; margin: 0 auto; padding: 0 32px; }
        .mk-stx-eyebrow { font-family: Georgia, serif; font-style: italic; font-size: 19px; color: var(--mk-muted); letter-spacing: 0.04em; margin-bottom: 36px; }
        .mk-stx-h {
          font-size: clamp(26px, 3vw, 44px); line-height: 1.3; letter-spacing: -0.02em; font-weight: 400;
          color: var(--mk-text); margin: 0 0 64px; max-width: 960px;
          padding-bottom: 64px; border-bottom: 1px solid var(--mk-border);
        }
        .mk-stx-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
        @media (max-width: 820px) { .mk-stx-stats { grid-template-columns: 1fr; gap: 36px; } }
        .mk-stx-stat-v { font-size: clamp(52px, 6.5vw, 92px); font-weight: 500; letter-spacing: -0.035em; line-height: 0.95; color: var(--mk-text); margin-bottom: 16px; font-variant-numeric: tabular-nums; }
        .mk-stx-stat-k { font-size: 14.5px; color: var(--mk-muted); line-height: 1.45; max-width: 260px; }
      `}</style>
    </section>
  );
}

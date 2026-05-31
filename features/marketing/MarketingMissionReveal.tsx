"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * "Our promise" — scroll-linked word-fill paragraph (Slice 4.HOMEPAGE-V5-1).
 *
 * Replaces the static MarketingMission with the design's v5 `MissionReveal`:
 * the paragraph sits dim and lights up word-by-word to full contrast as it
 * scrolls through the viewport, driven by a CSS var (`--reveal`) so there
 * are no React re-renders. Copy is unchanged from the v2 Mission — pure
 * marketing language, no claims tied to a named customer.
 *
 * `prefers-reduced-motion` (global query in globals.css) plus the in-CSS
 * fallback render every word at full contrast.
 */
const MISSION_TEXT =
  "Most automation tools were built for engineers. ChainReact wasn't. " +
  "We make the kind of automation that disappears into your day — quietly running " +
  "invoices, replies, follow-ups and tracking — so the work that needs your judgment " +
  "gets it, and the work that doesn't, doesn't.";
const MISSION_WORDS = MISSION_TEXT.split(" ");

export function MarketingMissionReveal() {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh * 0.82 - rect.top) / (rect.height + vh * 0.28)));
      el.style.setProperty("--reveal", (p * (MISSION_WORDS.length + 5)).toFixed(2));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="mk-mr" aria-labelledby="mk-mr-eyebrow" data-testid="marketing-mission">
      <div className="mk-mr-inner">
        <div id="mk-mr-eyebrow" className="mk-mr-eyebrow">Our promise</div>
        <p className="mk-mr-body" ref={ref}>
          {MISSION_WORDS.map((w, i) => (
            <span key={`${w}-${i}`} className="mk-mr-w" style={{ ["--i" as string]: i } as CSSProperties}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
      <style>{`
        .mk-mr { padding: 130px 0; border-top: 1px solid var(--mk-border); }
        .mk-mr-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
        .mk-mr-eyebrow { font-size: 13px; color: var(--mk-muted); margin-bottom: 40px; }
        .mk-mr-body {
          font-size: clamp(26px, 3.1vw, 44px); line-height: 1.32; letter-spacing: -0.02em;
          font-weight: 400; max-width: 1120px; margin: 0;
          --reveal: 0;
        }
        .mk-mr-w {
          --lit: clamp(0, calc(var(--reveal) - var(--i)), 1);
          color: color-mix(in oklab, var(--mk-text) calc(var(--lit) * 100%), color-mix(in oklab, var(--mk-muted) 42%, transparent));
        }
        @media (prefers-reduced-motion: reduce) {
          .mk-mr-w { color: var(--mk-text); }
        }
      `}</style>
    </section>
  );
}

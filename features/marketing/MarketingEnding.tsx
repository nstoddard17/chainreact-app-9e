"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MarketingHeroMotion } from "./MarketingHeroMotion";

/**
 * Immersive ending — wordmark → CTA → woven footer (Slice 4.HOMEPAGE-V5-1).
 *
 * Replaces the separate FinalCta + Footer with the design's v5 `HomeEnding`:
 * one pinned, layered crossfade. Layers bottom→top: motion field → veil →
 * CTA (revealed from underneath) → "ChainReact" wordmark (dissolves on top).
 * After the pin releases, the footer flows on the same motion scene.
 *
 * CRITICAL: no `overflow:hidden` on any ancestor of `.mk-end-stage` — an
 * ancestor with overflow:hidden becomes the sticky scope and silently
 * breaks the pin. Clipping is isolated to the sibling `.mk-end-bg` layer.
 *
 * Honesty (carried from Slice 4.HOMEPAGE-V2-1 footer): NO newsletter signup
 * (no list backend) and NO "real humans · under 2 hours" support claim.
 * Footer columns + links match the v2 footer exactly (Product / Get started
 * / Legal). The CTA hint repeats only the existing free-plan claim.
 */
const NAV_COLS: ReadonlyArray<{
  h: string;
  links: ReadonlyArray<{ label: string; href: string; internal?: boolean }>;
}> = [
  {
    h: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Examples", href: "#examples" },
      { label: "Apps", href: "/apps", internal: true },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    h: "Get started",
    links: [
      { label: "Try it free", href: "/auth/sign-up", internal: true },
      { label: "Sign in", href: "/auth/sign-in", internal: true },
      { label: "Help center", href: "#help" },
    ],
  },
  {
    h: "Legal",
    links: [
      { label: "Privacy", href: "/privacy", internal: true },
      { label: "Terms", href: "#terms" },
      { label: "Security", href: "/security", internal: true },
    ],
  },
];

export function MarketingEnding({ motionIntensity = 6 }: { motionIntensity?: number }) {
  const revealRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reveal = revealRef.current;
    const stage = stageRef.current;
    if (!reveal || !stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.style.setProperty("--p", "0.65");
      return;
    }
    let raf = 0;
    const tick = () => {
      raf = 0;
      const total = reveal.offsetHeight - window.innerHeight;
      const passed = Math.min(Math.max(-reveal.getBoundingClientRect().top, 0), Math.max(1, total));
      stage.style.setProperty("--p", (total > 0 ? passed / total : 0).toFixed(4));
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
    <section className="mk-end" data-testid="marketing-ending">
      <div className="mk-end-bg" aria-hidden>
        <MarketingHeroMotion intensity={motionIntensity} />
        <div className="mk-end-vignette" />
        <div className="mk-end-mark">ChainReact</div>
      </div>

      <div className="mk-end-reveal" ref={revealRef}>
        <div className="mk-end-stage" ref={stageRef}>
          <div className="mk-end-veil" aria-hidden />
          <div className="mk-end-cta">
            <div className="mk-end-eyebrow">Ready when you are</div>
            <h2 className="mk-end-h">
              <span>Let&apos;s get your evenings</span>
              <span className="mk-end-it">back.</span>
            </h2>
            <Link className="mk-cta" href="/auth/sign-up" data-testid="marketing-final-cta-link">
              Start building <span aria-hidden>→</span>
            </Link>
            <div className="mk-end-hint">No credit card · the free plan covers most small businesses</div>
          </div>
          <div className="mk-end-brand" aria-hidden>ChainReact</div>
        </div>
      </div>

      <footer className="mk-end-foot" aria-label="Site footer" data-testid="marketing-footer">
        <div className="mk-end-foot-grid">
          <div className="mk-end-bcol">
            <div className="mk-end-brand-h">
              <span className="mk-end-mark-svg" aria-hidden>
                <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
                  <rect x="8" y="19" width="37" height="37" rx="13" stroke="var(--logo-brand, #38bdf8)" strokeWidth="7.5" />
                  <circle cx="51.5" cy="12.5" r="6.5" fill="var(--logo-brand, #38bdf8)" />
                </svg>
              </span>
              <span className="mk-end-brand-name">ChainReact</span>
            </div>
            <p className="mk-end-tag">
              The friendly way to automate the busywork. Built for small businesses who&apos;d rather be doing
              literally anything else.
            </p>
          </div>

          {NAV_COLS.map((c) => (
            <nav className="mk-end-col" key={c.h} aria-label={c.h}>
              <div className="mk-end-col-h">{c.h}</div>
              <ul>
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.internal ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mk-end-bottom">
          <span>© 2026 ChainReact, Inc.</span>
        </div>
      </footer>

      <style>{`
        .mk-end { position: relative; isolation: isolate; }
        .mk-end-bg { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .mk-end-vignette { position: absolute; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(120% 70% at 50% 35%, transparent 42%, color-mix(in oklab, var(--mk-bg) 72%, #000) 100%); }
        [data-marketing-theme="light"] .mk-end-vignette { background: radial-gradient(120% 70% at 50% 35%, transparent 58%, color-mix(in oklab, var(--mk-bg) 82%, #000 6%) 100%); }
        .mk-end-mark {
          position: absolute; bottom: -3%; left: 0; right: 0; z-index: 0;
          font-size: clamp(120px, 18vw, 280px); font-weight: 800; line-height: 1;
          text-align: center; letter-spacing: -0.05em; user-select: none; pointer-events: none;
          color: color-mix(in oklab, var(--mk-text) 5%, transparent);
        }

        .mk-end-reveal { position: relative; z-index: 1; height: 260vh; }
        .mk-end-stage {
          position: sticky; top: 0; height: 100vh; overflow: hidden;
          --p: 0;
          --bin:  clamp(0, calc((var(--p) - 0.05) / 0.20), 1);
          --bout: clamp(0, calc((0.56 - var(--p)) / 0.16), 1);
          --brand: calc(var(--bin) * var(--bout));
          --reveal: clamp(0, calc((var(--p) - 0.42) / 0.22), 1);
        }
        .mk-end-veil { position: absolute; inset: 0; z-index: 1; background: var(--mk-bg); opacity: calc(1 - var(--reveal)); }

        .mk-end-cta {
          position: absolute; inset: 0; z-index: 2;
          display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 32px;
          padding: 0 32px;
          opacity: var(--reveal);
          transform: scale(calc(1.05 - var(--reveal) * 0.05));
        }
        .mk-end-eyebrow { font-family: var(--font-mono); font-size: 12.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mk-muted); }
        .mk-end-h { font-size: clamp(48px, 7.5vw, 120px); line-height: 0.96; letter-spacing: -0.035em; font-weight: 600; margin: 0; display: flex; flex-direction: column; color: var(--mk-text); }
        .mk-end-h span { display: block; }
        .mk-end-it { font-style: italic; font-family: Georgia, serif; font-weight: 500; }
        .mk-end-hint { font-size: 13.5px; color: var(--mk-muted); }
        .mk-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 16px 24px;
          background: var(--mk-text); color: var(--mk-bg);
          font-size: 15px; font-weight: 500; border-radius: 999px;
          transition: filter .15s ease, transform .15s ease;
        }
        .mk-cta:hover { filter: brightness(1.05); transform: translateY(-1px); }

        .mk-end-brand {
          position: absolute; inset: 0; z-index: 3;
          display: flex; align-items: center; justify-content: center; padding: 0 24px;
          font-size: clamp(64px, 16vw, 280px); font-weight: 800; letter-spacing: -0.045em; line-height: 0.86;
          color: var(--mk-text); white-space: nowrap; text-align: center;
          opacity: var(--brand);
          transform: scale(calc(0.94 + var(--bin) * 0.06 + (1 - var(--bout)) * 0.14));
          filter: blur(calc((1 - var(--bin)) * 16px + (1 - var(--bout)) * 12px));
          pointer-events: none;
        }

        .mk-end-foot { position: relative; z-index: 1; max-width: 1320px; margin: 0 auto; padding: 24px 32px 48px; }
        .mk-end-foot-grid { display: grid; grid-template-columns: 1.7fr repeat(3, 1fr); gap: 36px; padding-bottom: 44px; border-bottom: 1px solid color-mix(in oklab, var(--mk-text) 12%, transparent); }
        @media (max-width: 980px) { .mk-end-foot-grid { grid-template-columns: 1fr 1fr; gap: 32px; } }
        .mk-end-brand-h { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .mk-end-mark-svg { display: inline-flex; flex: none; }
        .mk-end-mark-svg svg { display: block; overflow: visible; }
        .mk-end-brand-name { font-weight: 700; font-size: 17px; color: var(--mk-text); }
        .mk-end-tag { font-size: 13.5px; color: var(--mk-muted); max-width: 340px; margin: 0; line-height: 1.55; }
        .mk-end-col-h { font-family: var(--font-mono); font-size: 10.5px; color: var(--mk-text); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; }
        .mk-end-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
        .mk-end-col a { font-size: 13.5px; color: var(--mk-muted); transition: color .12s ease; }
        .mk-end-col a:hover { color: var(--mk-text); }
        .mk-end-bottom { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-top: 28px; flex-wrap: wrap; }
        .mk-end-bottom span { font-size: 12px; color: var(--mk-muted); }

        @media (prefers-reduced-motion: reduce) {
          .mk-end-reveal { height: auto; }
          .mk-end-stage { position: relative; height: auto; padding: 120px 0; }
          .mk-end-veil { display: none; }
          .mk-end-cta { position: relative; opacity: 1; transform: none; }
          .mk-end-brand { display: none; }
        }
      `}</style>
    </section>
  );
}

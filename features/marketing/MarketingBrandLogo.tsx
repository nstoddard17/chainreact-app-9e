"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";

/**
 * The ChainReact "Spark Link" brand mark, animated with GSAP.
 *
 * Mark : a rounded link/node (squircle outline) emitting a detached "spark"
 *        dot — the reaction. Pure inline SVG, recolors via `--logo-brand`,
 *        crisp at any size (designed to read down to 16px).
 * Word : "Chain" in ink + a brand "ı" carrying the spark dot + "n" in ink +
 *        "React" in brand. The i's dot echoes the mark's spark.
 *
 * Entrance : the square settles, rocks right to "knock loose" the spark, the
 *   spark laps the square's outline at a constant gap, then bounces home into
 *   its corner — in sync with the wordmark "i" dot — and both bloom a soft glow.
 * Idle     : gentle float + breathing glow.
 * Hover    : replays the spring + spark lap. Respects `prefers-reduced-motion`.
 *
 * Single sky-blue brand color, no gradient (replaces the earlier blue→purple
 * PNG mark). `--logo-brand` is `#0284c7` on light surfaces / `#38bdf8` on dark
 * (set in `app/globals.css`); the wordmark ink inherits `currentColor` from its
 * context (e.g. `--mk-text` on marketing, `--foreground` in the app shell).
 *
 * Used in three spots, all preserving this prop API:
 *   - nav   (size 28 / fontSize 20) — `MarketingHeader`
 *   - hero  (size 66 / fontSize 40) — `MarketingHero` centered showpiece
 *   - rail  (size 26, wordmark off) — `AppBrand`
 *
 * Decorative glow layer is `aria-hidden`; the wordmark is split into per-letter
 * spans for the stagger, so the root carries the `aria-label` for screen readers.
 * The static (no-JS / reduced-motion) state already renders the finished logo.
 */
interface Props {
  size?: number;
  fontSize?: number;
  wordmark?: boolean;
  symbol?: boolean;
  idle?: boolean;
  hover?: boolean;
  variant?: "nav" | "hero";
  className?: string;
}

export function MarketingBrandLogo({
  size = 30,
  fontSize,
  wordmark = true,
  symbol = true,
  idle = true,
  hover = true,
  variant = "nav",
  className = "",
}: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const fs = fontSize ?? Math.round(size * 0.92);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mark = root.querySelector<SVGSVGElement>(".al-img");
    const sq = root.querySelector<SVGGElement>(".al-sq");
    const orbit = root.querySelector<SVGGElement>(".al-orbit");
    const glow = root.querySelector<HTMLElement>(".al-glow");
    const spark = root.querySelector<SVGCircleElement>(".al-spark");
    const sparkW = root.querySelector<HTMLElement>(".al-spark-dot");
    const chars = root.querySelectorAll<HTMLElement>(".al-ch");

    let hoverFn: (() => void) | undefined;
    let guide: SVGPathElement | null = null;

    // Hidden guide path that traces the square's rounded-rect outline at an even
    // OFFSET (a clear gap, not hugging the edge). `off` is sized so the path's
    // top-right corner lands exactly on the dot's home spot (51.5, 12.5).
    let glen = 0;
    let ldock = 0;
    if (mark) {
      const NS2 = "http://www.w3.org/2000/svg";
      const off = 14.5;
      const gx = 8 - off;
      const gy = 19 - off;
      const gsz = 37 + off * 2;
      const gr = 13 + off;
      const d = `M ${gx + gr} ${gy} H ${gx + gsz - gr} A ${gr} ${gr} 0 0 1 ${gx + gsz} ${gy + gr} V ${gy + gsz - gr} A ${gr} ${gr} 0 0 1 ${gx + gsz - gr} ${gy + gsz} H ${gx + gr} A ${gr} ${gr} 0 0 1 ${gx} ${gy + gsz - gr} V ${gy + gr} A ${gr} ${gr} 0 0 1 ${gx + gr} ${gy} Z`;
      guide = document.createElementNS(NS2, "path");
      guide.setAttribute("d", d);
      guide.setAttribute("fill", "none");
      guide.setAttribute("stroke", "none");
      mark.appendChild(guide);
      // jsdom (tests) and other non-rendering environments don't implement the
      // SVG geometry methods. Drop the guide if they're missing so `rollIn`
      // skips the orbit and the static mark still renders — never throw.
      if (typeof guide.getTotalLength === "function") {
        glen = guide.getTotalLength();
        // start/end the lap at the path point nearest the home spot
        let best = Infinity;
        for (let i = 0; i <= 240; i++) {
          const L = (i / 240) * glen;
          const p = guide.getPointAtLength(L);
          const dd = (p.x - 51.5) ** 2 + (p.y - 12.5) ** 2;
          if (dd < best) {
            best = dd;
            ldock = L;
          }
        }
      } else {
        if (guide.parentNode) guide.parentNode.removeChild(guide);
        guide = null;
      }
    }

    // Sequence: the square is present and ROCKS to the right to "hit" the dot.
    // The dot (resting at its home corner) is knocked loose, travels around the
    // square's outline at a constant gap, then a little bounce home.
    const rollIn = (tl: gsap.core.Timeline, at: number) => {
      if (!sq || !spark || !guide) return;
      // square settles in place (no spin); dot waits at its home corner
      tl.fromTo(sq, { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" }, at);
      tl.set(spark, { opacity: 1, scale: 1, x: 0, y: 0 }, at);
      // square rocks to the RIGHT and knocks the dot loose, then springs back
      tl.to(sq, { rotation: 14, duration: 0.2, ease: "power2.in" }, at + 0.4);
      tl.to(sq, { rotation: 0, duration: 0.85, ease: "elastic.out(1, 0.4)" }, at + 0.6);
      // the hit launches the dot once around the square's outline (constant gap)
      const roll = { u: 0 };
      const place = () => {
        const L = (ldock + roll.u * glen) % glen;
        const p = guide!.getPointAtLength(L);
        gsap.set(spark, { x: p.x - 51.5, y: p.y - 12.5 });
      };
      tl.to(roll, { u: 1, duration: 0.92, ease: "power1.inOut", onUpdate: place }, at + 0.6);
      // …then pops a touch past home and BOUNCES into its final corner.
      tl.to(spark, { x: 7, y: -7, duration: 0.12, ease: "power2.out" }, at + 1.52);
      tl.to(spark, { x: 0, y: 0, duration: 0.66, ease: "bounce.out" }, at + 1.64);
      // the wordmark's "i" dot jumps + bounce-lands in sync with the mark dot
      if (sparkW) {
        tl.to(sparkW, { y: -12, duration: 0.16, ease: "power2.out" }, at + 1.52);
        tl.to(sparkW, { y: 0, duration: 0.66, ease: "bounce.out" }, at + 1.64);
      }
      // …and as they land together, both dots bloom a soft glow that fades slowly
      const c = (getComputedStyle(mark!).getPropertyValue("--logo-brand") || "#38bdf8").trim();
      tl.fromTo(
        spark,
        { filter: "drop-shadow(0 0 0px transparent)" },
        { filter: `drop-shadow(0 0 13px ${c})`, duration: 0.3, ease: "power2.out" },
        at + 2.24,
      );
      tl.to(spark, { filter: `drop-shadow(0 0 0px ${c})`, duration: 1.5, ease: "power2.out" }, at + 2.54);
      if (sparkW) {
        tl.fromTo(
          sparkW,
          { boxShadow: `0 0 3px 0px ${c}` },
          { boxShadow: `0 0 15px 4px ${c}`, duration: 0.3, ease: "power2.out" },
          at + 2.24,
        );
        tl.to(sparkW, { boxShadow: `0 0 4px 0px ${c}`, duration: 1.5, ease: "power2.out" }, at + 2.54);
      }
    };

    const ctx = gsap.context(() => {
      if (reduce) {
        if (mark) {
          gsap.set([mark, glow], { opacity: 1, scale: 1, rotation: 0, y: 0 });
          gsap.set([sq, orbit, spark], { rotation: 0, scale: 1, x: 0, y: 0, opacity: 1 });
        }
        gsap.set(chars, { opacity: 1, y: 0, rotateX: 0 });
        return;
      }

      const tl = gsap.timeline({ delay: variant === "hero" ? 0.2 : 0.05 });
      if (mark) {
        gsap.set(mark, { opacity: 1 });
        gsap.set(glow, { opacity: 0, scale: 0.4 });
        gsap.set(spark, { opacity: 1, x: 0, y: 0 });
        rollIn(tl, 0);
        tl.to(glow, { opacity: 0.38, scale: 1, duration: 0.8, ease: "power2.out" }, 0.1);
      }
      if (chars.length) {
        tl.from(
          chars,
          { opacity: 0, y: "0.55em", rotateX: -55, stagger: 0.035, duration: 0.55, ease: "back.out(2)" },
          mark ? 0.55 : 0,
        );
      }

      if (idle && mark) {
        gsap.to(mark, { y: "-=4", duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.6 });
        gsap.to(glow, { opacity: 0.2, scale: 1.12, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.6 });
      }
    }, root);

    if (hover && !reduce && mark) {
      let busy = false;
      hoverFn = () => {
        if (busy) return;
        busy = true;
        const htl = gsap.timeline({ onComplete: () => { busy = false; } });
        rollIn(htl, 0);
      };
      root.addEventListener("mouseenter", hoverFn);
    }

    return () => {
      ctx.revert();
      if (hoverFn) root.removeEventListener("mouseenter", hoverFn);
      if (guide && guide.parentNode) guide.parentNode.removeChild(guide);
    };
  }, [idle, hover, variant]);

  return (
    <span
      ref={rootRef}
      className={"al al-" + variant + " " + className}
      style={{ "--al-size": size + "px", "--al-fs": fs + "px" } as CSSProperties}
      aria-label="ChainReact"
    >
      {symbol && (
        <span className="al-mark">
          <span className="al-glow" aria-hidden />
          <svg className="al-img" viewBox="0 0 64 64" fill="none" role="img" aria-label="ChainReact">
            <g className="al-sq">
              <rect x="8" y="19" width="37" height="37" rx="13" stroke="var(--logo-brand, #0284c7)" strokeWidth="7.5" />
            </g>
            <g className="al-orbit">
              <circle className="al-spark" cx="51.5" cy="12.5" r="6.5" fill="var(--logo-brand, #0284c7)" />
            </g>
          </svg>
        </span>
      )}
      {wordmark && (
        <span className="al-word" aria-hidden>
          <span className="al-ch">C</span>
          <span className="al-ch">h</span>
          <span className="al-ch">a</span>
          <span className="al-ch al-i">
            <span className="al-spark-dot" aria-hidden />ı
          </span>
          <span className="al-ch">n</span>
          <span className="al-ch al-rx">R</span>
          <span className="al-ch al-rx">e</span>
          <span className="al-ch al-rx">a</span>
          <span className="al-ch al-rx">c</span>
          <span className="al-ch al-rx">t</span>
        </span>
      )}
      <style>{`
        .al {
          --logo-ink: currentColor;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          display: inline-flex; align-items: center; gap: 0.36em; line-height: 1;
        }
        .al-mark { position: relative; display: inline-block; width: var(--al-size); height: var(--al-size); flex-shrink: 0; }
        .al-img { display: block; width: 100%; height: 100%; position: relative; z-index: 1; overflow: visible; will-change: transform; }
        .al-sq { transform-box: fill-box; transform-origin: center; }
        .al-orbit { transform-box: view-box; transform-origin: 26.5px 37.5px; }
        .al-spark { transform-box: fill-box; transform-origin: center; will-change: transform, opacity; }
        .al-glow {
          position: absolute; inset: -32%; z-index: 0; pointer-events: none;
          background: radial-gradient(circle at 56% 40%, color-mix(in oklab, var(--logo-brand, #0284c7) 62%, transparent), transparent 62%);
          filter: blur(calc(var(--al-size) * 0.24));
          will-change: transform, opacity;
        }
        .al-word {
          font-weight: 600; font-size: var(--al-fs); letter-spacing: -0.03em;
          color: var(--logo-ink); white-space: nowrap; perspective: 600px;
        }
        .al-ch { display: inline-block; transform-origin: 50% 100%; will-change: transform, opacity; }
        .al-rx { color: var(--logo-brand, #0284c7); }
        .al-i {
          position: relative; color: var(--logo-brand, #0284c7);
          font-style: normal; /* dotless i carries its own spark dot */
        }
        .al-spark-dot {
          position: absolute; left: 50%; top: -0.04em; margin-left: -0.1em;
          width: 0.2em; height: 0.2em; border-radius: 50%;
          background: var(--logo-brand, #0284c7);
          box-shadow: 0 0 0.32em color-mix(in oklab, var(--logo-brand, #0284c7) 75%, transparent);
          will-change: transform, box-shadow;
        }
      `}</style>
    </span>
  );
}

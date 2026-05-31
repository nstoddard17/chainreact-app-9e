"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";

/**
 * Animated ChainReact logo (Slice 4.HOMEPAGE-V5-2).
 *
 * Ported from the design's `AnimatedLogo`. The mark springs in, a soft glow
 * blooms, a light "sheen" sweeps across the logo silhouette, and the wordmark
 * letters stagger up — then it gently idles (float + breathing glow + periodic
 * sheen). Hover replays a quick spring + sheen.
 *
 * Used in two spots, matching the design v5:
 *   - nav   (size 28 / fontSize 20) — `MarketingHeader`
 *   - hero  (size 66 / fontSize 40) — `MarketingHero` centered showpiece
 *
 * GSAP-driven (the user chose "GSAP only, no opentype"). Marketing is dark-only,
 * so the wordmark inherits `--mk-text`. Respects `prefers-reduced-motion`
 * (renders the final static state, no motion). Decorative sheen/glow layers are
 * `aria-hidden`; the wordmark is split into per-letter spans for the stagger so
 * it carries an `aria-label` on the root for screen readers.
 */
const SYMBOL = "/chainreact-mark.png";
const LETTERS = "ChainReact".split("");

interface Props {
  size?: number;
  fontSize?: number;
  wordmark?: boolean;
  idle?: boolean;
  hover?: boolean;
  variant?: "nav" | "hero";
  className?: string;
}

export function MarketingBrandLogo({
  size = 30,
  fontSize,
  wordmark = true,
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
    const img = root.querySelector<HTMLElement>(".al-img");
    const glow = root.querySelector<HTMLElement>(".al-glow");
    const sheen = root.querySelector<HTMLElement>(".al-sheen");
    const chars = root.querySelectorAll<HTMLElement>(".al-ch");

    let hoverFn: (() => void) | undefined;

    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set([img, glow], { opacity: 1, scale: 1, rotation: 0, y: 0 });
        gsap.set(chars, { opacity: 1, y: 0, rotateX: 0 });
        gsap.set(sheen, { opacity: 0 });
        return;
      }

      gsap.set(sheen, { backgroundPosition: "165% 0" });
      gsap.set(glow, { opacity: 0, scale: 0.4 });

      const tl = gsap.timeline({ delay: variant === "hero" ? 0.2 : 0.05 });
      tl.from(img, { opacity: 0, scale: 0.45, rotation: -20, y: 8, duration: 0.95, ease: "back.out(1.7)" })
        .to(glow, { opacity: 0.6, scale: 1, duration: 0.9, ease: "power2.out" }, "<0.1")
        .to(sheen, { backgroundPosition: "-65% 0", duration: 0.95, ease: "power2.inOut" }, "-=0.45");
      if (chars.length) {
        tl.from(
          chars,
          { opacity: 0, y: "0.55em", rotateX: -55, stagger: 0.035, duration: 0.55, ease: "back.out(2)" },
          "-=0.75",
        );
      }

      if (idle) {
        gsap.to(img, { y: "-=4", duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.2 });
        gsap.to(glow, { opacity: 0.32, scale: 1.14, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.2 });
        const sweep = () => {
          gsap.fromTo(
            sheen,
            { backgroundPosition: "165% 0" },
            {
              backgroundPosition: "-65% 0",
              duration: 1.15,
              ease: "power2.inOut",
              onComplete: () => {
                gsap.delayedCall(4.2, sweep);
              },
            },
          );
        };
        gsap.delayedCall(3.6, sweep);
      }
    }, root);

    if (hover && !reduce) {
      hoverFn = () => {
        gsap.fromTo(
          img,
          { rotation: -7, scale: 0.93 },
          { rotation: 0, scale: 1, duration: 0.8, ease: "elastic.out(1, 0.5)", overwrite: "auto" },
        );
        gsap.fromTo(
          sheen,
          { backgroundPosition: "165% 0" },
          { backgroundPosition: "-65% 0", duration: 0.85, ease: "power2.inOut", overwrite: "auto" },
        );
      };
      root.addEventListener("mouseenter", hoverFn);
    }

    return () => {
      ctx.revert();
      if (hoverFn) root.removeEventListener("mouseenter", hoverFn);
    };
  }, [idle, hover, variant]);

  return (
    <span
      ref={rootRef}
      className={"al al-" + variant + " " + className}
      style={{ "--al-size": size + "px", "--al-fs": fs + "px" } as CSSProperties}
      aria-label="ChainReact"
    >
      <span className="al-mark">
        <span className="al-glow" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="al-img" src={SYMBOL} alt="" draggable={false} aria-hidden />
        <span
          className="al-sheen"
          aria-hidden
          style={{ WebkitMaskImage: `url(${SYMBOL})`, maskImage: `url(${SYMBOL})` }}
        />
      </span>
      {wordmark && (
        <span className="al-word" aria-hidden>
          {LETTERS.map((c, i) => (
            <span className="al-ch" key={i}>
              {c}
            </span>
          ))}
        </span>
      )}
      <style>{`
        .al { display: inline-flex; align-items: center; gap: 0.34em; line-height: 1; }
        .al-mark { position: relative; display: inline-block; width: var(--al-size); height: var(--al-size); flex-shrink: 0; }
        .al-img { display: block; width: 100%; height: 100%; object-fit: contain; position: relative; z-index: 1; will-change: transform; }
        .al-glow {
          position: absolute; inset: -45%; z-index: 0; pointer-events: none;
          background: radial-gradient(circle at 42% 42%, rgba(79,124,255,0.75), transparent 62%),
                      radial-gradient(circle at 64% 70%, rgba(168,85,247,0.65), transparent 64%);
          filter: blur(calc(var(--al-size) * 0.34));
          will-change: transform, opacity;
        }
        .al-sheen {
          position: absolute; inset: 0; z-index: 2; pointer-events: none;
          -webkit-mask-size: contain; mask-size: contain;
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
          -webkit-mask-position: center; mask-position: center;
          background-image: linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.92) 50%, transparent 62%);
          background-size: 250% 100%;
          background-repeat: no-repeat;
          background-position: 165% 0;
          mix-blend-mode: screen;
        }
        .al-word {
          font-weight: 700; font-size: var(--al-fs); letter-spacing: -0.022em;
          color: var(--mk-text); white-space: nowrap; perspective: 600px;
        }
        .al-ch { display: inline-block; transform-origin: 50% 100%; will-change: transform, opacity; }
      `}</style>
    </span>
  );
}

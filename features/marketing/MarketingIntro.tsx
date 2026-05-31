"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { CR_WORDMARK } from "./chainReactWordmark";

/**
 * Cinematic cold-open intro (Slice 4.HOMEPAGE-V5-2).
 *
 * Ported from the design's `IntroSequence` — a classic SVG stroke-draw logo
 * reveal:
 *   1. WARP — a short first-person rush through blue→purple light streaks
 *      (canvas), whose vanishing point steers onto where the "i" dot will land.
 *   2. The tunnel resolves into a single point of light — the dot of the "i".
 *   3. DRAW — "ChainReact" draws itself on, one stroke path per letter
 *      (stroke-dashoffset), staggering OUTWARD from the "i", then fills with the
 *      brand gradient as the spark hands off to the dot.
 *   4. LOCK — the real logo symbol pops in to complete the lockup + a bloom flash.
 *   5. OPEN — the lockup accelerates into the gap between "n" and "R" (we travel
 *      through), the dark veil lifts, and the homepage arrives from a slight zoom.
 *
 * Differences from the prototype (per the "GSAP only, no opentype" decision):
 *   - Glyph outlines are baked at build time (`chainReactWordmark.ts`) instead
 *     of fetched from a CDN font via opentype.js — no runtime font dependency,
 *     so the cold-open never falls back or stalls on a network fetch.
 *   - Targets `.marketing-root` (this app's page wrapper) where the design
 *     targeted `.home`.
 *
 * Plays once per browser session (sessionStorage) so it's a first-impression
 * moment, not a nag on every refresh/navigation. Skippable (click / Esc / the
 * Skip button). Fully skipped under `prefers-reduced-motion` (the page just
 * shows). Decorative — the overlay is `aria-hidden` and portaled to <body> so
 * no ancestor transform can break its fixed pinning.
 */
const PLAYED_KEY = "cr_intro_played_v1";
const SYMBOL = "/chainreact-mark.png";

type RGB = [number, number, number];

export function MarketingIntro() {
  const [playing, setPlaying] = useState(false);
  const decidedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finishedRef = useRef(false);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // Decide-and-mount before paint so there's no flash of the page first.
  useLayoutEffect(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(PLAYED_KEY) === "1";
    } catch {
      /* sessionStorage unavailable — treat as not-seen */
    }
    if (reduce || seen) return;
    try {
      sessionStorage.setItem(PLAYED_KEY, "1");
    } catch {
      /* ignore */
    }
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = "hidden";
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const NS = "http://www.w3.org/2000/svg";
    const stage = root.querySelector<HTMLElement>(".intro-stage")!;
    const spark = root.querySelector<HTMLElement>(".intro-spark")!;
    const svg = root.querySelector<SVGSVGElement>(".intro-trace")!;
    const strokesG = root.querySelector<SVGGElement>(".tr-strokes")!;
    const fillG = root.querySelector<SVGGElement>(".tr-fills")!;
    const symImg = root.querySelector<HTMLElement>(".intro-sym-img")!;
    const bloom = root.querySelector<HTMLElement>(".intro-bloom")!;
    const veil = root.querySelector<HTMLElement>(".intro-veil")!;
    const skip = root.querySelector<HTMLElement>(".intro-skip");
    const home = document.querySelector<HTMLElement>(".marketing-root");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- canvas warp ----------
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // No 2D context (jsdom under test, or an unsupported browser). The
      // intro is purely decorative motion — don't strand the user behind a
      // dead, scroll-locked overlay. Restore scroll and dismiss immediately
      // so the page shows. Mirrors MarketingHeroMotion's `if (!ctx) return`.
      document.documentElement.style.overflow = "";
      finishedRef.current = true;
      setPlaying(false);
      return;
    }
    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    const params = { speed: 0.006, sway: 1 };
    const fade = { v: 1 };
    // aim: the warp's vanishing point. Wanders at center (tx=null) until we know
    // where the "i" dot will land, then we steer onto it (c: 0→1).
    const aim: { tx: number | null; ty: number | null; c: number } = { tx: null, ty: null, c: 0 };
    const N = 720;
    const stars = Array.from({ length: N }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random() * 0.9 + 0.1,
    }));
    const BLUE: RGB = [120, 170, 255];
    const PURP: RGB = [180, 110, 250];
    const WHITE: RGB = [255, 255, 255];
    const mix = (a: RGB, b: RGB, t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(",");

    const resize = () => {
      W = root.clientWidth;
      H = root.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#04050a";
      ctx.fillRect(0, 0, W, H);
    };
    resize();
    window.addEventListener("resize", resize);

    let perf = 0;
    const drawWarp = () => {
      perf += 16;
      ctx.fillStyle = "rgba(4,5,10,0.32)";
      ctx.fillRect(0, 0, W, H);
      if (fade.v > 0.001) {
        ctx.globalCompositeOperation = "lighter";
        const proj = Math.min(W, H) * 0.92;
        const wx = W / 2 + Math.sin(perf * 0.0011) * W * 0.05 * params.sway;
        const wy = H / 2 + Math.cos(perf * 0.0014) * H * 0.05 * params.sway;
        let cx = wx;
        let cy = wy;
        if (aim.tx != null && aim.ty != null) {
          cx = wx + (aim.tx - wx) * aim.c;
          cy = wy + (aim.ty - wy) * aim.c;
        }
        for (const s of stars) {
          const z0 = s.z;
          s.z -= params.speed;
          if (s.z <= 0.02) {
            s.x = Math.random() * 2 - 1;
            s.y = Math.random() * 2 - 1;
            s.z = 1;
            continue;
          }
          const sx = cx + (s.x / s.z) * proj;
          const sy = cy + (s.y / s.z) * proj;
          const px = cx + (s.x / z0) * proj;
          const py = cy + (s.y / z0) * proj;
          const r = Math.hypot(sx - cx, sy - cy);
          const tcol = Math.min(1, r / (Math.min(W, H) * 0.55));
          const base = mix(BLUE, PURP, tcol);
          const near = Math.min(1, (1 - s.z) * 1.4);
          const col = mix(base.split(",").map(Number) as RGB, WHITE, near * 0.55);
          ctx.strokeStyle = `rgba(${col},${(0.5 + (1 - s.z) * 0.8) * fade.v})`;
          ctx.lineWidth = Math.max(0.8, (1 - s.z) * 4.2);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(drawWarp);
    };

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      setPlaying(false);
    };

    gsap.set(spark, { opacity: 0, scale: 0 });
    gsap.set(symImg, { opacity: 0 });
    gsap.set(fillG, { opacity: 0 });
    gsap.set(bloom, { opacity: 0, scale: 0.6 });
    gsap.set(stage, { scale: 1, opacity: 1, transformOrigin: "50% 50%" });
    gsap.set(svg, { opacity: 1 });

    drawWarp();

    const strokes = Array.from(strokesG.querySelectorAll("path"));
    strokes.forEach((p) => {
      const L = p.getTotalLength();
      p.style.strokeDasharray = String(L);
      p.style.strokeDashoffset = String(L);
    });

    // ---- locate the dot (tittle) of the "i" in screen space ----
    // The "i" path has two contours (stem + tittle); the tittle is topmost.
    const I_INDEX = CR_WORDMARK.iIndex;
    const measureIDot = () => {
      if (strokes.length <= I_INDEX) return null;
      const d = strokes[I_INDEX]!.getAttribute("d") || "";
      const subs = d.split(/(?=M)/i).filter((s) => s.trim());
      if (!subs.length) return null;
      const tmp = document.createElementNS(NS, "path");
      tmp.setAttribute("fill", "none");
      svg.appendChild(tmp);
      let dot: { x: number; y: number; w: number; h: number } | null = null;
      subs.forEach((sd) => {
        tmp.setAttribute("d", sd);
        let bb: DOMRect | undefined;
        try {
          bb = tmp.getBBox();
        } catch {
          return;
        }
        if (!bb || !bb.width) return;
        if (!dot || bb.y < dot.y) dot = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      });
      svg.removeChild(tmp);
      if (!dot) return null;
      const found: { x: number; y: number; w: number; h: number } = dot;
      const m = svg.getScreenCTM();
      if (!m) return null;
      const pt = svg.createSVGPoint();
      pt.x = found.x + found.w / 2;
      pt.y = found.y + found.h / 2;
      const sp = pt.matrixTransform(m);
      return { x: sp.x, y: sp.y, r: (found.w * Math.abs(m.a)) / 2 };
    };
    const idot = measureIDot();
    if (idot) {
      aim.tx = idot.x;
      aim.ty = idot.y;
      gsap.set(spark, { left: idot.x, top: idot.y, xPercent: -50, yPercent: -50, x: 0, y: 0 });
    }

    const buildReduced = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.fillStyle = "#04050a";
      ctx.fillRect(0, 0, W, H);
      strokes.forEach((p) => {
        p.style.strokeDashoffset = "0";
      });
      gsap.set(fillG, { opacity: 1 });
      const tl = gsap.timeline({ onComplete: finish });
      tl.to(symImg, { opacity: 1, duration: 0.01 })
        .fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power2.out" })
        .to(veil, { opacity: 0, duration: 0.6, delay: 0.7 });
      return tl;
    };

    const buildTrace = () => {
      const drawDur = 0.44;
      const stagger = 0.085;
      const drawStart = 2.0;
      const drawEnd = drawStart + drawDur + stagger * Math.max(0, strokes.length - 1);

      const tl = gsap.timeline({ onComplete: finish });
      // 1 — WARP: rush forward while the vanishing point steers onto the "i" dot
      tl.to(params, { speed: 0.085, duration: 1.2, ease: "power3.in" }, 0.0);
      tl.to(params, { sway: 0, duration: 1.0, ease: "power2.inOut" }, 0.5);
      if (idot) tl.to(aim, { c: 1, duration: 1.05, ease: "power2.inOut" }, 0.5);
      tl.to(params, { speed: 0.02, duration: 0.6, ease: "power2.out" }, 1.2);
      tl.to(fade, { v: 0, duration: 0.6, ease: "power1.in" }, 1.35);
      // the tunnel resolves into a single point of light — the dot of the "i"
      tl.fromTo(spark, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.42, ease: "back.out(1.6)" }, 1.5);
      tl.to(spark, { scale: 0.62, duration: 0.34, ease: "power2.out" }, 1.9);
      // 2 — DRAW: the rest of the wordmark trails outward FROM the "i"
      tl.to(
        strokes,
        { strokeDashoffset: 0, duration: drawDur, stagger: { each: stagger, from: I_INDEX }, ease: "power1.inOut" },
        drawStart,
      );
      // letters fill with the gradient as the draw completes; the dot fill takes over
      tl.to(fillG, { opacity: 1, duration: 0.7, ease: "power2.out" }, drawEnd - 0.25);
      tl.to(spark, { opacity: 0, scale: 0.42, duration: 0.5, ease: "power2.in" }, drawEnd - 0.18);
      // 3 — LOCK: the real symbol completes the lockup
      tl.to(symImg, { opacity: 1, duration: 0.55, ease: "back.out(1.5)" }, drawEnd + 0.05);
      tl.to(bloom, { opacity: 0.85, scale: 1.3, duration: 0.36, ease: "power2.out" }, drawEnd + 0.15);
      tl.to(bloom, { opacity: 0, scale: 1.7, duration: 0.6, ease: "power2.in" }, drawEnd + 0.5);
      // 4 — OPEN: travel THROUGH the gap between "n" and "R", then arrive on the page
      const openAt = drawEnd + 1.0;
      const zoomOrigin = () => {
        if (strokes.length > CR_WORDMARK.rIndex) {
          const a = strokes[CR_WORDMARK.nIndex]!.getBoundingClientRect(); // n
          const b = strokes[CR_WORDMARK.rIndex]!.getBoundingClientRect(); // R
          if (a.width && b.width) {
            return ((a.right + b.left) / 2).toFixed(1) + "px " + ((a.top + a.bottom) / 2).toFixed(1) + "px";
          }
        }
        return "50% 50%";
      };
      tl.call(
        () => {
          gsap.set(stage, { transformOrigin: zoomOrigin() });
        },
        undefined,
        openAt - 0.05,
      );
      tl.to(stage, { scale: 16, duration: 1.8, ease: "power2.in" }, openAt);
      tl.to(stage, { opacity: 0, duration: 0.55, ease: "power1.in" }, openAt + 1.3);
      tl.to(veil, { opacity: 0, duration: 0.9, ease: "power2.inOut" }, openAt + 1.0);
      if (home) {
        tl.fromTo(
          home,
          { opacity: 0, scale: 1.12 },
          { opacity: 1, scale: 1, duration: 1.1, ease: "power2.out", immediateRender: false },
          openAt + 1.0,
        );
      }
      return tl;
    };

    const tl = reduce ? buildReduced() : buildTrace();
    tlRef.current = tl;

    // ---------- skip controls ----------
    const doSkip = () => {
      const t = tlRef.current;
      if (finishedRef.current || !t) return;
      t.progress(0.93);
      gsap.delayedCall(0.001, () => t.progress(1));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doSkip();
    };
    const onSkipClick = (e: MouseEvent) => {
      e.stopPropagation();
      doSkip();
    };
    if (skip) skip.addEventListener("click", onSkipClick);
    root.addEventListener("click", doSkip);
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      if (skip) skip.removeEventListener("click", onSkipClick);
      root.removeEventListener("click", doSkip);
      tlRef.current?.kill();
      tlRef.current = null;
      if (home) gsap.set(home, { clearProps: "opacity,transform,transformOrigin" });
      document.documentElement.style.overflow = "";
    };
  }, [playing]);

  if (!playing || typeof document === "undefined") return null;

  const g = CR_WORDMARK.gradient;
  return createPortal(
    <div className="intro" ref={rootRef} aria-hidden>
      <div className="intro-veil">
        <canvas ref={canvasRef} className="intro-canvas" />
        <div className="intro-stage">
          <div className="intro-bloom" aria-hidden />
          <div className="intro-spark" aria-hidden />
          <div className="intro-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="intro-sym-img" src={SYMBOL} alt="" draggable={false} />
            <svg
              className="intro-trace"
              aria-hidden
              preserveAspectRatio="xMidYMid meet"
              viewBox={CR_WORDMARK.viewBox}
              style={{ aspectRatio: String(CR_WORDMARK.aspectRatio) }}
            >
              <defs>
                <linearGradient
                  id="crIntroGrad"
                  gradientUnits="userSpaceOnUse"
                  x1={g.x1}
                  y1={g.y1}
                  x2={g.x2}
                  y2={g.y2}
                >
                  <stop offset="0" stopColor="#5b8bff" />
                  <stop offset="0.5" stopColor="#7c6bf5" />
                  <stop offset="1" stopColor="#b95cf0" />
                </linearGradient>
                <filter id="crIntroGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g className="tr-fills">
                {CR_WORDMARK.paths.map((d, i) => (
                  <path key={i} d={d} fill="url(#crIntroGrad)" stroke="none" />
                ))}
              </g>
              <g className="tr-strokes">
                {CR_WORDMARK.paths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke="url(#crIntroGrad)"
                    strokeWidth={CR_WORDMARK.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#crIntroGlow)"
                  />
                ))}
              </g>
            </svg>
          </div>
        </div>
        <button className="intro-skip" type="button" aria-label="Skip intro">
          Skip intro
        </button>
      </div>
      <style>{`
        .intro { position: fixed; inset: 0; z-index: 9999; }
        .intro-veil { position: absolute; inset: 0; background: #04050a; overflow: hidden; }
        .intro-canvas { position: absolute; inset: 0; display: block; }
        .intro-stage {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          will-change: transform, opacity;
        }
        .intro-lockup {
          position: relative; z-index: 2; display: flex; align-items: center; justify-content: center;
          gap: 0.16em; font-size: clamp(72px, 13vw, 148px); max-width: 94vw;
        }
        .intro-sym-img {
          height: 0.86em; width: 0.86em; flex: none; object-fit: contain;
          filter: drop-shadow(0 0 22px rgba(124,107,245,0.6)); will-change: opacity;
        }
        .intro-trace {
          height: 1em; width: auto; overflow: visible;
          filter: drop-shadow(0 0 26px rgba(124,107,245,0.4));
        }
        .tr-fills { will-change: opacity; }
        .intro-spark {
          position: absolute; z-index: 2; width: 60px; height: 60px; border-radius: 50%;
          background: radial-gradient(circle, #ffffff 0%, #dfe6ff 30%, rgba(150,130,255,0) 70%);
          box-shadow: 0 0 50px 16px rgba(206,216,255,0.85), 0 0 90px 36px rgba(124,107,245,0.55);
          will-change: transform, opacity; pointer-events: none;
        }
        .intro-bloom {
          position: absolute; z-index: 1; width: min(80vmin, 640px); height: min(80vmin, 640px);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(150,130,255,0.6) 22%, rgba(124,107,245,0) 62%);
          will-change: transform, opacity; pointer-events: none;
        }
        .intro-skip {
          position: absolute; z-index: 4; right: 24px; bottom: 22px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.72); font-size: 12.5px; letter-spacing: 0.02em;
          padding: 9px 16px; border-radius: 999px; cursor: pointer; backdrop-filter: blur(6px);
          transition: color .15s ease, border-color .15s ease, background .15s ease;
        }
        .intro-skip:hover { color: #fff; border-color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.12); }
      `}</style>
    </div>,
    document.body,
  );
}

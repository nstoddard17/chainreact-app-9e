"use client";

import { useEffect, useRef } from "react";

/**
 * Hero motion background — flowing particle field (Slice 4.HOMEPAGE-V5-1).
 *
 * Ported from the design's `HeroMotionBg`. Streams of light trace a slowly
 * morphing flow field ("automations / data in motion"), monochrome, drawn
 * on a canvas. Reads the marketing tokens (`--mk-bg` / `--mk-text`) from
 * the inherited `[data-marketing-surface]` scope. Marketing is dark-only
 * (no theme toggle — decided with the user), so colors are read once on
 * mount. Respects `prefers-reduced-motion` (paints a single static frame)
 * and pauses via IntersectionObserver when scrolled offscreen.
 *
 * Decorative only — `aria-hidden`, `pointer-events: none`, sits at z-index 0
 * behind the hero content.
 */
export function MarketingHeroMotion({ intensity = 5 }: { intensity?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let bg = "#0a0a0a";
    let textRGB = [250, 250, 250];
    let bgRGB = [10, 10, 10];
    const parseColor = (str: string) => {
      const probe = document.createElement("span");
      probe.style.color = str;
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const m = cs.match(/\d+(\.\d+)?/g);
      return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [250, 250, 250];
    };
    const readTheme = () => {
      const cs = getComputedStyle(wrap);
      bg = cs.getPropertyValue("--mk-bg").trim() || "#0a0a0a";
      bgRGB = parseColor(bg);
      textRGB = parseColor(cs.getPropertyValue("--mk-text").trim() || "#fafafa");
    };
    readTheme();

    let W = 0;
    let H = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    type P = { x: number; y: number; px: number; py: number; speed: number; life: number; maxLife: number; bright: boolean };
    let particles: P[] = [];
    const spawn = (): P => ({
      x: Math.random() * W,
      y: Math.random() * H,
      px: 0,
      py: 0,
      speed: 0.5 + Math.random() * 1.4,
      life: 0,
      maxLife: 120 + Math.random() * 360,
      bright: Math.random() < 0.14,
    });
    const seed = () => {
      const dens = 0.00016 + (intensity / 10) * 0.00016;
      const target = Math.min(900, Math.max(120, Math.round(W * H * dens)));
      particles = new Array(target).fill(0).map(() => spawn());
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      seed();
    };

    const flow = (x: number, y: number, t: number) =>
      (Math.sin(x * 0.0016 + t * 0.00022) +
        Math.cos(y * 0.0021 - t * 0.00019) +
        Math.sin((x + y) * 0.0011 + t * 0.00031) +
        Math.cos((x - y) * 0.0009 - t * 0.00014)) *
      1.1;

    let raf = 0;
    let t0 = performance.now();
    let running = true;

    const stepDraw = (p: P, t: number) => {
      const a = flow(p.x, p.y, t);
      p.px = p.x;
      p.py = p.y;
      p.x += Math.cos(a) * p.speed;
      p.y += Math.sin(a) * p.speed;
      p.life++;
      if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10 || p.life > p.maxLife) {
        Object.assign(p, spawn());
        return;
      }
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
    };

    const frame = (now: number) => {
      if (!running) return;
      const t = now - t0;
      const I = intensity;
      const fade = 0.085 - I * 0.0028;
      ctx.fillStyle = `rgba(${bgRGB[0]},${bgRGB[1]},${bgRGB[2]},${Math.max(0.03, fade)})`;
      ctx.fillRect(0, 0, W, H);

      const baseAlpha = 0.05 + (I / 10) * 0.11;
      const [tr, tg, tb] = textRGB;

      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(${tr},${tg},${tb},${baseAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of particles) {
        if (p.bright) continue;
        stepDraw(p, t);
      }
      ctx.stroke();

      ctx.strokeStyle = `rgba(${tr},${tg},${tb},${Math.min(0.9, baseAlpha * 4.2)})`;
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${tr},${tg},${tb},0.6)`;
      ctx.beginPath();
      for (const p of particles) {
        if (!p.bright) continue;
        stepDraw(p, t);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || reduced) return;
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const paintStatic = () => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const [tr, tg, tb] = textRGB;
      ctx.strokeStyle = `rgba(${tr},${tg},${tb},0.10)`;
      ctx.lineWidth = 1;
      for (let pass = 0; pass < 24; pass++) {
        let x = Math.random() * W;
        let y = Math.random() * H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 60; s++) {
          const a = flow(x, y, 0);
          x += Math.cos(a) * 4;
          y += Math.sin(a) * 4;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    resize();
    if (reduced) paintStatic();
    else start();

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) start();
            else stop();
          }
        },
        { threshold: 0 },
      );
      io.observe(wrap);
    }

    const onResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      resize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      if (io) io.disconnect();
    };
  }, [intensity]);

  return (
    <div className="mk-motion" ref={wrapRef} aria-hidden>
      <canvas ref={canvasRef} className="mk-motion-canvas" />
      <div className="mk-motion-glow" />
      <div className="mk-motion-grain" />
      <div className="mk-motion-fade" />
      <style>{`
        .mk-motion {
          position: absolute; inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background: var(--mk-bg);
        }
        .mk-motion-canvas { position: absolute; inset: 0; display: block; }
        .mk-motion-glow {
          position: absolute; inset: -10%;
          background:
            radial-gradient(38% 46% at 28% 32%, color-mix(in oklab, var(--mk-text) 16%, transparent), transparent 70%),
            radial-gradient(34% 40% at 74% 64%, color-mix(in oklab, var(--mk-text) 10%, transparent), transparent 70%);
          mix-blend-mode: screen;
          filter: blur(20px);
          animation: mk-motion-glow 22s ease-in-out infinite;
        }
        [data-marketing-theme="light"] .mk-motion-glow { mix-blend-mode: multiply; }
        @keyframes mk-motion-glow {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          33%      { transform: translate3d(4%, -3%, 0) scale(1.08); }
          66%      { transform: translate3d(-3%, 2%, 0) scale(1.04); }
        }
        .mk-motion-grain {
          position: absolute; inset: 0;
          opacity: 0.5;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
          background-size: 160px 160px;
        }
        .mk-motion-fade {
          position: absolute; left: 0; right: 0; bottom: 0; height: 22%;
          background: linear-gradient(to bottom, transparent, var(--mk-bg));
        }
        @media (prefers-reduced-motion: reduce) {
          .mk-motion-glow { animation: none; }
        }
      `}</style>
    </div>
  );
}

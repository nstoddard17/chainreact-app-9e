"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandTile, CheckIcon } from "./MarketingGlyphs";

/**
 * Pinned "build-a-chain" scroll narrative (Slice 4.HOMEPAGE-V5-1).
 *
 * Ported from the design's `ScrollStory`. A tall section with a sticky
 * 100vh stage; one central object — the automation — stays pinned and
 * morphs as you scroll: sentence → chain builds → connects → runs →
 * trust. Scroll progress (0..1) is written to `--p` on the sticky element
 * so the visual scrubs without React re-renders; only the discrete stage
 * index (for the cross-fading copy) lives in state.
 *
 * Honesty (Slice 4.HOMEPAGE-V2-1 rule): the design's result receipt
 * carried a fabricated recovered-dollar figure ("$480 recovered this
 * week") and a fake customer email ("casey@northwind.co"). Both are
 * removed — the receipt shows only the (illustrative) actions the example
 * chain would take, no invented metric, no named person. The chain itself
 * (Stripe → AI → Gmail → Slack) is an illustrative example, not a claim.
 *
 * Carries `id="how-it-works"` — the nav's "How it works" anchor.
 */
const CAPTIONS = [
  { eyebrow: "01 — Describe", h: "Say it the way you'd say it to a coworker.", sub: "No flowcharts, no JSON, no API docs. Type one plain sentence and ChainReact reads the intent behind it." },
  { eyebrow: "02 — Build", h: "It lays out every step, instantly.", sub: "Triggers, conditions and actions appear as a single chain you can read straight down the page." },
  { eyebrow: "03 — Connect", h: "Wired into the tools you already pay for.", sub: "Stripe, your inbox, Slack — every step snaps onto a real account with a single click each." },
  { eyebrow: "04 — Run", h: "Then it runs, entirely on its own.", sub: "Events flow through the chain in real time. No babysitting, no copy-paste, no manual steps." },
  { eyebrow: "05 — Trust", h: "Quietly reliable, day after day.", sub: "It retries the hiccups, logs everything it did, and only pings you when something truly needs you." },
] as const;

const NODES = [
  { brand: "Stripe", title: "Payment failed", sub: "Trigger · Stripe", start: 0.17 },
  { brand: "OpenAI", title: "Draft a friendly nudge", sub: "AI step · writes the message", start: 0.27 },
  { brand: "Gmail", title: "Email the customer", sub: "Action · Gmail", start: 0.37 },
  { brand: "Slack", title: "Post an update in #billing", sub: "Action · Slack", start: 0.47 },
] as const;

export function MarketingScrollStory() {
  const secRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = secRef.current;
      const sticky = stickyRef.current;
      if (!el || !sticky) return;
      const total = el.offsetHeight - window.innerHeight;
      const passed = Math.min(Math.max(-el.getBoundingClientRect().top, 0), Math.max(1, total));
      const p = total > 0 ? passed / total : 0;
      sticky.style.setProperty("--p", p.toFixed(4));
      const s = p < 0.15 ? 0 : p < 0.4 ? 1 : p < 0.62 ? 2 : p < 0.85 ? 3 : 4;
      setStage((prev) => (prev === s ? prev : s));
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
    <section className="mk-ss" id="how-it-works" ref={secRef} aria-labelledby="mk-ss-h" data-testid="marketing-scroll-story">
      <div className="mk-ss-sticky" ref={stickyRef}>
        <div className="mk-ss-inner">
          <div className="mk-ss-text">
            <h2 id="mk-ss-h" className="mk-ss-sr-only">How ChainReact works</h2>
            <div className="mk-ss-caps">
              {CAPTIONS.map((c, i) => (
                <div key={c.eyebrow} className={"mk-ss-cap" + (stage === i ? " is-on" : stage > i ? " is-past" : "")}>
                  <div className="mk-ss-cap-eyebrow">{c.eyebrow}</div>
                  <div className="mk-ss-cap-h">{c.h}</div>
                  <p className="mk-ss-cap-sub">{c.sub}</p>
                </div>
              ))}
            </div>
            <div className="mk-ss-progress" aria-hidden>
              {CAPTIONS.map((c, i) => (
                <span key={c.eyebrow} className={"mk-ss-dot" + (stage === i ? " is-on" : stage > i ? " is-done" : "")} />
              ))}
            </div>
          </div>

          <div className="mk-ss-vis" aria-hidden>
            <div className="mk-ss-glow" />
            <div className="mk-ss-chain">
              <div className="mk-ss-spine" />
              <div className="mk-ss-pulse" />

              <div className="mk-ss-prompt">
                <div className="mk-ss-prompt-label">Your words</div>
                <div className="mk-ss-prompt-text">
                  When a Stripe payment fails, email the customer a friendly nudge and post an update in #billing.
                  <span className="mk-ss-cursor">▌</span>
                </div>
              </div>

              {NODES.map((n) => (
                <div key={n.title} className="mk-ss-node" style={{ ["--start" as string]: n.start } as CSSProperties}>
                  <div className="mk-ss-node-ico"><BrandTile label={n.brand} size={26} /></div>
                  <div className="mk-ss-node-meta">
                    <div className="mk-ss-node-title">{n.title}</div>
                    <div className="mk-ss-node-sub">{n.sub}</div>
                  </div>
                  <div className="mk-ss-node-tick"><CheckIcon size={14} /></div>
                </div>
              ))}
            </div>

            <div className="mk-ss-receipt" style={{ ["--start" as string]: 0.7 } as CSSProperties}>
              <div className="mk-ss-receipt-h">
                <span className="mk-ss-receipt-dot" /> Live · just ran
              </div>
              <div className="mk-ss-receipt-row">Nudge emailed to the customer</div>
              <div className="mk-ss-receipt-row">Posted in <b>#billing</b></div>
              <div className="mk-ss-receipt-stat">Handled automatically — nothing for you to do</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mk-ss { position: relative; height: 520vh; }
        .mk-ss-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
        .mk-ss-sticky {
          position: sticky; top: 0; height: 100vh;
          display: flex; align-items: center; overflow: hidden;
          --p: 0;
        }
        .mk-ss-inner {
          max-width: 1320px; margin: 0 auto; padding: 0 32px; width: 100%;
          display: grid; grid-template-columns: 0.82fr 1fr; gap: 56px; align-items: center;
        }
        .mk-ss-text { position: relative; }
        .mk-ss-caps { position: relative; min-height: 290px; }
        .mk-ss-cap {
          position: absolute; inset: 0;
          opacity: 0; transform: translateY(22px);
          transition: opacity .55s cubic-bezier(.2,.8,.3,1), transform .55s cubic-bezier(.2,.8,.3,1);
          pointer-events: none;
        }
        .mk-ss-cap.is-on { opacity: 1; transform: none; }
        .mk-ss-cap.is-past { opacity: 0; transform: translateY(-22px); }
        .mk-ss-cap-eyebrow {
          font-family: var(--font-mono); font-size: 12.5px; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--mk-muted); margin-bottom: 22px;
        }
        .mk-ss-cap-h {
          font-size: clamp(30px, 3.4vw, 52px); line-height: 1.05; letter-spacing: -0.025em;
          font-weight: 500; margin: 0 0 22px; color: var(--mk-text);
        }
        .mk-ss-cap-sub {
          font-size: clamp(16px, 1.3vw, 19px); line-height: 1.55; color: var(--mk-muted);
          margin: 0; max-width: 440px;
        }
        .mk-ss-progress { display: flex; gap: 10px; margin-top: 40px; }
        .mk-ss-dot {
          width: 34px; height: 3px; border-radius: 3px; background: var(--mk-border-strong);
          transition: background .4s ease, transform .4s ease; transform-origin: left;
        }
        .mk-ss-dot.is-on { background: var(--mk-text); transform: scaleX(1.15); }
        .mk-ss-dot.is-done { background: var(--mk-muted-2); }

        .mk-ss-vis { position: relative; display: flex; align-items: center; justify-content: center; min-height: 70vh; }
        .mk-ss-glow {
          position: absolute; width: 70%; height: 70%; left: 15%; top: 15%;
          background: radial-gradient(circle, color-mix(in oklab, var(--mk-text) 18%, transparent), transparent 70%);
          filter: blur(50px);
          opacity: calc(0.25 + clamp(0, (var(--p) - 0.45) / 0.25, 1) * 0.6);
          pointer-events: none;
        }
        .mk-ss-chain { position: relative; width: min(440px, 100%); display: flex; flex-direction: column; gap: 16px; }
        .mk-ss-spine {
          position: absolute; left: 40px; top: 64px; bottom: 36px; width: 2px;
          background: linear-gradient(180deg, var(--mk-border-strong), color-mix(in oklab, var(--mk-text) 30%, transparent));
          transform-origin: top; transform: scaleY(clamp(0, (var(--p) - 0.16) / 0.34, 1)); opacity: 0.9;
        }
        .mk-ss-pulse {
          position: absolute; left: 40px; width: 12px; height: 12px; border-radius: 50%;
          transform: translate(-5px, -50%);
          top: calc(64px + clamp(0, (var(--p) - 0.52) / 0.30, 1) * (100% - 100px));
          background: var(--mk-text);
          box-shadow: 0 0 16px 4px color-mix(in oklab, var(--mk-text) 70%, transparent);
          opacity: calc(clamp(0, (var(--p) - 0.50) / 0.04, 1) * clamp(0, (0.94 - var(--p)) / 0.05, 1));
        }
        .mk-ss-prompt {
          position: relative; z-index: 2;
          background: var(--mk-panel); border: 1px solid var(--mk-border);
          border-radius: 16px; padding: 18px 20px; margin-bottom: 6px;
          transform: scale(calc(1 + clamp(0, (0.14 - var(--p)) / 0.14, 1) * 0.05));
          transform-origin: left center;
          box-shadow: 0 0 0 calc(clamp(0, (0.14 - var(--p)) / 0.14, 1) * 6px) color-mix(in oklab, var(--mk-text) 9%, transparent);
          transition: box-shadow .2s linear;
        }
        .mk-ss-prompt-label {
          font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--mk-muted-2); margin-bottom: 10px;
        }
        .mk-ss-prompt-text { font-size: 16.5px; line-height: 1.5; color: var(--mk-text); letter-spacing: -0.01em; }
        .mk-ss-cursor { animation: mk-ss-blink 1.1s steps(1) infinite; color: var(--mk-muted); }
        @keyframes mk-ss-blink { 50% { opacity: 0; } }
        .mk-ss-node {
          position: relative; z-index: 2;
          display: flex; align-items: center; gap: 14px;
          background: var(--mk-panel); border: 1px solid var(--mk-border);
          border-radius: 14px; padding: 13px 16px;
          --reveal: clamp(0, calc((var(--p) - var(--start)) / 0.07), 1);
          opacity: var(--reveal);
          transform: translateX(calc((1 - var(--reveal)) * 26px));
          box-shadow: 0 18px 40px -28px rgba(0,0,0,0.6);
        }
        .mk-ss-node-ico {
          width: 44px; height: 44px; flex-shrink: 0; border-radius: 11px;
          background: var(--mk-panel-2); border: 1px solid var(--mk-border);
          display: flex; align-items: center; justify-content: center;
        }
        .mk-ss-node-meta { flex: 1; min-width: 0; }
        .mk-ss-node-title { font-size: 15px; font-weight: 600; color: var(--mk-text); letter-spacing: -0.01em; }
        .mk-ss-node-sub { font-size: 12.5px; color: var(--mk-muted); margin-top: 2px; }
        .mk-ss-node-tick {
          width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: var(--mk-success-soft); color: var(--mk-success);
          opacity: calc(clamp(0, (var(--p) - 0.56) / 0.08, 1) * var(--reveal));
        }
        .mk-ss-receipt {
          position: absolute; right: -4px; bottom: 6%;
          width: 252px; z-index: 3;
          background: var(--mk-panel); border: 1px solid var(--mk-border);
          border-radius: 14px; padding: 16px 18px;
          box-shadow: 0 40px 80px -30px rgba(0,0,0,0.7);
          --reveal: clamp(0, calc((var(--p) - var(--start)) / 0.10), 1);
          opacity: var(--reveal);
          transform: translateY(calc((1 - var(--reveal)) * 28px)) scale(calc(0.96 + var(--reveal) * 0.04));
        }
        .mk-ss-receipt-h { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--mk-text); margin-bottom: 12px; }
        .mk-ss-receipt-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mk-success); box-shadow: 0 0 0 4px var(--mk-success-soft); animation: mk-ss-pulse 2s ease-in-out infinite; }
        @keyframes mk-ss-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.7); opacity: 0.7; } }
        .mk-ss-receipt-row { font-size: 12.5px; color: var(--mk-muted); line-height: 1.5; }
        .mk-ss-receipt-row b { color: var(--mk-text-2); font-weight: 600; }
        .mk-ss-receipt-stat { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--mk-border); font-size: 12.5px; color: var(--mk-muted); line-height: 1.45; }

        @media (max-width: 920px) {
          .mk-ss-inner { grid-template-columns: 1fr; gap: 28px; }
          .mk-ss-caps { min-height: 200px; }
          .mk-ss-vis { min-height: 56vh; }
          .mk-ss-receipt { right: -4px; bottom: 0; width: 210px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mk-ss { height: auto; }
          .mk-ss-sticky { position: relative; height: auto; padding: 80px 0; }
          .mk-ss-cap { position: relative; opacity: 1; transform: none; margin-bottom: 24px; }
          .mk-ss-caps { min-height: 0; }
          .mk-ss-node, .mk-ss-receipt, .mk-ss-prompt { opacity: 1 !important; transform: none !important; }
          .mk-ss-spine { transform: scaleY(1); }
          .mk-ss-pulse { display: none; }
        }
      `}</style>
    </section>
  );
}

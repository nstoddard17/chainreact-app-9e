"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandTile, CheckIcon, DragIcon } from "./MarketingGlyphs";

/**
 * Pinned "Five reasons it sticks" feature section (Slice 4.HOMEPAGE-V5-1).
 *
 * Replaces the FeatureRows accordion with the design's v5 `FeatureSticky`:
 * a tall section with a pinned stage — the five reasons advance on the
 * right while a single visual on the left morphs through five scenes.
 *
 * The five reasons' copy is carried verbatim from the v2 FeatureRows
 * (already honesty-reviewed — "247 apps" was softened to "every app we
 * support"). Two scene neutralizations on top of that:
 *   - Connect scene footer says "Every app we support · one click each"
 *     (NOT the design's drifting "247 apps and counting").
 *   - Reliable scene drops the design's fabricated "0 missed runs · Last
 *     30 days" uptime metric; it shows only the generic auto-retry behavior.
 * The free-plan scene keeps "$0/mo" — consistent with the existing
 * "Honest pricing · the free plan covers most small businesses" claim.
 *
 * All five reasons render in the DOM (screen-reader complete); the active
 * one is visually emphasized by scroll position. Carries `id="what-you-get"`.
 */
const ITEMS: ReadonlyArray<{ t: string; s: string }> = [
  { t: "Built in plain English", s: "Tell ChainReact what should happen the way you'd say it to a teammate. No node graphs, no JSON, no API docs in a new tab." },
  { t: "Yours, not just rented", s: "Edit any step, swap the apps, pause for the holidays, clone what works. The automation belongs to you — not a tool you can't get out of." },
  { t: "Quietly reliable", s: "Retries automatically when something hiccups. Surfaces a one-line summary only when it actually needs you. No 3am crashes." },
  { t: "Connects to what you already pay for", s: "Gmail, Stripe, Shopify, Slack, Notion, HubSpot, and every app we support — connect as many accounts as you need, one click each." },
  { t: "Honest pricing", s: "Predictable plans with clear task allowances. The free plan covers most small businesses; paid scales only when you actually need more." },
];

function SceneType({ on }: { on: boolean }) {
  return (
    <div className={"mk-fx-scene" + (on ? " is-on" : "")}>
      <div className="mk-fx-card">
        <div className="mk-fx-card-label">You type</div>
        <div className="mk-fx-prompt-text">Email me a summary of yesterday&apos;s Shopify sales every morning<span className="mk-fx-cur">▌</span></div>
        <div className="mk-fx-prompt-bar"><span className="mk-fx-build">Build it →</span></div>
      </div>
    </div>
  );
}
function SceneOwn({ on }: { on: boolean }) {
  const rows = [
    { t: "When an order is paid", s: "Trigger" },
    { t: "Summarize the day", s: "AI step" },
    { t: "Email it to me", s: "Action" },
  ];
  return (
    <div className={"mk-fx-scene" + (on ? " is-on" : "")}>
      <div className="mk-fx-card">
        <div className="mk-fx-card-label">Yours to edit</div>
        {rows.map((r, i) => (
          <div key={r.t} className={"mk-fx-chip" + (i === 1 ? " is-lift" : "")}>
            <span className="mk-fx-grip"><DragIcon size={16} /></span>
            <div className="mk-fx-chip-meta"><div className="mk-fx-chip-t">{r.t}</div><div className="mk-fx-chip-s">{r.s}</div></div>
            {i === 1 && <span className="mk-fx-edit-pill">Edit</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
function SceneReliable({ on }: { on: boolean }) {
  return (
    <div className={"mk-fx-scene" + (on ? " is-on" : "")}>
      <div className="mk-fx-card">
        <div className="mk-fx-rel-h"><span className="mk-fx-rel-dot" /> All systems healthy</div>
        <svg className="mk-fx-ecg" viewBox="0 0 320 80" preserveAspectRatio="none" aria-hidden>
          <polyline
            points="0,40 60,40 78,40 90,16 104,64 118,40 180,40 198,40 210,22 224,58 238,40 320,40"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="mk-fx-rel-rows">
          <div className="mk-fx-rel-row"><span>Stripe webhook</span><b>retried · ok</b></div>
          <div className="mk-fx-rel-row"><span>When something hiccups</span><b>retried automatically</b></div>
        </div>
      </div>
    </div>
  );
}
function SceneConnect({ on }: { on: boolean }) {
  const apps = ["Stripe", "Slack", "Gmail", "Notion", "OpenAI", "HubSpot", "Shopify", "Linear"];
  return (
    <div className={"mk-fx-scene" + (on ? " is-on" : "")}>
      <div className="mk-fx-card">
        <div className="mk-fx-conn-grid">
          {apps.map((a, i) => (
            <div key={a} className="mk-fx-tile" style={{ ["--d" as string]: `${i * 0.04}s` } as CSSProperties}>
              <BrandTile label={a} size={26} />
            </div>
          ))}
        </div>
        <div className="mk-fx-conn-foot">Every app we support · one click each</div>
      </div>
    </div>
  );
}
function ScenePricing({ on }: { on: boolean }) {
  return (
    <div className={"mk-fx-scene" + (on ? " is-on" : "")}>
      <div className="mk-fx-card">
        <div className="mk-fx-card-label">Free plan</div>
        <div className="mk-fx-price-v">$0<span>/mo</span></div>
        <div className="mk-fx-price-list">
          {["Covers most small businesses", "Real task allowance, no asterisks", "Upgrade only when you outgrow it"].map((l) => (
            <div key={l} className="mk-fx-price-row"><CheckIcon size={15} /><span>{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SCENES = [SceneType, SceneOwn, SceneReliable, SceneConnect, ScenePricing];

export function MarketingFeatureSticky() {
  const secRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = secRef.current;
      if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      const passed = Math.min(Math.max(-el.getBoundingClientRect().top, 0), Math.max(1, total));
      const p = total > 0 ? passed / total : 0;
      const i = Math.min(ITEMS.length - 1, Math.floor(p * ITEMS.length));
      setActive((prev) => (prev === i ? prev : i));
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
    <section className="mk-fx" id="what-you-get" ref={secRef} aria-labelledby="mk-fx-h" data-testid="marketing-feature-sticky">
      <div className="mk-fx-sticky">
        <div className="mk-fx-inner">
          <div className="mk-fx-vis" aria-hidden>
            <div className="mk-fx-vis-glow" />
            {SCENES.map((Scene, i) => <Scene key={ITEMS[i]!.t} on={active === i} />)}
          </div>
          <div className="mk-fx-list">
            <div className="mk-fx-eyebrow">What you get</div>
            <h2 id="mk-fx-h" className="mk-fx-h">Five reasons it sticks.</h2>
            <ul className="mk-fx-rows">
              {ITEMS.map((it, i) => (
                <li
                  key={it.t}
                  className={"mk-fx-row" + (active === i ? " is-on" : active > i ? " is-past" : "")}
                  data-testid="marketing-feature-reason"
                  aria-current={active === i ? "true" : undefined}
                >
                  <div className="mk-fx-row-no">0{i + 1}</div>
                  <div className="mk-fx-row-body">
                    <div className="mk-fx-row-t">{it.t}</div>
                    <div className="mk-fx-row-s">{it.s}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        .mk-fx { position: relative; height: 480vh; border-top: 1px solid var(--mk-border); }
        .mk-fx-sticky { position: sticky; top: 0; height: 100vh; display: flex; align-items: center; overflow: hidden; }
        .mk-fx-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; width: 100%; display: grid; grid-template-columns: 1fr 0.92fr; gap: 64px; align-items: center; }
        @media (max-width: 940px) { .mk-fx-inner { grid-template-columns: 1fr; gap: 36px; } }

        .mk-fx-vis { position: relative; min-height: 380px; display: flex; align-items: center; justify-content: center; }
        .mk-fx-vis-glow { position: absolute; width: 75%; height: 70%; left: 12%; top: 15%; background: radial-gradient(circle, color-mix(in oklab, var(--mk-text) 13%, transparent), transparent 70%); filter: blur(50px); pointer-events: none; }
        .mk-fx-scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; transform: translateY(20px) scale(0.98); transition: opacity .5s cubic-bezier(.2,.8,.3,1), transform .5s cubic-bezier(.2,.8,.3,1); pointer-events: none; }
        .mk-fx-scene.is-on { opacity: 1; transform: none; }
        .mk-fx-card { position: relative; width: min(420px, 100%); background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 18px; padding: 26px 28px; box-shadow: 0 40px 90px -40px rgba(0,0,0,0.6); }
        .mk-fx-card-label { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--mk-muted-2); margin-bottom: 16px; }

        .mk-fx-prompt-text { font-size: 19px; line-height: 1.5; color: var(--mk-text); letter-spacing: -0.01em; }
        .mk-fx-cur { color: var(--mk-muted); animation: mk-fx-blink 1.1s steps(1) infinite; }
        @keyframes mk-fx-blink { 50% { opacity: 0; } }
        .mk-fx-prompt-bar { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--mk-border); display: flex; justify-content: flex-end; }
        .mk-fx-build { font-size: 13px; font-weight: 600; color: var(--mk-bg); background: var(--mk-text); padding: 9px 16px; border-radius: 999px; }

        .mk-fx-chip { display: flex; align-items: center; gap: 12px; background: var(--mk-panel-2); border: 1px solid var(--mk-border); border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; transition: transform .3s ease; }
        .mk-fx-chip:last-child { margin-bottom: 0; }
        .mk-fx-chip.is-lift { transform: translateX(10px); border-color: var(--mk-border-strong); box-shadow: 0 16px 30px -20px rgba(0,0,0,0.6); }
        .mk-fx-grip { color: var(--mk-muted-2); display: flex; }
        .mk-fx-chip-meta { flex: 1; }
        .mk-fx-chip-t { font-size: 14.5px; font-weight: 600; color: var(--mk-text); }
        .mk-fx-chip-s { font-size: 12px; color: var(--mk-muted); margin-top: 1px; }
        .mk-fx-edit-pill { font-size: 11.5px; font-weight: 600; color: var(--mk-text); border: 1px solid var(--mk-border-strong); border-radius: 999px; padding: 4px 11px; }

        .mk-fx-rel-h { display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 600; color: var(--mk-text); }
        .mk-fx-rel-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--mk-success); box-shadow: 0 0 0 4px var(--mk-success-soft); animation: mk-fx-pulse 2s ease-in-out infinite; }
        @keyframes mk-fx-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(0.65); } }
        .mk-fx-ecg { width: 100%; height: 80px; color: var(--mk-text-2); margin: 18px 0 8px; }
        .mk-fx-ecg polyline { stroke-dasharray: 700; stroke-dashoffset: 700; animation: mk-fx-draw 3.2s ease-in-out infinite; }
        @keyframes mk-fx-draw { 0% { stroke-dashoffset: 700; } 55%,100% { stroke-dashoffset: 0; } }
        .mk-fx-rel-rows { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid var(--mk-border); }
        .mk-fx-rel-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--mk-muted); }
        .mk-fx-rel-row b { color: var(--mk-success); font-weight: 600; }

        .mk-fx-conn-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .mk-fx-tile { aspect-ratio: 1; border-radius: 13px; background: var(--mk-panel-2); border: 1px solid var(--mk-border); display: flex; align-items: center; justify-content: center; opacity: 0; transform: scale(0.8); animation: mk-fx-pop .4s cubic-bezier(.2,.8,.3,1) forwards; animation-delay: var(--d); }
        .mk-fx-scene:not(.is-on) .mk-fx-tile { animation: none; opacity: 0; }
        @keyframes mk-fx-pop { to { opacity: 1; transform: none; } }
        .mk-fx-conn-foot { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--mk-border); font-size: 13px; color: var(--mk-muted); }

        .mk-fx-price-v { font-size: 56px; font-weight: 600; letter-spacing: -0.03em; color: var(--mk-text); line-height: 1; margin-bottom: 22px; }
        .mk-fx-price-v span { font-size: 18px; color: var(--mk-muted); font-weight: 400; margin-left: 4px; }
        .mk-fx-price-list { display: flex; flex-direction: column; gap: 12px; }
        .mk-fx-price-row { display: flex; align-items: center; gap: 10px; font-size: 14.5px; color: var(--mk-text-2); }
        .mk-fx-price-row svg { color: var(--mk-success); flex-shrink: 0; }

        .mk-fx-eyebrow { font-size: 13px; color: var(--mk-muted); margin-bottom: 16px; }
        .mk-fx-h { font-size: clamp(30px, 3.6vw, 52px); letter-spacing: -0.025em; font-weight: 500; line-height: 1.04; margin: 0 0 40px; color: var(--mk-text); }
        .mk-fx-rows { display: flex; flex-direction: column; list-style: none; margin: 0; padding: 0; }
        .mk-fx-row { display: grid; grid-template-columns: 52px 1fr; gap: 18px; padding: 18px 0; border-top: 1px solid var(--mk-border); transition: opacity .4s ease; }
        .mk-fx-row:first-child { border-top: 0; }
        .mk-fx-row.is-past, .mk-fx-row:not(.is-on) { opacity: 0.34; }
        .mk-fx-row.is-on { opacity: 1; }
        .mk-fx-row-no { font-family: var(--font-mono); font-size: 13px; color: var(--mk-muted); padding-top: 4px; }
        .mk-fx-row-t { font-size: clamp(19px, 2vw, 26px); letter-spacing: -0.018em; font-weight: 500; color: var(--mk-text); line-height: 1.2; }
        .mk-fx-row-s { font-size: 15px; color: var(--mk-muted); line-height: 1.5; margin-top: 8px; max-width: 460px; max-height: 0; opacity: 0; overflow: hidden; transition: max-height .45s ease, opacity .4s ease, margin-top .45s ease; }
        .mk-fx-row.is-on .mk-fx-row-s { max-height: 120px; opacity: 1; }

        @media (prefers-reduced-motion: reduce) {
          .mk-fx { height: auto; }
          .mk-fx-sticky { position: relative; height: auto; padding: 80px 0; }
          .mk-fx-vis { display: none; }
          .mk-fx-row, .mk-fx-row.is-past { opacity: 1 !important; }
          .mk-fx-row .mk-fx-row-s { max-height: 120px; opacity: 1; }
        }
      `}</style>
    </section>
  );
}

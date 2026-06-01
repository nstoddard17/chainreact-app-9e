"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { BrandTile, ClockIcon } from "./MarketingGlyphs";

/**
 * Interactive "Selected automations" showcase (Slice 4.HOMEPAGE-V5-1).
 *
 * Replaces the static FeaturedCases grid with the design's v5
 * `FeaturedShowcase`: a selectable list on the left; picking one rebuilds
 * it as a live mini-chain on the right (reusing the scroll-story's node
 * vocabulary). Auto-advances; pauses on hover.
 *
 * Honesty (Slice 4.HOMEPAGE-V2-1 rule, carried forward): the design's
 * per-case stat tiles ("$24k recovered per quarter", "94% handled without
 * the owner", "5+ hrs saved", "4.2× more reviews", "0 leads slipped", …)
 * are fabricated numbers and are NOT rendered — exactly as the v2
 * FeaturedCases omitted them. The categories / names / descriptions / the
 * illustrative chains ship as illustrative copy, not customer claims.
 *
 * The design's "Browse all" link is omitted per the user's request (there
 * is no /examples page to point it at yet anyway).
 */
type ChainNode =
  | { kind: "brand"; brand: string; title: string; sub: string }
  | { kind: "clock"; title: string; sub: string };

const CASES: ReadonlyArray<{
  id: string;
  tags: readonly string[];
  name: string;
  desc: string;
  nodes: readonly ChainNode[];
}> = [
  {
    id: "payments",
    tags: ["Payments", "AI", "Slack"],
    name: "Failed payment recovery",
    desc: "Catch declines, send a friendly nudge, and escalate to a human only when it's actually needed.",
    nodes: [
      { kind: "brand", brand: "Stripe", title: "Payment declined", sub: "Trigger · Stripe" },
      { kind: "brand", brand: "OpenAI", title: "Write a friendly nudge", sub: "AI · drafts the message" },
      { kind: "brand", brand: "Slack", title: "Escalate to a human", sub: "Action · only if needed" },
    ],
  },
  {
    id: "inbox",
    tags: ["Email", "AI", "Notion"],
    name: "Inbox triage on autopilot",
    desc: "Read every email overnight, summarize the ones that matter, and log them where they belong.",
    nodes: [
      { kind: "brand", brand: "Gmail", title: "New email overnight", sub: "Trigger · Gmail" },
      { kind: "brand", brand: "OpenAI", title: "Summarize what matters", sub: "AI · reads & ranks" },
      { kind: "brand", brand: "Notion", title: "Log it where it belongs", sub: "Action · Notion" },
    ],
  },
  {
    id: "reviews",
    tags: ["Shopify", "SMS"],
    name: "Reviews customers actually leave",
    desc: "Time the ask, personalize the wording, and quietly skip the unhappy ones.",
    nodes: [
      { kind: "brand", brand: "Shopify", title: "Order delivered", sub: "Trigger · Shopify" },
      { kind: "clock", title: "Wait for the right moment", sub: "Delay · perfect timing" },
      { kind: "brand", brand: "Twilio", title: "Text the review link", sub: "Action · SMS" },
    ],
  },
  {
    id: "leads",
    tags: ["Forms", "Calendar", "CRM"],
    name: "Lead handoff that loses no one",
    desc: "Form in, call booked, CRM updated, team pinged — all in one breath.",
    nodes: [
      { kind: "brand", brand: "Typeform", title: "New form submitted", sub: "Trigger · Typeform" },
      { kind: "brand", brand: "Calendar", title: "Book the call", sub: "Action · Calendar" },
      { kind: "brand", brand: "HubSpot", title: "Update the CRM", sub: "Action · HubSpot" },
      { kind: "brand", brand: "Slack", title: "Ping #sales", sub: "Action · Slack" },
    ],
  },
];

const CYCLE_MS = 4400;

function ChainNodeIcon({ node }: { node: ChainNode }) {
  if (node.kind === "clock") return <ClockIcon size={22} />;
  return <BrandTile label={node.brand} size={24} />;
}

export function MarketingShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % CASES.length), CYCLE_MS);
    return () => clearInterval(t);
  }, [paused]);

  const c = CASES[active]!;

  return (
    <section
      className="mk-sw"
      id="examples"
      aria-labelledby="mk-sw-h"
      data-testid="marketing-showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mk-sw-inner">
        <div className="mk-sw-head">
          <div className="mk-sw-eyebrow">Selected automations</div>
          <h2 id="mk-sw-h" className="mk-sw-h">Real automations our customers run every day.</h2>
        </div>

        <div className="mk-sw-grid">
          <div className="mk-sw-list" role="tablist" aria-label="Example automations">
            {CASES.map((it, i) => (
              <button
                key={it.id}
                type="button"
                role="tab"
                aria-selected={active === i}
                className={"mk-sw-item" + (active === i ? " is-on" : "")}
                data-testid="marketing-showcase-item"
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="mk-sw-item-top">
                  <span className="mk-sw-item-no">0{i + 1}</span>
                  <span className="mk-sw-item-tags">{it.tags.map((t) => <span key={t}>{t}</span>)}</span>
                </span>
                <span className="mk-sw-item-name">{it.name}</span>
                <span className="mk-sw-item-desc">{it.desc}</span>
                <span className="mk-sw-item-bar"><span /></span>
              </button>
            ))}
          </div>

          <div className="mk-sw-panel" aria-hidden>
            <div className="mk-sw-panel-glow" />
            <div className="mk-sw-panel-h">
              <div className="mk-sw-panel-tags">{c.tags.map((t) => <span key={t}>{t}</span>)}</div>
              <div className="mk-sw-panel-name">{c.name}</div>
            </div>

            <div className="mk-sw-chain" key={active}>
              <div className="mk-sw-spine" />
              <div className="mk-sw-flow" />
              {c.nodes.map((n, i) => (
                <div key={n.title} className="mk-sw-node" style={{ ["--d" as string]: `${i * 0.09}s` } as CSSProperties}>
                  <div className="mk-sw-node-ico"><ChainNodeIcon node={n} /></div>
                  <div className="mk-sw-node-meta">
                    <div className="mk-sw-node-title">{n.title}</div>
                    <div className="mk-sw-node-sub">{n.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mk-sw { padding: 120px 0; border-top: 1px solid var(--mk-border); }
        .mk-sw-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
        .mk-sw-head { margin-bottom: 56px; }
        .mk-sw-eyebrow { font-size: 13px; color: var(--mk-muted); margin-bottom: 16px; }
        .mk-sw-h { font-size: clamp(28px, 3.4vw, 48px); letter-spacing: -0.025em; line-height: 1.08; font-weight: 500; margin: 0; max-width: 720px; color: var(--mk-text); }

        .mk-sw-grid { display: grid; grid-template-columns: 1fr 1.05fr; gap: 28px; align-items: start; }
        @media (max-width: 960px) { .mk-sw-grid { grid-template-columns: 1fr; } }

        .mk-sw-list { display: flex; flex-direction: column; }
        .mk-sw-item {
          position: relative; text-align: left; background: transparent; border: 0;
          padding: 22px 0 24px; border-top: 1px solid var(--mk-border); cursor: pointer;
          display: block; width: 100%; color: inherit;
        }
        .mk-sw-item:first-child { border-top: 0; }
        .mk-sw-item-top { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
        .mk-sw-item-no { font-family: var(--font-mono); font-size: 12px; color: var(--mk-muted-2); }
        .mk-sw-item-tags { display: flex; gap: 10px; }
        .mk-sw-item-tags span { font-size: 11.5px; color: var(--mk-muted); }
        .mk-sw-item-name {
          display: block;
          font-size: clamp(20px, 2vw, 27px); letter-spacing: -0.02em; font-weight: 500; line-height: 1.15;
          color: var(--mk-muted-2); transition: color .3s ease;
        }
        .mk-sw-item-desc {
          display: block;
          font-size: 14.5px; color: var(--mk-muted); line-height: 1.5; margin-top: 8px; max-width: 460px;
          text-wrap: pretty;
          max-height: 0; opacity: 0; overflow: hidden;
          transition: max-height .4s ease, opacity .35s ease, margin-top .4s ease;
        }
        .mk-sw-item.is-on .mk-sw-item-name { color: var(--mk-text); }
        .mk-sw-item.is-on .mk-sw-item-desc { max-height: 60px; opacity: 1; }
        .mk-sw-item-bar { display: block; height: 2px; margin-top: 18px; background: var(--mk-border); border-radius: 2px; overflow: hidden; }
        .mk-sw-item-bar span { display: block; height: 100%; width: 100%; background: var(--mk-text); transform: scaleX(0); transform-origin: left; }
        .mk-sw-item.is-on .mk-sw-item-bar span { animation: mk-sw-prog 4.4s linear forwards; }
        @keyframes mk-sw-prog { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        .mk-sw-panel { position: relative; overflow: hidden; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 20px; padding: 30px 32px 32px; }
        .mk-sw-panel-glow { position: absolute; width: 70%; height: 60%; right: -10%; top: -15%; background: radial-gradient(circle, color-mix(in oklab, var(--mk-text) 14%, transparent), transparent 70%); filter: blur(48px); pointer-events: none; }
        .mk-sw-panel-h { position: relative; margin-bottom: 26px; }
        .mk-sw-panel-tags { display: flex; gap: 12px; margin-bottom: 12px; }
        .mk-sw-panel-tags span { font-size: 11.5px; color: var(--mk-muted); font-family: var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; }
        .mk-sw-panel-name { font-size: clamp(22px, 2.2vw, 30px); letter-spacing: -0.02em; font-weight: 500; color: var(--mk-text); }
        .mk-sw-chain { position: relative; display: flex; flex-direction: column; gap: 12px; }
        .mk-sw-spine { position: absolute; left: 36px; top: 30px; bottom: 30px; width: 2px; background: linear-gradient(180deg, var(--mk-border-strong), color-mix(in oklab, var(--mk-text) 30%, transparent)); }
        .mk-sw-flow {
          position: absolute; left: 36px; width: 10px; height: 10px; border-radius: 50%; transform: translate(-4px,-50%);
          background: var(--mk-text); box-shadow: 0 0 14px 3px color-mix(in oklab, var(--mk-text) 65%, transparent);
          animation: mk-sw-travel 2.8s ease-in-out infinite;
        }
        @keyframes mk-sw-travel { 0% { top: 28px; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: calc(100% - 28px); opacity: 0; } }
        .mk-sw-node {
          position: relative; z-index: 1; display: flex; align-items: center; gap: 14px;
          background: var(--mk-panel-2); border: 1px solid var(--mk-border); border-radius: 13px; padding: 12px 15px;
          opacity: 0; transform: translateX(22px); animation: mk-sw-in .5s cubic-bezier(.2,.8,.3,1) forwards; animation-delay: var(--d);
        }
        @keyframes mk-sw-in { to { opacity: 1; transform: none; } }
        .mk-sw-node-ico { width: 42px; height: 42px; flex-shrink: 0; border-radius: 11px; background: var(--mk-panel); border: 1px solid var(--mk-border); display: flex; align-items: center; justify-content: center; color: var(--mk-text); }
        .mk-sw-node-title { font-size: 14.5px; font-weight: 600; color: var(--mk-text); letter-spacing: -0.01em; }
        .mk-sw-node-sub { font-size: 12px; color: var(--mk-muted); margin-top: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .mk-sw-flow, .mk-sw-item.is-on .mk-sw-item-bar span { animation: none; }
          .mk-sw-node { opacity: 1; transform: none; animation: none; }
        }
      `}</style>
    </section>
  );
}

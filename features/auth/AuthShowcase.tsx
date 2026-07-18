"use client";

import { useEffect, useState } from "react";
import { MarketingBrandLogo } from "@/features/marketing/MarketingBrandLogo";

/**
 * Decorative right-hand brand panel for the auth surface (Slice AUTH-DESIGN-1).
 *
 * Layout, storm/grid/glow motif, orbits, rotating card, stat row and progress
 * dots are ported from the `Auth.html` handoff's `ShowcasePanel`. Hidden below
 * 900px by `.au-show` — the design does the same, and the form column alone is
 * the complete experience.
 *
 * CONTENT DEVIATION (deliberate, per the locked project honesty rule — see the
 * header of `features/marketing/MarketingStatsBand.tsx`): the handoff's panel
 * carries three NAMED customer testimonials ("Maya T. · Ops lead, Northwind")
 * and customer-attributed metrics ("247 apps connected", "2 min idea → running",
 * "5+ hrs saved / week"). All of those are fabricated, and the same rule already
 * removed the equivalent fabrications from the v2/v5 homepage. We keep the
 * rotating cinematic and the stat band but rebuild them over claims that are
 * structurally true:
 *   - the rotating card shows EXAMPLE prompts (clearly labelled "Describe it
 *     like this"), naming only providers ChainReact actually integrates
 *     (Stripe, Slack, HubSpot, Google Drive, Google Sheets — all present in
 *     `integrations/`), not customer quotes;
 *   - the stats reuse the exact facts already approved for the homepage band:
 *     no code to write, one click to connect, runs 24/7.
 * No person, no revenue figure, no hours-saved claim, no install count.
 */

const EXAMPLE_PROMPTS = [
  "When a Stripe payment fails, post the customer and invoice to a Slack channel.",
  "Every weekday at 8am, summarise new HubSpot deals and email me the digest.",
  "When a file lands in Google Drive, pull out the details and append a row to Sheets.",
] as const;

const STATS = [
  { v: "0", k: "lines of code to write" },
  { v: "1 click", k: "to connect each app" },
  { v: "24/7", k: "running in the background" },
] as const;

const ROTATE_MS = 5200;

export function AuthShowcase({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Rotation is meaningful motion, so honour the reduced-motion preference by
    // simply not rotating — the first example stays put and nothing is lost.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % EXAMPLE_PROMPTS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <aside className="au-show">
      <div className="au-show-storm" aria-hidden>
        <div className="au-show-clouds" />
        <div className="au-show-flash" />
      </div>
      <div className="au-show-grid" aria-hidden />
      <div className="au-show-glow" aria-hidden />

      <div className="au-show-mark" aria-hidden>
        <MarketingBrandLogo size={132} wordmark={false} variant="hero" idle />
        <div className="au-show-orbit au-show-orbit-1" />
        <div className="au-show-orbit au-show-orbit-2" />
      </div>

      <div className="au-show-content">
        <div className="au-show-tagline">
          <span className="au-show-tag-k">
            {mode === "sign-up" ? "Start automating" : "Describe it. Ship it."}
          </span>
          <h2 className="au-show-tag-h">Automations that build themselves.</h2>
        </div>

        {/* key= restarts the fade each rotation, as in the handoff. */}
        <div className="au-show-card" key={index}>
          <span className="au-show-card-k">Describe it like this</span>
          <p className="au-show-card-text">{EXAMPLE_PROMPTS[index]}</p>
        </div>

        <div className="au-show-stats">
          {STATS.map((s) => (
            <div className="au-show-stat" key={s.k}>
              <div className="au-show-stat-v">{s.v}</div>
              <div className="au-show-stat-k">{s.k}</div>
            </div>
          ))}
        </div>

        <div className="au-show-dots" aria-hidden>
          {EXAMPLE_PROMPTS.map((prompt, i) => (
            <span
              key={prompt}
              className={"au-show-dot" + (i === index ? " au-show-dot-on" : "")}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

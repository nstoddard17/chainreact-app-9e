import { MarketingIntro } from "./MarketingIntro";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingHero } from "./MarketingHero";
import { MarketingLogoMarquee } from "./MarketingLogoMarquee";
import { MarketingScrollStory } from "./MarketingScrollStory";
import { MarketingShowcase } from "./MarketingShowcase";
import { MarketingMissionReveal } from "./MarketingMissionReveal";
import { MarketingStatsBand } from "./MarketingStatsBand";
import { MarketingFeatureSticky } from "./MarketingFeatureSticky";
import { MarketingEnding } from "./MarketingEnding";
import { MarketingScrollReveal } from "./MarketingScrollReveal";
import type { MarketingMarqueeProvider } from "./marqueeProviders";

/**
 * Homepage v5 — public marketing landing page (Slice 4.HOMEPAGE-V5-1).
 *
 * Upgrades the v2 homepage to the Claude Design handoff's `Homepage v5.html`
 * — the "full cinematic" version (motion-backed hero, pinned scroll
 * narratives, count-ups, layered ending). Composition mirrors the design's
 * v5 shell:
 *
 *   HomeNav → Hero(+motion) → [reveal] LogoMarquee → ScrollStory →
 *   [reveal] Showcase → MissionReveal → [reveal] StatsBand →
 *   FeatureSticky → Ending(motion + woven footer)
 *
 * Two locked decisions carried from Slice 4.HOMEPAGE-V2-1 and reconfirmed
 * with the user for v5:
 *
 *   1. HONESTY RULE — neutralize fabricated content. v5 reintroduces a
 *      named-customer testimonial ("Maria Reyes / Rey's Plumbing") + invented
 *      metrics ("$24k recovered", "$480 recovered this week", per-case stat
 *      tiles, "0 missed runs / 30 days"). NONE of it ships. The testimonial
 *      becomes a non-attributed "By the numbers" band over only structurally
 *      true facts (StatsBand); the showcase drops its stat tiles; the
 *      scroll-story receipt drops the dollar figure + fake email; the feature
 *      scenes drop the uptime metric and the drifting "247 apps". Each
 *      section's JSDoc names the specific neutralization.
 *
 *   2. DARK-ONLY — no theme toggle (the marketing nav decision). The motion
 *      field reads the dark `--mk-*` tokens; the `[data-marketing-theme=
 *      "light"]` variant CSS still ships but isn't user-switchable.
 *
 * The route shell carries `data-marketing-surface` (declared in
 * `app/globals.css`) which scopes the editorial dark palette to this page —
 * never bleeds into in-app surfaces.
 *
 * No client state lives here; interactive sub-sections (hero prompt, pinned
 * scroll sections, showcase, count-ups) are individually `"use client"`.
 */
interface Props {
  marqueeProviders: readonly MarketingMarqueeProvider[];
}

export function MarketingHome({ marqueeProviders }: Props) {
  return (
    <div data-marketing-surface data-testid="marketing-home" className="marketing-root">
      <MarketingIntro />
      <MarketingHeader />
      <main className="marketing-stack">
        <MarketingHero />
        <MarketingScrollReveal>
          <MarketingLogoMarquee providers={marqueeProviders} />
        </MarketingScrollReveal>
        <MarketingScrollStory />
        <MarketingScrollReveal>
          <MarketingShowcase />
        </MarketingScrollReveal>
        <MarketingMissionReveal />
        <MarketingScrollReveal>
          <MarketingStatsBand />
        </MarketingScrollReveal>
        <MarketingFeatureSticky />
      </main>
      <MarketingEnding />
      <style>{`
        .marketing-root {
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
        }
        .marketing-stack { position: relative; z-index: 1; }
        /* Strip the browser default underline; each link class owns its
           own color. Do NOT set 'color: inherit' here — '.marketing-root a'
           would beat per-link classes on specificity and turn the white
           pill buttons (mk-btn-primary / mk-cta) into white-on-white. */
        .marketing-root a { text-decoration: none; }
        .marketing-root ::selection {
          background: var(--mk-accent-soft);
          color: var(--mk-text);
        }
      `}</style>
    </div>
  );
}

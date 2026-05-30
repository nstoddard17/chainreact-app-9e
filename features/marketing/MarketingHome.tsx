import { MarketingHeader } from "./MarketingHeader";
import { MarketingHero } from "./MarketingHero";
import { MarketingLogoMarquee } from "./MarketingLogoMarquee";
import { MarketingFeaturedCases } from "./MarketingFeaturedCases";
import { MarketingMission } from "./MarketingMission";
import { MarketingFeatureRows } from "./MarketingFeatureRows";
import { MarketingFinalCta } from "./MarketingFinalCta";
import { MarketingFooter } from "./MarketingFooter";
import type { MarketingMarqueeProvider } from "./marqueeProviders";

/**
 * Homepage v2 — public marketing landing page (Slice 4.HOMEPAGE-V2-1).
 *
 * Composition mirrors the Claude Design handoff's `Homepage v2.html` shell
 * (HomeNav → Hero → LogoMarquee → FeaturedCases → Mission → FeatureRows →
 * FinalCta → Footer) with two intentional differences locked with the user:
 *
 *   1. The design's `StatsTestimonial` section is OMITTED — it carries a
 *      named-customer quote ("Maria Reyes · Rey's Plumbing & Heating") +
 *      customer-attributed stats. Per the project's honesty rule and
 *      page-implementation-guide.md §"No fake design-only actions" we don't
 *      ship fabricated customer claims as production content.
 *   2. The design's per-case stat tiles inside `FeaturedCases` are OMITTED
 *      (e.g. "$24k recovered per quarter / 94% delivered without owner
 *      involvement"). Same reason — fabricated numbers. The case
 *      categories, name, and description ship as illustrative copy.
 *
 * The route shell carries `data-marketing-surface` (declared in
 * `app/globals.css`) which scopes the design's editorial dark palette to
 * this page — never bleeds into the in-app surfaces. Mirrors the existing
 * `[data-builder-surface]` pattern.
 *
 * No client state lives here; sub-sections that need interactivity (typed
 * hero prompt, expandable feature rows) are individually `"use client"`.
 */
interface Props {
  marqueeProviders: readonly MarketingMarqueeProvider[];
}

export function MarketingHome({ marqueeProviders }: Props) {
  return (
    <div
      data-marketing-surface
      data-testid="marketing-home"
      className="marketing-root"
    >
      <MarketingHeader />
      <main className="marketing-stack">
        <MarketingHero />
        <MarketingLogoMarquee providers={marqueeProviders} />
        <MarketingFeaturedCases />
        <MarketingMission />
        <MarketingFeatureRows />
        <MarketingFinalCta />
      </main>
      <MarketingFooter />
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

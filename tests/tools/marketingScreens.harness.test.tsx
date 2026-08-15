/**
 * RESPONSIVE-MARKETING-9 — public marketing funnel visual harness (NOT a behavioural test).
 *
 * Same approach as the accepted harnesses: render the REAL marketing components
 * with synthetic public content, write the markup to `owner-review/html/mk-*.html`,
 * and let `scripts/responsive/measure-marketing.mjs` measure it
 * continuously from 360→1600 in Chromium.
 *
 * AUDITED SURFACE — the actual public route tree, enumerated from `app/`:
 *
 *   /            → MarketingHome  (signed-in visitors are server-redirected away)
 *   /pricing     → PricingPage
 *   /help        → HelpCenterPage
 *   /help/[slug] → HelpArticlePage
 *   /terms       → TermsPage
 *   /privacy     → PrivacyPage
 *   /security    → SecurityPage
 *
 * `/integrations` is a permanent redirect to the AUTHENTICATED `/apps`, so it has
 * no public layout. `/start` and `/apps` and `/templates` are authenticated
 * surfaces already covered by their own accepted batches.
 *
 * NOT PRESENT anywhere on the public surface, so deliberately not fixtured (the
 * brief lists them as "where present"): an about/company page, a contact or
 * demo-request page, a public status/trust page, a cookie or consent banner, an
 * announcement bar, a public integrations directory, a public templates gallery,
 * a testimonial carousel, and a custom not-found/error page. None of these ship.
 *
 * FIXTURE SAFETY: every exaggerated value is synthetic public marketing copy. No
 * production customer data, no real names, no tokens, no secrets.
 */
import type { ReactNode } from "react";
import { render, fireEvent } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { MarketingHeader } from "@/features/marketing/MarketingHeader";
import { MarketingFooter } from "@/features/marketing/MarketingFooter";
import { MarketingHero } from "@/features/marketing/MarketingHero";
import { PricingPage } from "@/features/marketing/PricingPage";
import { TermsPage } from "@/features/marketing/TermsPage";
import { PrivacyPage } from "@/features/marketing/PrivacyPage";
import { SecurityPage } from "@/features/marketing/SecurityPage";
import { HelpCenterPage } from "@/features/marketing/HelpCenterPage";
import { HelpArticlePage } from "@/features/marketing/HelpArticlePage";
import { HELP_ARTICLES } from "@/features/marketing/help/helpCatalog";

const OUT = join(process.cwd(), "owner-review", "html");

function emit(name: string, ui: ReactNode) {
  const { container, unmount } = render(<>{ui}</>);
  const html = container.innerHTML;
  expect(html.length).toBeGreaterThan(0);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `mk-${name}.html`), html, "utf8");
  unmount();
}

/** A public marketing page frame — the surface token scope plus the shared chrome. */
function Page({ children, authed = false }: { children: ReactNode; authed?: boolean }) {
  return (
    <div data-marketing-surface className="marketing-root">
      <MarketingHeader authenticated={authed} />
      <main className="marketing-stack">{children}</main>
      <MarketingFooter />
    </div>
  );
}

describe("RESPONSIVE-MARKETING-9 — public funnel fixtures", () => {
  it("writes the shared chrome states", () => {
    emit("01-header-signed-out", <Page>{null}</Page>);
    emit("02-header-authenticated", <Page authed>{null}</Page>);
    emit("03-footer", <MarketingFooter />);
  });

  it("writes the mobile navigation states", () => {
    // The collapsed menu OPEN is the state that did not exist before this slice —
    // below 960px the five links previously had no presentation at all.
    const { container, unmount } = render(<Page>{null}</Page>);
    fireEvent.click(container.querySelector('[data-testid="marketing-nav-toggle"]')!);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "mk-10-nav-open.html"), container.innerHTML, "utf8");
    unmount();
  });

  it("writes the homepage hero states", () => {
    emit("04-hero", <Page><MarketingHero /></Page>);
  });

  it("writes the pricing states", () => {
    // The full pricing page: plan cards, billing toggle, the 720px comparison
    // matrix, the FAQ and the enterprise CTA all in one document, which is how a
    // visitor actually meets them.
    emit("05-pricing", <PricingPage />);
  });

  it("writes the help centre states", () => {
    const providers = [
      { slug: "slack", name: "Slack", iconUrl: "/icons/slack.svg" },
      { slug: "gmail", name: "Gmail", iconUrl: "/icons/gmail.svg" },
      { slug: "hubspot", name: "HubSpot", iconUrl: "/icons/hubspot.svg" },
    ];
    emit("06-help-centre", <HelpCenterPage providers={providers as never} />);

    // The longest article in the catalog — the one most likely to contain a long
    // heading, a bare URL, a table or a code block.
    const article = HELP_ARTICLES[HELP_ARTICLES.length - 1] ?? HELP_ARTICLES[0];
    if (article) emit("07-help-article", <HelpArticlePage article={article} />);
  });

  it("writes the long-form legal pages", () => {
    emit("08-legal-terms", <TermsPage />);
    // Privacy + Security joined the measured corpus with
    // GOOGLE-PRIVACY-LIMITED-USE-CLOSEOUT-1: the Google API User Data and
    // data-protection sections are Google-review surfaces, so the 360→1600
    // sweep must prove them contained and legible, not just the Terms idiom.
    emit("11-legal-privacy", <PrivacyPage />);
    emit("12-legal-security", <SecurityPage />);
  });

  it("writes the hostile-content states", () => {
    // The pathological public values: a headline with a very long unbroken word,
    // a plan name that outgrows its card, and a bare URL of the kind a help
    // article or legal page legitimately contains. Each is the thing most likely
    // to establish a minimum width, and all three are synthetic.
    emit(
      "09-long-unbroken-values",
      <Page>
        <section className="mk-hero">
          <div className="mk-hero-inner">
            <h1 className="mk-hero-h">
              <span>Automations for</span>
              <span>Unternehmensressourcenplanungssoftwarelieferantenmanagement</span>
            </h1>
            <p className="mk-hero-lead">
              Reference https://docs.chainreact.example/integrations/enterprise-resource-planning/configuration-and-field-mapping-guide?section=advanced&amp;revision=2026-07-31
              covers the full setup.
            </p>
          </div>
        </section>
      </Page>,
    );
  });
});

/**
 * Tests for features/marketing/MarketingHome (Slice 4.HOMEPAGE-V2-1).
 *
 * Asserts the page-level contract:
 *   - Composes the design's Homepage v2 section stack (hero, marquee,
 *     featured cases, mission, feature rows, final CTA, footer).
 *   - Carries the `[data-marketing-surface]` scope (token isolation).
 *   - Exposes a single `<h1>` (a11y) — the hero headline. Section headers
 *     are `<h2>`.
 *   - OMITS the design's `StatsTestimonial` (named-customer claims).
 *   - OMITS per-case stat tiles (fabricated numbers).
 *   - OMITS the design's footer newsletter form (no real backend).
 *   - Wires real V2 routes for the primary CTAs (sign-in / sign-up /
 *     integrations).
 *
 * No state, no fetches, no client API calls — render snapshot is enough.
 */
import { render, screen, within } from "@testing-library/react";

import { MarketingHome } from "@/features/marketing/MarketingHome";

const PROVIDERS = [
  { id: "stripe", label: "Stripe", iconUrl: "/integrations/stripe.svg" },
  { id: "slack", label: "Slack", iconUrl: "/integrations/slack.svg" },
];

function renderHome() {
  return render(<MarketingHome marqueeProviders={PROVIDERS} />);
}

describe("MarketingHome — composition + token scope", () => {
  it("renders every section the slice ships and wraps them in the marketing surface", () => {
    renderHome();
    const surface = screen.getByTestId("marketing-home");
    expect(surface).toHaveAttribute("data-marketing-surface");
    expect(screen.getByTestId("marketing-hero-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-marquee")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-cases")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-mission")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-feature-rows")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-final-cta")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
  });

  it("exposes exactly one <h1> (the hero headline) for a11y", () => {
    renderHome();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("MarketingHome — locked deferrals (no fabricated claims)", () => {
  it("does NOT render the design's StatsTestimonial section (named customer + dollar figures)", () => {
    renderHome();
    // The testimonial's named subject was 'Maria Reyes' / 'Rey's Plumbing & Heating'.
    expect(screen.queryByText(/Maria Reyes/i)).toBeNull();
    expect(screen.queryByText(/Rey's Plumbing/i)).toBeNull();
    // Hour / dollar boasts that lived in the testimonial.
    expect(screen.queryByText(/18\s*hrs?/i)).toBeNull();
    expect(screen.queryByText(/\$3,?200/)).toBeNull();
  });

  it("does NOT render fabricated per-case stat tiles inside FeaturedCases", () => {
    renderHome();
    const cases = screen.getByTestId("marketing-cases");
    // The design's case stats — "$24k recovered per quarter", "94% delivered",
    // "5+ hrs saved every week", "4.2× more 5-star Google reviews", "0 leads
    // slipped through the cracks", etc. — must all be absent.
    expect(within(cases).queryByText(/\$24k/i)).toBeNull();
    expect(within(cases).queryByText(/94%/)).toBeNull();
    expect(within(cases).queryByText(/5\+?\s*hrs/i)).toBeNull();
    expect(within(cases).queryByText(/4\.2×/)).toBeNull();
    expect(within(cases).queryByText(/leads slipped through/i)).toBeNull();
  });

  it("does NOT render the footer newsletter form (no backend exists)", () => {
    renderHome();
    const footer = screen.getByTestId("marketing-footer");
    expect(within(footer).queryByPlaceholderText(/your@email\.com/i)).toBeNull();
    // The "Get tips" submit button from the design.
    expect(within(footer).queryByRole("button", { name: /get tips/i })).toBeNull();
  });
});

describe("MarketingHome — CTA wiring to real V2 routes", () => {
  it("nav 'Sign in' and 'Try it free' route to /auth/sign-in and /auth/sign-up", () => {
    renderHome();
    expect(screen.getByTestId("marketing-nav-signin")).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
    expect(screen.getByTestId("marketing-nav-tryfree")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });

  it("hero 'Start building' and final CTA both route to /auth/sign-up", () => {
    renderHome();
    expect(screen.getByTestId("marketing-hero-start")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.getByTestId("marketing-final-cta-link")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });

  it("footer 'Apps' link routes to /apps (Slice 4.APPS-PAGE-1 — repointed from legacy /integrations)", () => {
    renderHome();
    const footer = screen.getByTestId("marketing-footer");
    const appsLink = within(footer).getByRole("link", { name: /^apps$/i });
    expect(appsLink).toHaveAttribute("href", "/apps");
  });
});

describe("MarketingHome — LogoMarquee renders real registry-derived chips", () => {
  it("renders one chip per provider, no extras (the marquee doubles the row internally for the seamless loop)", () => {
    renderHome();
    const marquee = screen.getByTestId("marketing-marquee");
    const items = within(marquee).getAllByTestId("marketing-marquee-item");
    // Doubled row for seamless CSS scroll: 2 × providers.length.
    expect(items.length).toBe(PROVIDERS.length * 2);
    // Each carries the resolved provider id (no raw config).
    for (const it of items) {
      const id = it.getAttribute("data-provider-id");
      expect(id).not.toBeNull();
      expect(PROVIDERS.map((p) => p.id)).toContain(id);
    }
  });

  it("renders nothing when no providers are passed (defensive)", () => {
    render(<MarketingHome marqueeProviders={[]} />);
    expect(screen.queryByTestId("marketing-marquee")).toBeNull();
  });
});

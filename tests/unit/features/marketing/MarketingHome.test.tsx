/**
 * Tests for features/marketing/MarketingHome (Slice 4.HOMEPAGE-V5-1).
 *
 * Asserts the v5 page-level contract:
 *   - Composes the design's Homepage v5 section stack (hero, marquee,
 *     scroll-story, showcase, mission, stats band, feature-sticky, ending).
 *   - Carries the `[data-marketing-surface]` scope (token isolation).
 *   - Exposes a single `<h1>` (a11y) — the hero headline. Section headers
 *     are `<h2>`.
 *   - HONESTY (neutralized): NO named-customer testimonial, NO fabricated
 *     metrics ($24k / $480 / 18 hrs / $3,200 / 94% / 4.2× / drifting "247
 *     apps"), NO showcase stat tiles, NO footer newsletter form.
 *   - Wires real V2 routes for the primary CTAs (sign-in / sign-up / apps).
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

describe("MarketingHome — v5 composition + token scope", () => {
  it("renders every v5 section and wraps them in the marketing surface", () => {
    renderHome();
    const surface = screen.getByTestId("marketing-home");
    expect(surface).toHaveAttribute("data-marketing-surface");
    expect(screen.getByTestId("marketing-hero-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-marquee")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-scroll-story")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-showcase")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-mission")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-stats-band")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-feature-sticky")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-ending")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
  });

  it("exposes exactly one <h1> (the hero headline) for a11y", () => {
    renderHome();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("MarketingHome — honesty (no fabricated claims)", () => {
  it("does NOT render the design's named-customer testimonial", () => {
    renderHome();
    expect(screen.queryByText(/Maria Reyes/i)).toBeNull();
    expect(screen.queryByText(/Rey's Plumbing/i)).toBeNull();
    expect(screen.queryByText(/18\s*hrs?/i)).toBeNull();
    expect(screen.queryByText(/\$3,?200/)).toBeNull();
  });

  it("does NOT render fabricated per-case stat tiles in the showcase", () => {
    renderHome();
    const showcase = screen.getByTestId("marketing-showcase");
    expect(within(showcase).queryByText(/\$24k/i)).toBeNull();
    expect(within(showcase).queryByText(/94%/)).toBeNull();
    expect(within(showcase).queryByText(/4\.2×/)).toBeNull();
    expect(within(showcase).queryByText(/leads slipped/i)).toBeNull();
  });

  it("does NOT render the scroll-story's fabricated recovered-dollar receipt or fake email", () => {
    renderHome();
    const story = screen.getByTestId("marketing-scroll-story");
    expect(within(story).queryByText(/\$480/)).toBeNull();
    expect(within(story).queryByText(/@northwind/i)).toBeNull();
  });

  it("softens the drifting '247 apps' claim in the feature section", () => {
    renderHome();
    const feature = screen.getByTestId("marketing-feature-sticky");
    expect(within(feature).queryByText(/247/)).toBeNull();
  });

  it("does NOT render a footer newsletter form (no backend exists)", () => {
    renderHome();
    const footer = screen.getByTestId("marketing-footer");
    expect(within(footer).queryByPlaceholderText(/your@email\.com/i)).toBeNull();
    expect(within(footer).queryByRole("button", { name: /get tips|subscribe/i })).toBeNull();
  });
});

describe("MarketingHome — CTA wiring to real V2 routes", () => {
  it("nav 'Sign in' and 'Try it free' route to /auth/sign-in and /auth/sign-up", () => {
    renderHome();
    expect(screen.getByTestId("marketing-nav-signin")).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByTestId("marketing-nav-tryfree")).toHaveAttribute("href", "/auth/sign-up");
  });

  it("hero 'Start building' and the ending CTA both route to /auth/sign-up", () => {
    renderHome();
    expect(screen.getByTestId("marketing-hero-start")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("marketing-final-cta-link")).toHaveAttribute("href", "/auth/sign-up");
  });

  it("footer 'Apps' link routes to /apps", () => {
    renderHome();
    const footer = screen.getByTestId("marketing-footer");
    const appsLink = within(footer).getByRole("link", { name: /^apps$/i });
    expect(appsLink).toHaveAttribute("href", "/apps");
  });
});

describe("MarketingHome — LogoMarquee renders real registry-derived chips", () => {
  it("renders one chip per provider, doubled for the seamless loop", () => {
    renderHome();
    const marquee = screen.getByTestId("marketing-marquee");
    const items = within(marquee).getAllByTestId("marketing-marquee-item");
    expect(items.length).toBe(PROVIDERS.length * 2);
    for (const it of items) {
      const id = it.getAttribute("data-provider-id");
      expect(id).not.toBeNull();
      expect(PROVIDERS.map((p) => p.id)).toContain(id);
    }
  });

  it("renders no marquee when no providers are passed (defensive), other sections still render", () => {
    render(<MarketingHome marqueeProviders={[]} />);
    expect(screen.queryByTestId("marketing-marquee")).toBeNull();
    expect(screen.getByTestId("marketing-showcase")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-ending")).toBeInTheDocument();
  });
});

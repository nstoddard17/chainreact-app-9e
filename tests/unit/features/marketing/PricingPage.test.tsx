/**
 * Tests for features/marketing/PricingPage (Slice 4.PRICING-1).
 *
 * Asserts the page-level contract:
 *   - Composes the marketing shell (header + footer) and carries the
 *     `[data-marketing-surface]` token scope.
 *   - Exposes exactly one <h1> (the hero headline); sections are <h2>.
 *   - Renders all FIVE real plan tiers from core/billing/planPolicy.
 *   - Wires real V2 routes: sign-up for free/pro/team + hero/final; sales
 *     mailto for business/enterprise.
 *   - HONESTY: NO invented dollar prices ($19 / $49), NO "Save 20%" annual
 *     toggle, NO billed-yearly copy, and NO absolute SOC 2 / SSO / SCIM /
 *     HIPAA / SLA enterprise claims.
 *   - Surfaces the real policy numbers (AI credits 2,000 / 10,000).
 *
 * No state, no fetches — render snapshot is enough (pure server component).
 */
import { render, screen } from "@testing-library/react";

import { PricingPage } from "@/features/marketing/PricingPage";

describe("PricingPage — composition + token scope", () => {
  it("wraps the page in the marketing surface and renders header + footer", () => {
    render(<PricingPage />);
    const surface = screen.getByTestId("pricing-page");
    expect(surface).toHaveAttribute("data-marketing-surface");
    expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-compare")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-faq")).toBeInTheDocument();
  });

  it("exposes exactly one <h1> (the hero headline) for a11y", () => {
    render(<PricingPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/pricing that scales/i);
  });

  it("renders all five real plan tiers", () => {
    render(<PricingPage />);
    for (const tier of ["free", "pro", "team", "business", "enterprise"]) {
      expect(screen.getByTestId(`pricing-card-${tier}`)).toBeInTheDocument();
    }
  });
});

describe("PricingPage — CTA wiring to real V2 routes", () => {
  it("free / pro / team cards + hero + final CTAs route to /auth/sign-up", () => {
    render(<PricingPage />);
    expect(screen.getByTestId("pricing-cta-free")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("pricing-cta-pro")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("pricing-cta-team")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("pricing-hero-get-started")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("pricing-final-get-started")).toHaveAttribute("href", "/auth/sign-up");
  });

  it("business / enterprise + final contact route to the sales mailto (no fake checkout)", () => {
    render(<PricingPage />);
    const mailto = "mailto:sales@chainreact.app";
    expect(screen.getByTestId("pricing-cta-business")).toHaveAttribute("href", mailto);
    expect(screen.getByTestId("pricing-cta-enterprise")).toHaveAttribute("href", mailto);
    expect(screen.getByTestId("pricing-final-contact")).toHaveAttribute("href", mailto);
  });
});

describe("PricingPage — honesty (no invented pricing / overpromised features)", () => {
  it("shows the real launch prices (month-to-month) for Free / Pro / Team / Business", () => {
    render(<PricingPage />);
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
    expect(screen.getByText("$75")).toBeInTheDocument();
    expect(screen.getByText("$249")).toBeInTheDocument();
    // Annual per-month prices appear in each paid card's sub-line.
    expect(screen.getByText(/\$19\/mo billed annually/i)).toBeInTheDocument();
    expect(screen.getByText(/\$59\/mo billed annually/i)).toBeInTheDocument();
    expect(screen.getByText(/\$199\/mo billed annually/i)).toBeInTheDocument();
  });

  it("keeps Enterprise as Custom and shows no fake 'Save 20%' toggle", () => {
    render(<PricingPage />);
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
    expect(screen.queryByText(/save\s*~?\s*20\s*%/i)).toBeNull();
  });

  it("removes the unfinished placeholder copy", () => {
    render(<PricingPage />);
    expect(screen.queryByText(/price at launch/i)).toBeNull();
    expect(screen.queryByText(/may change as ChainReact moves toward broader launch/i)).toBeNull();
    expect(screen.queryByText(/may change before launch/i)).toBeNull();
  });

  it("does NOT make absolute compliance/security claims for Enterprise", () => {
    render(<PricingPage />);
    expect(screen.queryByText(/SOC\s*2/i)).toBeNull();
    expect(screen.queryByText(/\bSSO\b/)).toBeNull();
    expect(screen.queryByText(/SCIM/i)).toBeNull();
    expect(screen.queryByText(/HIPAA/i)).toBeNull();
    expect(screen.queryByText(/\bSLA\b/)).toBeNull();
  });

  it("surfaces the real policy AI-credit numbers (2,000 / 10,000)", () => {
    render(<PricingPage />);
    expect(screen.getAllByText(/2,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10,000/).length).toBeGreaterThan(0);
  });

  it("includes the team credential-trust line", () => {
    render(<PricingPage />);
    // Appears in both the team-section pull quote and FAQ answer — assert presence, not uniqueness.
    expect(
      screen.getAllByText(/team-visible does not automatically mean team-runnable/i).length,
    ).toBeGreaterThan(0);
  });
});

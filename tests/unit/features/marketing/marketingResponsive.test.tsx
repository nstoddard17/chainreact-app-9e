/**
 * RESPONSIVE-MARKETING-9 — rendered proof for the public funnel hardening.
 *
 * The geometry lives in the browser sweep
 * (`scripts/trash/responsive-foundation/measure-marketing.mjs`). This file exists
 * because the batch's most important defect is one geometry CANNOT see.
 *
 * The marketing header used to drop its five primary links at 960px with
 * `display: none` and nothing to replace them. Measured: that produces ZERO
 * containment failures, ZERO legibility failures and ZERO panning failures —
 * nothing overflows, nothing is compressed, the page is simply missing its
 * navigation. A visitor on a phone could not reach Pricing. A pixel sweep will
 * never report that, so the assertion has to be behavioural: the same
 * destinations must still be REACHABLE, from ONE set of controls.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MarketingHeader } from "@/features/marketing/MarketingHeader";
import { MarketingNav, NAV_LINKS } from "@/features/marketing/MarketingNav";
import { MarketingFooter } from "@/features/marketing/MarketingFooter";
import { PricingPage } from "@/features/marketing/PricingPage";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("public navigation stays reachable when it collapses", () => {
  it("exposes a menu trigger so the links have somewhere to go", () => {
    render(<MarketingNav />);
    const toggle = screen.getByTestId("marketing-nav-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", screen.getByTestId("marketing-nav-links").id);
  });

  it("keeps every primary destination reachable from the one nav element", () => {
    render(<MarketingNav />);
    const nav = screen.getByTestId("marketing-nav-links");
    for (const link of NAV_LINKS) {
      expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute(
        "href",
        link.href,
      );
    }
  });

  it("renders exactly ONE nav element and ONE link per destination", () => {
    // The duplication failure mode: a desktop row beside a separate mobile menu,
    // where the two can drift apart in what they offer.
    const { container } = render(<MarketingHeader />);
    expect(container.querySelectorAll('[data-testid="marketing-nav-links"]')).toHaveLength(1);
    for (const link of NAV_LINKS) {
      expect(screen.getAllByRole("link", { name: link.label })).toHaveLength(1);
    }
  });

  it("toggles open and closed from the same state source", () => {
    render(<MarketingNav />);
    const toggle = screen.getByTestId("marketing-nav-toggle");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<MarketingNav />);
    const toggle = screen.getByTestId("marketing-nav-toggle");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle);
  });

  it("closes after following a link, so the panel never traps the next page", () => {
    render(<MarketingNav />);
    const toggle = screen.getByTestId("marketing-nav-toggle");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("link", { name: "Pricing" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("declares a legibility floor on the allocated nav region", () => {
    render(<MarketingNav />);
    const nav = screen.getByTestId("marketing-nav-links");
    expect(nav).toHaveAttribute("data-legible-min", "150");
    expect(nav).toHaveAttribute("data-legible-what", "primary navigation");
  });
});

describe("the auth handoff survives the collapse", () => {
  it("keeps both signed-out CTAs and their destinations", () => {
    render(<MarketingHeader />);
    expect(screen.getByTestId("marketing-nav-signin")).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByTestId("marketing-nav-tryfree")).toHaveAttribute("href", "/auth/sign-up");
  });

  it("swaps to the single app CTA when the visitor is signed in, unchanged", () => {
    render(<MarketingHeader authenticated />);
    expect(screen.getByTestId("marketing-nav-open-app")).toHaveAttribute("href", "/workflows");
    expect(screen.queryByTestId("marketing-nav-signin")).toBeNull();
    expect(screen.queryByTestId("marketing-nav-tryfree")).toBeNull();
  });

  it("still renders exactly one signup CTA in the header", () => {
    render(<MarketingHeader />);
    expect(screen.getAllByTestId("marketing-nav-tryfree")).toHaveLength(1);
  });
});

describe("pricing keeps its data complete and its scroller declared", () => {
  it("declares that the comparison SECTION must never pan", () => {
    const { container } = render(<PricingPage />);
    const section = container.querySelector("#compare");
    expect(section).toHaveAttribute("data-no-pan-below", "1600");
  });

  it("keeps the matrix itself free to scroll, and keyboard-reachable", () => {
    // The matrix is the one place on the public funnel where contained panning is
    // the right answer, so it must NOT carry a no-pan declaration of its own.
    render(<PricingPage />);
    const scroller = screen.getByTestId("pricing-compare");
    expect(scroller).not.toHaveAttribute("data-no-pan-below");
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller).toHaveAttribute("role", "region");
  });

  it("tells a narrow-screen visitor that the matrix scrolls", () => {
    // An undiscoverable scroller is its own defect.
    render(<PricingPage />);
    expect(screen.getByTestId("pricing-compare-hint")).toBeInTheDocument();
  });

  it("hides NO comparison row at narrow widths — the data stays complete", () => {
    // The failure this forbids is "make it fit by dropping features". The rows
    // are in one DOM at every width; only the scroll presentation changes.
    const { container } = render(<PricingPage />);
    const rows = container.querySelectorAll("#compare tbody tr");
    expect(rows.length).toBeGreaterThan(10);
    for (const row of Array.from(rows)) {
      expect(row.className).not.toMatch(/hidden|sm:hidden|md:hidden|lg:hidden/);
    }
  });

  it("keeps every plan column present in the matrix header", () => {
    const { container } = render(<PricingPage />);
    const planCols = container.querySelectorAll("#compare thead .pr-cmp-plan-name");
    expect(planCols.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the public surface does not mask overflow or duplicate controls", () => {
  it("renders one footer with its legal destinations reachable", () => {
    const { container } = render(<MarketingFooter />);
    expect(container.querySelectorAll('[data-testid="marketing-footer"]')).toHaveLength(1);
    for (const href of ["/terms", "/privacy"]) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});

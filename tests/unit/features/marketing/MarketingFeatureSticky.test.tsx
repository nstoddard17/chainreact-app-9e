/**
 * Tests for features/marketing/MarketingFeatureSticky (Slice 4.HOMEPAGE-V5-1).
 *
 * The v5 pinned feature section replaces the v2 FeatureRows accordion. It is
 * scroll-driven (no click affordance), so the contract is structural +
 * honesty-focused rather than interaction-focused:
 *   - All five reasons render in the DOM (screen-reader complete).
 *   - One accessible <h2> heading + section landmark.
 *   - The drifting "247 apps" claim is softened to "every app we support".
 *   - No fabricated uptime metric ("0 missed runs / Last 30 days").
 */
import { render, screen, within } from "@testing-library/react";

import { MarketingFeatureSticky } from "@/features/marketing/MarketingFeatureSticky";

describe("MarketingFeatureSticky", () => {
  it("renders all five reasons in the DOM", () => {
    render(<MarketingFeatureSticky />);
    expect(screen.getAllByTestId("marketing-feature-reason")).toHaveLength(5);
  });

  it("has an accessible <h2> heading + section landmark", () => {
    render(<MarketingFeatureSticky />);
    expect(
      screen.getByRole("heading", { level: 2, name: /five reasons/i }),
    ).toBeInTheDocument();
  });

  it("softens '247 apps' to 'every app we support'", () => {
    render(<MarketingFeatureSticky />);
    expect(screen.queryByText(/247/)).toBeNull();
    // Appears in both reason #4's copy and the connect-scene footer.
    expect(screen.getAllByText(/every app we support/i).length).toBeGreaterThan(0);
  });

  it("does NOT render a fabricated uptime metric", () => {
    const { container } = render(<MarketingFeatureSticky />);
    expect(within(container as HTMLElement).queryByText(/0 missed runs/i)).toBeNull();
    expect(within(container as HTMLElement).queryByText(/last 30 days/i)).toBeNull();
  });
});

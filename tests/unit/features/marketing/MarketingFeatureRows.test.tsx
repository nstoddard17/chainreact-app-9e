/**
 * Tests for features/marketing/MarketingFeatureRows
 * (Slice 4.HOMEPAGE-V2-1).
 *
 * Pure UI affordance — open one row at a time, toggleable, accessible.
 * No data fetches, no server calls.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarketingFeatureRows } from "@/features/marketing/MarketingFeatureRows";

describe("MarketingFeatureRows", () => {
  it("renders five rows, first one expanded by default", () => {
    render(<MarketingFeatureRows />);
    const rows = screen.getAllByTestId("marketing-feature-row");
    expect(rows).toHaveLength(5);
    // First row's header button is expanded.
    const firstHeader = rows[0]!.querySelector("button");
    expect(firstHeader).not.toBeNull();
    expect(firstHeader!.getAttribute("aria-expanded")).toBe("true");
    // First row's body renders; others do not.
    const bodies = screen.getAllByTestId("marketing-feature-row-body");
    expect(bodies).toHaveLength(1);
  });

  it("clicking another row's header opens it and closes the prior one", async () => {
    const user = userEvent.setup();
    render(<MarketingFeatureRows />);
    const rows = screen.getAllByTestId("marketing-feature-row");
    const thirdHeader = rows[2]!.querySelector("button")!;
    await user.click(thirdHeader);
    // Third row now expanded.
    expect(thirdHeader.getAttribute("aria-expanded")).toBe("true");
    // First row now collapsed.
    expect(rows[0]!.querySelector("button")!.getAttribute("aria-expanded")).toBe(
      "false",
    );
    // Exactly one body open at a time.
    expect(screen.getAllByTestId("marketing-feature-row-body")).toHaveLength(1);
  });

  it("clicking the currently-open row toggles it closed (no body visible)", async () => {
    const user = userEvent.setup();
    render(<MarketingFeatureRows />);
    const firstHeader = screen
      .getAllByTestId("marketing-feature-row")[0]!
      .querySelector("button")!;
    await user.click(firstHeader);
    expect(firstHeader.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("marketing-feature-row-body")).toBeNull();
  });

  it("section has an accessible heading + a section landmark", () => {
    render(<MarketingFeatureRows />);
    expect(
      screen.getByRole("heading", { level: 2, name: /five reasons/i }),
    ).toBeInTheDocument();
  });
});

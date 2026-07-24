/**
 * @jest-environment jsdom
 *
 * Apps-page Bridge panel (APPS-VL-DESIGN-1).
 *
 * Pure presentation over server-derived counts. Business rules protected:
 *   - the "both connected" panel states honest pairing progress + a CTA into the
 *     vehicle-links screen,
 *   - "all paired" and "some unpaired" read differently and CTA accordingly,
 *   - a Motive outage shows only the paired count (no invented total),
 *   - the "connect the other app" states point at the existing highlight deep
 *     link, never a fake connect action.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppsBridge, type AppsBridgeView } from "@/features/apps/AppsBridge";

function renderBridge(view: AppsBridgeView) {
  return render(<AppsBridge view={view} />);
}

describe("paired state", () => {
  it("shows progress and a 'pair the rest' CTA when trucks remain unpaired", () => {
    renderBridge({
      kind: "paired",
      pairedCount: 3,
      unpairedCount: 4,
      totalCount: 7,
      motiveOk: true,
      partialInventory: false,
      vehicleLinksHref: "/apps/vehicle-links",
    });
    expect(screen.getByTestId("apps-bridge-headline")).toHaveTextContent("3 of 7 trucks paired");
    const cta = screen.getByTestId("apps-bridge-cta");
    expect(cta).toHaveTextContent("Pair 4 trucks");
    expect(cta).toHaveAttribute("href", "/apps/vehicle-links");
  });

  it("reads 'all paired' and switches the CTA to Review when nothing is unpaired", () => {
    renderBridge({
      kind: "paired",
      pairedCount: 5,
      unpairedCount: 0,
      totalCount: 5,
      motiveOk: true,
      partialInventory: false,
      vehicleLinksHref: "/apps/vehicle-links",
    });
    expect(screen.getByTestId("apps-bridge-headline")).toHaveTextContent("All 5 trucks are paired");
    expect(screen.getByTestId("apps-bridge-cta")).toHaveTextContent("Review pairings");
  });

  it("shows only the paired count during a Motive outage (never an invented total)", () => {
    renderBridge({
      kind: "paired",
      pairedCount: 2,
      unpairedCount: 0,
      totalCount: 2,
      motiveOk: false,
      partialInventory: false,
      vehicleLinksHref: "/apps/vehicle-links",
    });
    expect(screen.getByTestId("apps-bridge-headline")).toHaveTextContent("2 trucks paired");
    // No progress meter is claimed while the fleet size is unknown.
    expect(screen.queryByRole("img", { name: /paired/i })).toBeNull();
  });
});

describe("connect state", () => {
  it("prompts to connect Fleetio, linking to the existing highlight deep link", () => {
    renderBridge({ kind: "connect", missing: "fleetio", highlightHref: "/apps?highlight=fleetio" });
    const cta = screen.getByTestId("apps-bridge-cta");
    expect(cta).toHaveTextContent("Connect Fleetio");
    expect(cta).toHaveAttribute("href", "/apps?highlight=fleetio");
    expect(screen.getByTestId("apps-bridge")).toHaveAttribute("data-kind", "connect");
  });

  it("prompts to connect Motive when Fleetio is the connected side", () => {
    renderBridge({ kind: "connect", missing: "motive", highlightHref: "/apps?highlight=motive" });
    expect(screen.getByTestId("apps-bridge-cta")).toHaveTextContent("Connect Motive");
    expect(screen.getByTestId("apps-bridge-cta")).toHaveAttribute("href", "/apps?highlight=motive");
  });
});

/**
 * @jest-environment jsdom
 *
 * AppCard — Motive⇄Fleetio "Vehicle links" chip (APPS-VL-DESIGN-1).
 *
 * The chip is a NAVIGATION affordance only (it opens the pairing screen, which
 * re-authorizes). Rules protected:
 *   - shown on a CONNECTED card when the page supplied `vehicleLinksHref`,
 *   - NOT shown when the href is absent (flag off / non-bridge provider),
 *   - NOT shown on a disconnected card even if an href is supplied,
 *   - it points at the supplied href.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AppCatalogItem } from "@/contracts/apps";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("@/features/integrations/ConnectButton", () => ({
  ConnectButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

import { AppCard } from "@/features/apps/AppCard";

function mkApp(over: Partial<AppCatalogItem> = {}): AppCatalogItem {
  return {
    providerId: "motive",
    name: "Motive",
    description: "Vehicles, drivers, faults.",
    iconUrl: "/integrations/motive.svg",
    category: "Fleet & Telematics",
    isConnected: true,
    needsReconnect: false,
    canConnect: true,
    restrictedToAdmins: false,
    supportsMultipleAccounts: true,
    accounts: [
      {
        id: "int-1",
        displayName: "Fleet HQ",
        connectedAt: "2026-07-01T00:00:00Z",
        canDisconnect: false,
        canReconnect: false,
        sharingStatus: "not_applicable",
        sharedWithAccount: false,
        canShare: false,
        canUnshare: false,
        needsReconnect: false,
      },
    ],
    firstConnectedAt: "2026-07-01T00:00:00Z",
    ...over,
  };
}

it("renders the chip on a connected bridge card and points at the supplied href", () => {
  render(<AppCard app={mkApp()} accountId="acc-1" vehicleLinksHref="/apps/vehicle-links" />);
  const chip = screen.getByTestId("app-card-vehicle-links");
  expect(chip).toHaveTextContent("Vehicle links");
  expect(chip).toHaveAttribute("href", "/apps/vehicle-links");
});

it("renders no chip when no href is supplied (flag off / non-bridge provider)", () => {
  render(<AppCard app={mkApp()} accountId="acc-1" />);
  expect(screen.queryByTestId("app-card-vehicle-links")).toBeNull();
});

it("renders no chip on a disconnected card even when an href is supplied", () => {
  render(
    <AppCard
      app={mkApp({ isConnected: false, accounts: [], firstConnectedAt: null })}
      accountId="acc-1"
      vehicleLinksHref="/apps/vehicle-links"
    />,
  );
  expect(screen.queryByTestId("app-card-vehicle-links")).toBeNull();
});

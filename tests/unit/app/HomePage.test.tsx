/**
 * @jest-environment node
 *
 * Tests for app/page.tsx (Slice 4.HOMEPAGE-V2-1).
 *
 * The homepage is a thin server component:
 *   - Signed-in users → redirect("/workflows")
 *   - Signed-out users → renders <MarketingHome marqueeProviders={...} />
 *
 * MarketingHome is mocked to a placeholder so this test isolates the route's
 * three responsibilities: auth gate, redirect target, and server-side
 * resolution of the curated marquee provider strip (no broken/unknown ids
 * leak through into props). We assert against the returned React element
 * (server components aren't rendered here — the page function returns the
 * element tree directly).
 */
import type * as React from "react";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockRedirect = jest.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${path}` });
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

const mockGetProvider = jest.fn();
const mockProviderIconUrl = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (id: string) => mockGetProvider(id),
  providerIconUrl: (id: string) => mockProviderIconUrl(id),
}));

const MarketingHomeType = Symbol("MarketingHome");
jest.mock("@/features/marketing/MarketingHome", () => ({
  // Identifiable component reference — JSX produced by the server page
  // points at this. We inspect the returned React element's `type` and
  // `props` directly (server components aren't rendered here; calling the
  // page returns the element tree).
  MarketingHome: Object.assign(() => null, { displayName: "MarketingHome" }),
}));
void MarketingHomeType;

import HomePage from "@/app/page";
import { MarketingHome as MarketingHomeRef } from "@/features/marketing/MarketingHome";

beforeEach(() => {
  mockGetUser.mockReset();
  mockRedirect.mockClear();
  mockGetProvider.mockReset();
  mockProviderIconUrl.mockReset();
});

describe("HomePage — auth redirect", () => {
  it("redirects signed-in users to /workflows", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    await expect(HomePage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/workflows");
  });

  it("renders MarketingHome for signed-out users (no redirect)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockGetProvider.mockImplementation((id) => ({ displayName: id.toUpperCase() }));
    mockProviderIconUrl.mockImplementation((id) => `/integrations/${id}.svg`);

    const element = (await HomePage()) as React.ReactElement;
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(element).not.toBeNull();
    expect((element as { type: unknown }).type).toBe(MarketingHomeRef);
  });
});

function readMarqueeProps(element: React.ReactElement | null | undefined) {
  if (!element) throw new Error("HomePage returned null/undefined");
  return (element.props as { marqueeProviders: ReadonlyArray<Record<string, unknown>> })
    .marqueeProviders;
}

describe("HomePage — marquee provider resolution", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("drops unknown provider ids so a renamed registry entry can't render a broken chip", async () => {
    mockGetProvider.mockImplementation((id) =>
      id === "stripe" || id === "slack" ? { displayName: id } : undefined,
    );
    mockProviderIconUrl.mockImplementation((id) => `/integrations/${id}.svg`);

    const providers = readMarqueeProps((await HomePage()) as React.ReactElement);
    const ids = providers.map((p) => p.id);
    expect(ids).toEqual(["stripe", "slack"]);
  });

  it("emits the route-safe shape (id + label + iconUrl, no internal fields)", async () => {
    mockGetProvider.mockImplementation((id) => ({
      displayName: id === "stripe" ? "Stripe" : id,
      // Intentionally inject a field that MUST NOT leak through:
      secret: "leaked-config",
    }));
    mockProviderIconUrl.mockImplementation((id) => `/integrations/${id}.svg`);

    const providers = readMarqueeProps((await HomePage()) as React.ReactElement);
    for (const entry of providers) {
      expect(Object.keys(entry).sort()).toEqual(["iconUrl", "id", "label"]);
    }
  });

  it("nulls iconUrl when providerIconUrl returns undefined", async () => {
    mockGetProvider.mockImplementation((id) =>
      id === "stripe" ? { displayName: "Stripe" } : undefined,
    );
    mockProviderIconUrl.mockReturnValue(undefined);

    const providers = readMarqueeProps((await HomePage()) as React.ReactElement);
    expect(providers).toEqual([
      { id: "stripe", label: "Stripe", iconUrl: null },
    ]);
  });
});

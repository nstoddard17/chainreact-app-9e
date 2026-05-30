/**
 * @jest-environment node
 *
 * Tests for app/integrations/page.tsx — legacy redirect to /apps
 * (Slice 4.APPS-PAGE-1).
 *
 * The product surface moved to `/apps`. The old `/integrations` URL
 * permanently redirects to `/apps`, preserving the OAuth callback's query
 * string so deep links / notification CTAs that still point at the legacy
 * URL keep working without flashing an error.
 */

const mockRedirect = jest.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), {
    digest: `NEXT_REDIRECT;${path}`,
  });
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import LegacyIntegrationsPage from "@/app/integrations/page";

beforeEach(() => {
  mockRedirect.mockClear();
});

async function invoke(params: Record<string, string | string[] | undefined>) {
  await expect(
    LegacyIntegrationsPage({ searchParams: Promise.resolve(params) }),
  ).rejects.toThrow(/NEXT_REDIRECT/);
}

describe("LegacyIntegrationsPage", () => {
  it("redirects bare /integrations → /apps", async () => {
    await invoke({});
    expect(mockRedirect).toHaveBeenCalledWith("/apps");
  });

  it("preserves the OAuth success query (?integration=connected&provider=slack)", async () => {
    await invoke({ integration: "connected", provider: "slack" });
    expect(mockRedirect).toHaveBeenCalledWith(
      "/apps?integration=connected&provider=slack",
    );
  });

  it("preserves the OAuth error query (?integration_error=user_denied)", async () => {
    await invoke({ integration_error: "user_denied" });
    expect(mockRedirect).toHaveBeenCalledWith(
      "/apps?integration_error=user_denied",
    );
  });

  it("drops empty values + array values (defensive shape coercion)", async () => {
    await invoke({ a: "", b: "x" });
    expect(mockRedirect).toHaveBeenCalledWith("/apps?b=x");
  });
});

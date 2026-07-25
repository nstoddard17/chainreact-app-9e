/**
 * @jest-environment node
 *
 * Help Center routes (HELP-CENTER-1).
 *
 * Pins the route-layer contract:
 *   - /help/[slug] serves every catalog slug and uses the framework's
 *     normal notFound() for unknown slugs (no custom 404 behavior).
 *   - generateStaticParams covers exactly the catalog.
 *   - The "Integration help" entries are DERIVED from the real provider
 *     registry (names/icons), visibility-gated, and never invented.
 */
const mockNotFound = jest.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
});
jest.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

// The routes resolve the viewer session (read-only, header CTA variant only).
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import ArticlePage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/help/[slug]/page";
import { buildHelpProviderEntries } from "@/app/help/_providers";
import {
  HELP_ARTICLES,
  HELP_PROVIDER_IDS,
} from "@/features/marketing/help/helpCatalog";
import { getProvider, providerIconUrl } from "@/integrations/_registry";

describe("/help/[slug] route", () => {
  beforeEach(() => {
    mockNotFound.mockClear();
    mockGetUser.mockReset().mockResolvedValue({ data: { user: null } });
  });

  it("renders a known article slug (signed-out header by default)", async () => {
    const el = await ArticlePage({
      params: Promise.resolve({ slug: "create-your-first-workflow" }),
    });
    expect(el).toBeTruthy();
    expect((el as { props?: { authenticated?: boolean } }).props?.authenticated).toBe(false);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("passes authenticated=true for a signed-in viewer (header CTA variant, no gate)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    const el = await ArticlePage({
      params: Promise.resolve({ slug: "create-your-first-workflow" }),
    });
    expect((el as { props?: { authenticated?: boolean } }).props?.authenticated).toBe(true);
  });

  it("fails safe to the signed-out header when the session lookup throws", async () => {
    mockGetUser.mockRejectedValue(new Error("supabase down"));
    const el = await ArticlePage({
      params: Promise.resolve({ slug: "create-your-first-workflow" }),
    });
    expect((el as { props?: { authenticated?: boolean } }).props?.authenticated).toBe(false);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("uses the normal notFound() behavior for unknown slugs", async () => {
    await expect(
      ArticlePage({ params: Promise.resolve({ slug: "not-a-real-article" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("generateStaticParams covers exactly the catalog slugs", () => {
    const params = generateStaticParams();
    expect(params.map((p) => p.slug).sort()).toEqual(
      HELP_ARTICLES.map((a) => a.slug).sort(),
    );
  });

  it("generateMetadata titles a known article and falls back safely for unknown", async () => {
    const known = await generateMetadata({
      params: Promise.resolve({ slug: "understand-task-usage" }),
    });
    expect(known.title).toBe("Understand task usage — ChainReact Help");
    const unknown = await generateMetadata({
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(unknown.title).toBe("Help Center — ChainReact");
  });
});

describe("help provider entries come from the provider registry", () => {
  it("builds one entry per curated id, with the registry displayName and icon URL", () => {
    const entries = buildHelpProviderEntries();
    expect(entries.map((e) => e.id)).toEqual([...HELP_PROVIDER_IDS]);
    for (const entry of entries) {
      const manifest = getProvider(entry.id);
      expect(manifest).toBeDefined();
      expect(entry.name).toBe(manifest?.displayName);
      expect(entry.iconUrl).toBe(providerIconUrl(entry.id));
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.articleSlug.length).toBeGreaterThan(0);
    }
  });

  it("silently drops unknown provider ids (never invents an app)", () => {
    expect(buildHelpProviderEntries(["not-a-provider"])).toEqual([]);
  });

  it("drops providers that are not catalog-visible (disabled/experimental)", () => {
    // adp ships isEnabled:false today — it must never surface in help.
    expect(buildHelpProviderEntries(["adp"])).toEqual([]);
  });

  it("drops visible providers that have no dedicated help article", () => {
    // notion is live in the registry but has no provider article yet.
    expect(getProvider("notion")).toBeDefined();
    expect(buildHelpProviderEntries(["notion"])).toEqual([]);
  });
});

import { isSourceExposed } from "@/services/analytics/insights/exposure";
import { buildClientAnalyticsCatalog } from "@/services/analytics/insights/clientProjection";
import { runConnectedAnalyticsQuery } from "@/services/analytics/insights/runConnectedQuery";
import { ConnectedAnalyticsError } from "@/contracts/connectedAnalytics";

/**
 * Declarative source exposure (CD-3A): the certification boundary.
 *
 * Stripe stays `preview` until its live certification pass — invisible AND
 * unqueryable in production, fully available to development/tests. Nothing
 * anywhere branches on the provider name; flipping the catalog's one
 * `exposure` field is the entire release switch.
 */

describe("isSourceExposed", () => {
  it("public everywhere; preview only in development; hidden nowhere", () => {
    expect(isSourceExposed("public", "production")).toBe(true);
    expect(isSourceExposed("public", "development")).toBe(true);
    expect(isSourceExposed("preview", "production")).toBe(false);
    expect(isSourceExposed("preview", "development")).toBe(true);
    expect(isSourceExposed("hidden", "production")).toBe(false);
    expect(isSourceExposed("hidden", "development")).toBe(false);
  });
});

describe("buildClientAnalyticsCatalog exposure filtering", () => {
  it("production: ChainReact, QuickBooks and Shopify are public; Stripe (preview, uncertified) is absent", () => {
    const catalog = buildClientAnalyticsCatalog({ environment: "production" });
    // QuickBooks joined the public set in CD-4B, Shopify in CD-4C — each after
    // its live certification passed.
    expect(catalog.sources.map((s) => s.id)).toEqual([
      "chainreact",
      "quickbooks",
      "shopify",
    ]);
    expect(catalog.sources.every((s) => s.exposure === "public")).toBe(true);
  });

  it("development: Stripe appears, explicitly marked preview", () => {
    const catalog = buildClientAnalyticsCatalog({ environment: "development" });
    expect(catalog.sources.map((s) => s.id)).toEqual([
      "chainreact",
      "quickbooks",
      "shopify",
      "stripe",
    ]);
    const stripe = catalog.sources.find((s) => s.id === "stripe")!;
    expect(stripe.exposure).toBe("preview");
  });

  it("category filters carry declared values (real choice lists, no raw boxes)", () => {
    const catalog = buildClientAnalyticsCatalog({ environment: "development" });
    const runs = catalog.sources
      .find((s) => s.id === "chainreact")!
      .datasets.find((d) => d.id === "workflow_runs")!;
    const status = runs.filters.find((f) => f.id === "status")!;
    expect(status.values).toEqual([
      { id: "succeeded", label: "Succeeded" },
      { id: "failed", label: "Failed" },
    ]);
    const triggerSource = runs.filters.find((f) => f.id === "trigger_source")!;
    expect(triggerSource.values?.map((v) => v.id)).toContain("webhook");
    // Stripe currency is account-specific — deliberately NO declared values.
    const payments = catalog.sources
      .find((s) => s.id === "stripe")!
      .datasets.find((d) => d.id === "payments")!;
    expect(payments.filters.find((f) => f.id === "currency")!.values).toBeUndefined();
    expect(payments.filters.find((f) => f.id === "status")!.values?.map((v) => v.id)).toEqual([
      "succeeded",
      "pending",
      "failed",
    ]);
  });

  it("projection still carries no scopes or server internals", () => {
    const flat = JSON.stringify(buildClientAnalyticsCatalog({ environment: "development" }));
    expect(flat).not.toContain("requiredScopes");
    expect(flat).not.toContain("read_write");
    expect(flat).not.toContain("executionMode");
  });
});

describe("runConnectedAnalyticsQuery exposure enforcement", () => {
  const ctx = { accountId: "acc-1", userId: "user-1" };
  const stripeQuery = {
    source: "stripe",
    dataset: "payments",
    measure: "payment_count",
    dimension: null,
    range: { preset: "30d" as const },
  };

  it("production treats an uncertified (preview) source as unknown", async () => {
    await expect(
      runConnectedAnalyticsQuery(ctx, stripeQuery, { environment: "production" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_SOURCE" });
  });

  it("the production rejection copy matches a truly unknown source (no existence leak)", async () => {
    const capture = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: unknown) => e as ConnectedAnalyticsError,
      );
    const unknownErr = await capture(
      runConnectedAnalyticsQuery(ctx, { ...stripeQuery, source: "nope" }, { environment: "production" }),
    );
    const previewErr = await capture(
      runConnectedAnalyticsQuery(ctx, stripeQuery, { environment: "production" }),
    );
    expect(previewErr?.message).toBe(unknownErr?.message);
    expect(previewErr?.code).toBe(unknownErr?.code);
  });
});

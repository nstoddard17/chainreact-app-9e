/**
 * Contextual-help resolver (HELP-CENTER-CONTEXTUAL-1).
 *
 * Pins the single product-context → article mapping: provider articles via
 * the catalog, run-error mapping keyed ONLY on the classified action enum,
 * billing/onboarding/builder mappings, deliberate nulls, and the guarantee
 * that every produced href is a well-formed /help/<slug> URL whose slug
 * exists in the catalog.
 */
import {
  resolveHelpLink,
  type HelpContext,
} from "@/features/marketing/help/contextualHelp";
import { getHelpArticle } from "@/features/marketing/help/helpCatalog";

describe("resolveHelpLink — provider contexts", () => {
  it("returns the provider-specific setup article when one exists", () => {
    const linkResult = resolveHelpLink({ type: "provider_setup", providerId: "fleetio" });
    expect(linkResult).toEqual({
      slug: "connect-fleetio",
      href: "/help/connect-fleetio",
      label: "View setup guide",
    });
  });

  it("returns null for a provider without a dedicated article (no control rendered)", () => {
    expect(resolveHelpLink({ type: "provider_setup", providerId: "notion" })).toBeNull();
    expect(
      resolveHelpLink({ type: "provider_setup", providerId: "not-a-provider" }),
    ).toBeNull();
  });

  it("connection_problem maps to the disconnected-app article", () => {
    const linkResult = resolveHelpLink({ type: "connection_problem" });
    expect(linkResult?.slug).toBe("fix-a-disconnected-app");
    expect(linkResult?.label).toBe("How to reconnect");
  });
});

describe("resolveHelpLink — run errors (classified action enum only)", () => {
  it("maps known actions to specific articles", () => {
    expect(resolveHelpLink({ type: "run_error", action: "reconnect" })?.slug).toBe(
      "fix-a-disconnected-app",
    );
    expect(resolveHelpLink({ type: "run_error", action: "open_node" })?.slug).toBe(
      "fix-workflow-setup-issues",
    );
    expect(resolveHelpLink({ type: "run_error", action: "upgrade_plan" })?.slug).toBe(
      "understand-task-usage",
    );
  });

  it("falls back to the general troubleshooting article for retry/support/unknown/absent", () => {
    for (const action of ["retry_later", "contact_support", "totally-unknown", null, undefined]) {
      expect(resolveHelpLink({ type: "run_error", action })?.slug).toBe(
        "troubleshoot-a-failed-run",
      );
    }
  });

  it("deliberately returns null for review_pending and link_vehicles", () => {
    expect(resolveHelpLink({ type: "run_error", action: "review_pending" })).toBeNull();
    expect(resolveHelpLink({ type: "run_error", action: "link_vehicles" })).toBeNull();
  });

  it("uses one consistent secondary label for run-error help", () => {
    expect(resolveHelpLink({ type: "run_error", action: "reconnect" })?.label).toBe(
      "Read troubleshooting guide",
    );
  });
});

describe("resolveHelpLink — billing, onboarding, builder", () => {
  it("maps billing reasons", () => {
    expect(resolveHelpLink({ type: "billing", reason: "task_usage" })?.slug).toBe(
      "understand-task-usage",
    );
    expect(resolveHelpLink({ type: "billing", reason: "ai_credits" })?.slug).toBe(
      "understand-ai-credits",
    );
    expect(resolveHelpLink({ type: "billing", reason: "plan_change" })?.slug).toBe(
      "change-or-cancel-your-subscription",
    );
  });

  it("maps every onboarding step to its quick-start article", () => {
    const expected: Record<string, string> = {
      create: "create-your-first-workflow",
      connect: "connect-an-app",
      configure: "configure-workflow-steps",
      test: "test-a-workflow",
      activate: "turn-on-a-workflow",
    };
    for (const [step, slug] of Object.entries(expected)) {
      const linkResult = resolveHelpLink({
        type: "onboarding",
        step: step as "create" | "connect" | "configure" | "test" | "activate",
      });
      expect(linkResult?.slug).toBe(slug);
      expect(linkResult?.label).toBe("Learn how");
    }
  });

  it("maps builder concepts", () => {
    expect(
      resolveHelpLink({ type: "builder_concept", concept: "setup_issues" })?.slug,
    ).toBe("fix-workflow-setup-issues");
    expect(resolveHelpLink({ type: "builder_concept", concept: "step_data" })?.slug).toBe(
      "use-data-from-an-earlier-step",
    );
  });

  it("returns null for unmapped contexts (never a guessed URL)", () => {
    expect(
      resolveHelpLink({ type: "billing", reason: "nonsense" } as unknown as HelpContext),
    ).toBeNull();
    expect(
      resolveHelpLink({
        type: "builder_concept",
        concept: "nonsense",
      } as unknown as HelpContext),
    ).toBeNull();
    expect(resolveHelpLink({ type: "nonsense" } as unknown as HelpContext)).toBeNull();
  });
});

describe("resolveHelpLink — URL integrity", () => {
  const RESOLVABLE_CONTEXTS: HelpContext[] = [
    { type: "provider_setup", providerId: "slack" },
    { type: "provider_setup", providerId: "gmail" },
    { type: "connection_problem" },
    { type: "run_error", action: "reconnect" },
    { type: "run_error", action: "open_node" },
    { type: "run_error", action: "upgrade_plan" },
    { type: "run_error", action: "contact_support" },
    { type: "billing", reason: "task_usage" },
    { type: "billing", reason: "ai_credits" },
    { type: "billing", reason: "plan_change" },
    { type: "onboarding", step: "create" },
    { type: "onboarding", step: "connect" },
    { type: "onboarding", step: "configure" },
    { type: "onboarding", step: "test" },
    { type: "onboarding", step: "activate" },
    { type: "builder_concept", concept: "setup_issues" },
    { type: "builder_concept", concept: "step_data" },
  ];

  it("every resolvable context yields a well-formed href whose slug exists in the catalog", () => {
    for (const ctx of RESOLVABLE_CONTEXTS) {
      const result = resolveHelpLink(ctx);
      expect(result).not.toBeNull();
      expect(result?.href).toMatch(/^\/help\/[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(result?.href).toBe(`/help/${result?.slug}`);
      expect(getHelpArticle(result?.slug ?? "")).toBeDefined();
      expect(result?.label.length).toBeGreaterThan(0);
    }
  });
});

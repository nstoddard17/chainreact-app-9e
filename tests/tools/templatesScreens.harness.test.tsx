/**
 * RESPONSIVE-FOUNDATION-1 — Templates visual harness (NOT a behavioural test).
 *
 * Follows the `documentScreens.harness.test.tsx` approach: render the REAL
 * Templates components with representative fixtures and write the resulting
 * markup to `owner-review/html/*.html`. A sibling Playwright script
 * (`scripts/trash/responsive-foundation/screenshot-templates.mjs`) wraps each
 * file with compiled Tailwind + the globals tokens, screenshots it across the
 * required widths, and asserts horizontal overflow — WITHOUT a database or auth,
 * which is what makes continuous 1600→360 verification possible while local
 * Supabase is unavailable.
 *
 * It lives under `tests/tools` and only runs via an explicit `--testMatch`, so it
 * never runs in the normal suite. It asserts only that each state produced
 * markup; the layout assertions live in the Playwright pass, where there is a
 * real layout engine.
 *
 * The fixtures deliberately include the pathological cases the brief names: the
 * Google Review Test template, a long multi-word title, a long UNBROKEN title, a
 * card carrying many provider/category chips, a long description, non-zero
 * counters, every card action, active filters, a long unbroken toast message, and
 * the details dialog open.
 */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/templates",
}));

import { TemplatesDashboard } from "@/features/templates/TemplatesDashboard";
import { TemplateDetailsDialog } from "@/features/templates/TemplateDetailsDialog";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import type {
  MarketplaceTemplateSummary,
  MyTemplateItem,
} from "@/features/templates/types";
import type { TemplateCardMeta } from "@/contracts/workflowTemplate";

const OUT = join(process.cwd(), "owner-review", "html");

const LONG_UNBROKEN =
  "Supercalifragilisticexpialidocious_automation_template_for_enterprise_revenue_operations_pipeline_2026";
const LONG_MULTIWORD =
  "Quarterly revenue reconciliation, Slack digest, and finance operations follow-up for the enterprise accounts team";
const LONG_DESCRIPTION =
  "When a new contact is created in HubSpot, enrich it against the CRM, check whether the deal value exceeds the approval threshold, notify the right Slack channel, create a follow-up task in Asana, log the outcome to a Google Sheet, and email a summary to the account owner every weekday morning.";

function meta(over: Partial<TemplateCardMeta> = {}): TemplateCardMeta {
  return {
    category: "sales-crm",
    triggerKind: "provider-event",
    providers: ["hubspot", "slack"],
    stepCount: 3,
    steps: [
      { kind: "trigger", provider: "hubspot", type: "new_contact" },
      { kind: "action", provider: "slack", type: "send_channel_message" },
      { kind: "action", provider: "slack", type: "send_channel_message" },
    ],
    ...over,
  } as TemplateCardMeta;
}

function tpl(
  over: Partial<MarketplaceTemplateSummary> & { id: string; name: string },
): MarketplaceTemplateSummary {
  return {
    description: "Route new leads to the right channel automatically.",
    isOfficial: true,
    creatorDisplayName: null,
    usageCount: 0,
    forkCount: 0,
    card: meta(),
    ...over,
  } as MarketplaceTemplateSummary;
}

const marketplace: readonly MarketplaceTemplateSummary[] = [
  // The real seeded official template named in the brief.
  tpl({
    id: "t-google-review",
    name: "Google Review Test",
    description: "Watch for new Google reviews and post them to Slack for triage.",
    usageCount: 128,
    forkCount: 34,
    card: meta({ providers: ["google-analytics", "slack"], category: "reporting" }),
  }),
  tpl({ id: "t-long-words", name: LONG_MULTIWORD, description: LONG_DESCRIPTION, usageCount: 4210, forkCount: 987 }),
  tpl({ id: "t-long-unbroken", name: LONG_UNBROKEN, description: LONG_UNBROKEN, usageCount: 7, forkCount: 2 }),
  // Many chips: six providers + a long category label.
  tpl({
    id: "t-many-chips",
    name: "Full-stack revenue operations pipeline",
    usageCount: 56,
    forkCount: 12,
    card: meta({
      providers: ["hubspot", "slack", "google-sheets", "mailchimp", "stripe", "microsoft-outlook"],
      category: "personal-productivity",
      stepCount: 8,
    }),
  }),
  // Community card (creator attribution instead of the official badge).
  tpl({
    id: "t-community",
    name: "Shopify order to accounting",
    isOfficial: false,
    creatorDisplayName: "Alexandra Featherstonehaugh-Wellington",
    usageCount: 91,
    forkCount: 18,
    card: meta({ providers: ["shopify", "stripe"], category: "ecommerce" }),
  }),
  tpl({ id: "t-short", name: "Daily standup reminder", usageCount: 12, forkCount: 3, card: meta({ providers: ["slack"], category: "team-ops", stepCount: 2 }) }),
];

// "Your templates" — exercises the manage actions (publish toggle + delete) and
// the visibility chip beside a long title, which is the §6 collision case.
const mine: readonly MyTemplateItem[] = [
  {
    id: "m-1",
    name: LONG_UNBROKEN,
    description: "A private copy.",
    visibility: "private",
    usageCount: 3,
    forkCount: 1,
    canManage: true,
  },
  {
    id: "m-2",
    name: LONG_MULTIWORD,
    description: LONG_DESCRIPTION,
    visibility: "public",
    usageCount: 44,
    forkCount: 9,
    canManage: true,
  },
] as unknown as readonly MyTemplateItem[];

/**
 * Wraps a state in the real page chrome the route uses (shared page container),
 * so the screenshots measure the container contract too, not just the dashboard.
 */
function Page({ children }: { children: ReactNode }) {
  return <AppPageContainer className="gap-6 py-6 sm:py-8">{children}</AppPageContainer>;
}

function emit(name: string, node: HTMLElement | null) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, `${name}.html`),
    node ? node.outerHTML : "<!-- nothing rendered -->",
    "utf8",
  );
  expect(node).not.toBeNull();
  expect((node?.outerHTML.length ?? 0)).toBeGreaterThan(200);
}

describe("Templates visual harness", () => {
  it("emits the default marketplace grid", () => {
    const { container } = render(
      <Page>
        <TemplatesDashboard accountId="acc-1" initialMarketplace={marketplace} initialMine={mine} />
      </Page>,
    );
    emit("templates-01-marketplace", container.firstElementChild as HTMLElement);
  });

  it("emits 'Your templates' with manage actions + visibility chips", () => {
    const { container, getByTestId } = render(
      <Page>
        <TemplatesDashboard accountId="acc-1" initialMarketplace={marketplace} initialMine={mine} />
      </Page>,
    );
    getByTestId("templates-tab-mine").click();
    emit("templates-02-mine", container.firstElementChild as HTMLElement);
  });

  it("emits the empty / no-match state", () => {
    const { container } = render(
      <Page>
        <TemplatesDashboard accountId="acc-1" initialMarketplace={[]} initialMine={[]} />
      </Page>,
    );
    emit("templates-03-empty", container.firstElementChild as HTMLElement);
  });

  it("emits the details dialog open", () => {
    const { baseElement } = render(
      <TemplateDetailsDialog
        template={marketplace[1]!}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
        onClose={() => {}}
      />,
    );
    emit("templates-04-details-dialog", baseElement.firstElementChild as HTMLElement);
  });

  it("emits the details dialog for a long UNBROKEN title", () => {
    const { baseElement } = render(
      <TemplateDetailsDialog
        template={marketplace[2]!}
        busy={false}
        onUse={() => {}}
        onFork={() => {}}
        onClose={() => {}}
      />,
    );
    emit("templates-05-details-dialog-unbroken", baseElement.firstElementChild as HTMLElement);
  });
});

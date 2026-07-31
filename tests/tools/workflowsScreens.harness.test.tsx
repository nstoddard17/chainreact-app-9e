/**
 * RESPONSIVE-PAGES-2 — Workflows + AppTopBar-consumer visual harness.
 *
 * Same proven approach as `templatesScreens.harness.test.tsx`: render the REAL
 * components with representative fixtures and write the markup to
 * `owner-review/html/*.html`, which
 * `scripts/responsive/measure-app-shell.mjs` then wraps with
 * compiled Tailwind and measures continuously from 360→1600. No database, no
 * auth, no dev server.
 *
 * Fixtures cover the states the brief names: a populated list, long workflow
 * names (multi-word AND unbroken), long provider/status metadata, filters active
 * with Clear visible, the empty state, usage near-limit/exhausted, a toast, an
 * open action menu, and representative Runs / Apps / Notifications page bodies
 * for the shared-shell sweep.
 */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/workflows",
  useSearchParams: () => new URLSearchParams(),
}));

import { WorkflowsToolbar } from "@/features/workflows/WorkflowsToolbar";
import { WorkflowsStatCards } from "@/features/workflows/WorkflowsStatCards";
import { WorkflowCard } from "@/features/workflows/WorkflowCard";
import { WorkflowsEmptyState } from "@/features/workflows/WorkflowsEmptyState";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import type { WorkflowListItem } from "@/contracts/workflow";

const OUT = join(process.cwd(), "owner-review", "html");

const LONG_UNBROKEN =
  "Enterprise_revenue_operations_reconciliation_and_notification_pipeline_v2026_final";
const LONG_MULTIWORD =
  "Quarterly revenue reconciliation, Slack digest, and finance operations follow-up for the enterprise accounts team";

function wf(over: Partial<WorkflowListItem> & { id: string; name: string }): WorkflowListItem {
  return {
    state: "active",
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    providers: [
      { id: "hubspot", label: "HubSpot", iconUrl: null },
      { id: "slack", label: "Slack", iconUrl: null },
    ],
    triggerCount: 1,
    actionCount: 3,
    runStats: { total: 1284, succeeded: 1201, successRate: 0.935, lastRunAt: "2026-07-29T10:00:00Z", lastRunStatus: "succeeded" },
    folderId: null,
    ...over,
  } as WorkflowListItem;
}

const workflows: readonly WorkflowListItem[] = [
  wf({ id: "11111111-1111-4111-8111-111111111111", name: "Welcome and route new leads" }),
  wf({ id: "22222222-2222-4222-8222-222222222222", name: LONG_MULTIWORD, state: "paused" }),
  wf({ id: "33333333-3333-4333-8333-333333333333", name: LONG_UNBROKEN, state: "draft" }),
  wf({
    id: "44444444-4444-4444-8444-444444444444",
    name: "Six-app revenue pipeline with a long provider list",
    providers: [
      { id: "hubspot", label: "HubSpot", iconUrl: null },
      { id: "slack", label: "Slack", iconUrl: null },
      { id: "google-sheets", label: "Google Sheets", iconUrl: null },
      { id: "mailchimp", label: "Mailchimp", iconUrl: null },
      { id: "stripe", label: "Stripe", iconUrl: null },
      { id: "microsoft-outlook", label: "Microsoft Outlook", iconUrl: null },
    ],
  }),
  wf({
    id: "55555555-5555-4555-8555-555555555555",
    name: "Disabled — needs attention",
    state: "disabled",
    disabledReason: "integration_revoked",
    disabledContext: "The connected app rejected the subscription request.",
    usesPrivateCredential: true,
    viewerCanRunEdit: false,
  }),
  wf({ id: "66666666-6666-4666-8666-666666666666", name: "Daily standup reminder", state: "draft", runStats: { total: 0, succeeded: 0, successRate: 0, lastRunAt: null, lastRunStatus: null } }),
];

function Page({ children }: { children: ReactNode }) {
  return <AppPageContainer className="gap-6 py-6 sm:py-8">{children}</AppPageContainer>;
}

/** A stand-in for the toast the dashboard renders, with the accepted contract. */
function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="workflows-toast"
      style={{ maxWidth: "calc(100vw - 2rem)" }}
      className="fixed bottom-6 left-1/2 z-50 w-max -translate-x-1/2 whitespace-normal break-words rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg"
    >
      {message}
    </div>
  );
}

function emit(name: string, node: Element | null) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), node ? node.outerHTML : "<!-- nothing -->", "utf8");
  expect(node).not.toBeNull();
  expect(node!.outerHTML.length).toBeGreaterThan(200);
}

const noop = () => {};

describe("Workflows visual harness", () => {
  it("emits the populated dashboard (toolbar + stats + card grid)", () => {
    const { container } = render(
      <Page>
        <header className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Showing 6 of 6 — ordered by most recently changed.
          </p>
        </header>
        <WorkflowsStatCards workflows={workflows} />
        <WorkflowsToolbar
          tab="automations"
          onTab={noop}
          query=""
          onQuery={noop}
          statusFilter="all"
          onStatusFilter={noop}
          view="grid"
          onView={noop}
          onOpenFilters={noop}
          activeFilterCount={0}
        />
        <ul
          data-testid="workflows-grid-view"
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3"
        >
          {workflows.map((w) => (
            <WorkflowCard key={w.id} workflow={w} onChanged={noop} />
          ))}
        </ul>
      </Page>,
    );
    emit("workflows-01-dashboard", container.firstElementChild);
  });

  it("emits the toolbar with filters active (Clear/badge visible) + a toast", () => {
    const { container } = render(
      <Page>
        <WorkflowsStatCards workflows={workflows} />
        <WorkflowsToolbar
          tab="automations"
          onTab={noop}
          query="revenue reconciliation enterprise"
          onQuery={noop}
          statusFilter="attention"
          onStatusFilter={noop}
          view="list"
          onView={noop}
          onOpenFilters={noop}
          activeFilterCount={3}
        />
        <ul
          data-testid="workflows-grid-view"
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3"
        >
          {workflows.slice(0, 2).map((w) => (
            <WorkflowCard key={w.id} workflow={w} onChanged={noop} />
          ))}
        </ul>
        <Toast message="Couldn't update that workflow: https://api.example.com/v1/workflows/44444444-4444-4444-8444-444444444444/activate returned 409" />
      </Page>,
    );
    emit("workflows-02-filters-active-toast", container.firstElementChild);
  });

  it("emits the empty state", () => {
    const { container } = render(
      <Page>
        <WorkflowsToolbar
          tab="automations"
          onTab={noop}
          query=""
          onQuery={noop}
          statusFilter="all"
          onStatusFilter={noop}
          view="grid"
          onView={noop}
          onOpenFilters={noop}
          activeFilterCount={0}
        />
        <WorkflowsEmptyState kind="no-workflows" />
      </Page>,
    );
    emit("workflows-03-empty", container.firstElementChild);
  });

  it("emits the toolbar with the Create Workflow form OPEN", () => {
    // The create CTA expands into a full inline form inside the toolbar's action
    // cluster. Unbounded that widened the cluster past a phone viewport, and no
    // earlier fixture opened it — this state exists so the sweep measures it.
    const { container, getByRole } = render(
      <Page>
        <WorkflowsToolbar
          tab="automations"
          onTab={noop}
          query=""
          onQuery={noop}
          statusFilter="all"
          onStatusFilter={noop}
          view="grid"
          onView={noop}
          onOpenFilters={noop}
          activeFilterCount={0}
        />
      </Page>,
    );
    getByRole("button", { name: "Create workflow" }).click();
    emit("workflows-05-create-form-open", container.firstElementChild);
  });

  it("emits the near-limit / exhausted usage stats", () => {
    // Stat values driven to their widest realistic forms.
    const heavy = workflows.map((w) =>
      ({ ...w, runStats: { ...w.runStats, total: 9876543, succeeded: 9123456 } }) as WorkflowListItem,
    );
    const { container } = render(
      <Page>
        <WorkflowsStatCards workflows={heavy} />
      </Page>,
    );
    emit("workflows-04-usage-heavy", container.firstElementChild);
  });
});

/**
 * Shared-shell sweep bodies. Deliberately simple representations of each page's
 * CONTENT inside the migrated container — the point is to prove the shell + the
 * container behave, not to re-render each feature in full.
 */
describe("AppTopBar consumer shells", () => {
  it("emits a Runs-shaped body in the `content` container", () => {
    const { container } = render(
      <AppPageContainer width="content" className="gap-6 py-6 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Runs</h1>
        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
          <p className="break-words font-mono text-xs text-muted-foreground">
            run_9f8e7d6c5b4a39281706e5d4c3b2a1908f7e6d5c4b3a29180716e5d4c3b2a190
          </p>
          <p className="break-words text-xs text-muted-foreground">
            https://hooks.example.com/services/T0000000000/B0000000000/XXXXXXXXXXXXXXXXXXXXXXXX
          </p>
        </div>
      </AppPageContainer>,
    );
    emit("consumers-01-runs", container.firstElementChild);
  });

  it("emits an Apps-shaped body in the default container", () => {
    const { container } = render(
      <AppPageContainer className="gap-6 py-6 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Apps</h1>
        <ul className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
          {["HubSpot", "Slack", "Microsoft Outlook", "Google Sheets", "Mailchimp"].map((n) => (
            <li key={n} className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-4">
              <span className="break-words text-sm font-semibold text-foreground">{n}</span>
              <span className="break-words text-xs text-muted-foreground">Connected</span>
            </li>
          ))}
        </ul>
      </AppPageContainer>,
    );
    emit("consumers-02-apps", container.firstElementChild);
  });

  it("emits a Notifications-shaped body in the `reading` container", () => {
    const { container } = render(
      <AppPageContainer width="reading" className="gap-6 py-6 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
        <ul className="flex min-w-0 flex-col gap-2">
          <li className="min-w-0 rounded-md border border-border bg-card p-4">
            <p className="break-words text-sm text-foreground">
              Workflow “{LONG_MULTIWORD}” was disabled.
            </p>
            <p className="break-words font-mono text-xs text-muted-foreground">{LONG_UNBROKEN}</p>
          </li>
        </ul>
      </AppPageContainer>,
    );
    emit("consumers-03-notifications", container.firstElementChild);
  });
});

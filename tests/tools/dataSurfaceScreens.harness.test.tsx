/**
 * RESPONSIVE-DATA-SURFACES-5 — Workflow list/table + Runs list visual harness.
 *
 * Same approach as the accepted templates / workflows / account / team
 * harnesses: render the REAL components with synthetic fixtures, write the
 * markup to `owner-review/html/{wflist,runlist}-*.html`, and let
 * `scripts/responsive/measure-app-shell.mjs` wrap it with
 * compiled Tailwind + the authenticated shell chrome and measure continuously
 * from 360→1600 in Chromium. No database, no auth, no dev server.
 *
 * SCOPE NOTE (audited, not assumed): V2 has **no Runs detail route**. `/runs` is
 * a list, and `RunRow` says so in its own doc comment — "There is no per-run
 * detail route in V2 yet ... page-guide §4 forbids fake CTAs". The only
 * run-detail UI is `RunDetailPane` inside the Workflow Builder canvas, which
 * this batch excludes. So the run half of this harness covers the run surface
 * that actually ships: the list rows, which carry the long provider errors,
 * humanized guidance, CTAs, timestamps and status badges.
 *
 * FIXTURE SAFETY: every value is synthetic. Ids are zero-padded literals, the
 * one API-key prefix is an obvious fixture stub, and no production run data,
 * customer data, credential, token, signed URL or private email appears.
 */
import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/workflows",
  useSearchParams: () => new URLSearchParams(),
}));

import { WorkflowsTable } from "@/features/workflows/WorkflowsTable";
import { WorkflowsBulkActions } from "@/features/workflows/folders/WorkflowsBulkActions";
import { WorkflowsEmptyState } from "@/features/workflows/WorkflowsEmptyState";
import { RunRow } from "@/features/runs/RunRow";
import { RunsEmptyState } from "@/features/runs/RunsEmptyState";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import type { RunListItem, WorkflowListItem } from "@/contracts/workflow";

const OUT = join(process.cwd(), "owner-review", "html");

// ── Synthetic content at the widest realistic forms ──────────────────────────

const LONG_WF_NAME =
  "Quarterly revenue reconciliation, Slack digest, and finance operations follow-up for the enterprise accounts team";
const LONG_UNBROKEN_WF =
  "Enterprise_revenue_operations_reconciliation_and_notification_pipeline_v2026_final";
const LONG_FOLDER =
  "Finance Operations — EMEA Quarterly Close and Reconciliation Programme";
const LONG_ERROR_DESC =
  "The connected app returned 429 Too Many Requests for this workspace. The provider reported: rate limit exceeded for method conversations.history on token scope channels:history; retry after 60 seconds. ChainReact stopped the run before any duplicate messages were delivered.";

const WF_ID = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const RUN_ID = (n: number) => `1111111${n}-1111-4111-8111-11111111111${n}`;

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
    runStats: {
      total: 1284,
      succeeded: 1201,
      successRate: 0.935,
      lastRunAt: "2026-07-29T10:00:00Z",
      lastRunStatus: "succeeded",
    },
    folderId: null,
    ...over,
  } as WorkflowListItem;
}

const [WF_SHORT, WF_LONG, WF_UNBROKEN, WF_DISABLED, WF_DRAFT] = [
  wf({ id: WF_ID(1), name: "Welcome and route new leads", folderId: "f-1" }),
  wf({
    id: WF_ID(2),
    name: LONG_WF_NAME,
    state: "paused",
    folderId: "f-2",
    providers: [
      { id: "hubspot", label: "HubSpot", iconUrl: null },
      { id: "slack", label: "Slack", iconUrl: null },
      { id: "google-sheets", label: "Google Sheets", iconUrl: null },
      { id: "mailchimp", label: "Mailchimp", iconUrl: null },
      { id: "stripe", label: "Stripe", iconUrl: null },
      { id: "microsoft-outlook", label: "Microsoft Outlook", iconUrl: null },
    ],
  }),
  wf({ id: WF_ID(3), name: LONG_UNBROKEN_WF, state: "draft", folderId: "f-2" }),
  wf({
    id: WF_ID(4),
    name: "Disabled — needs attention",
    state: "disabled",
    disabledReason: "integration_revoked",
    disabledContext: "The connected app rejected the subscription request.",
    usesPrivateCredential: true,
    viewerCanRunEdit: false,
    runStats: {
      total: 42,
      succeeded: 30,
      successRate: 0.714,
      lastRunAt: "2026-07-30T09:00:00Z",
      lastRunStatus: "failed",
    },
  }),
  wf({
    id: WF_ID(5),
    name: "Daily standup reminder",
    state: "draft",
    runStats: {
      total: 0,
      succeeded: 0,
      successRate: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
  }),
] as const satisfies readonly WorkflowListItem[];

const WORKFLOWS: readonly WorkflowListItem[] = [
  WF_SHORT,
  WF_LONG,
  WF_UNBROKEN,
  WF_DISABLED,
  WF_DRAFT,
];

const FOLDER_NAMES = new Map<string, string>([
  ["f-1", "Sales"],
  ["f-2", LONG_FOLDER],
]);

const FOLDER_OPTIONS = [
  { id: "f-1", name: "Sales", depth: 1 },
  { id: "f-2", name: LONG_FOLDER, depth: 1 },
];

const noop = () => {};
const folderActionsFor = () => ({
  folders: FOLDER_OPTIONS,
  onMoveToFolder: noop,
  onMoveToTrash: noop,
});

// ── Runs fixtures ────────────────────────────────────────────────────────────

function run(over: Partial<RunListItem> & { id: string }): RunListItem {
  return {
    workflowId: WF_ID(1),
    workflowName: "Welcome and route new leads",
    status: "succeeded",
    isTest: false,
    triggeredBy: "scheduled",
    triggeredByApiKeyPrefix: null,
    startedAt: "2026-07-30T09:00:00Z",
    finishedAt: "2026-07-30T09:00:12Z",
    durationMs: 12480,
    errorClassification: null,
    ...over,
  } as RunListItem;
}

const [RUN_OK, RUN_RUNNING, RUN_RATE_LIMITED, RUN_QUEUED, RUN_STALE, RUN_RECONNECT] = [
  run({ id: RUN_ID(1) }),
  run({
    id: RUN_ID(2),
    workflowName: LONG_WF_NAME,
    status: "running",
    startedAt: "2026-07-31T08:59:00Z",
    finishedAt: null,
    durationMs: null,
    triggeredBy: "manual",
  }),
  run({
    id: RUN_ID(3),
    workflowName: LONG_UNBROKEN_WF,
    status: "failed",
    triggeredBy: "api_key",
    // Obvious fixture stub — never a real key or hash.
    triggeredByApiKeyPrefix: "crk_live_FIXTURE",
    durationMs: 4210,
    errorClassification: {
      title: "Slack rejected the request because the workspace hit its rate limit",
      description: LONG_ERROR_DESC,
      hint: "ChainReact will not retry automatically. Re-run once the provider's limit window has passed.",
      severity: "error",
      action: "retry_later",
    },
  }),
  // There is no "cancelled" run status in V2 — `WorkflowRunDisplayStatus` is
  // queued | running | succeeded | failed. The nearest real states are a fresh
  // queued run and a STALE queued one (which renders the amber helper copy), so
  // those are what this fixture covers instead of inventing a status.
  run({
    id: RUN_ID(4),
    status: "queued",
    workflowName: "Disabled — needs attention",
    startedAt: "2026-07-31T08:58:00Z",
    finishedAt: null,
    durationMs: null,
    triggeredBy: "webhook",
  }),
  run({
    id: RUN_ID(5),
    status: "queued",
    // Long enough ago to trip the stale-queued helper copy.
    startedAt: "2026-07-30T08:00:00Z",
    finishedAt: null,
    durationMs: null,
    isTest: true,
    triggeredBy: "manual",
  }),
  run({
    id: RUN_ID(6),
    status: "failed",
    workflowName: "Sync invoices to the ledger",
    triggeredBy: "scheduled",
    durationMs: 33120,
    errorClassification: {
      title: "The connected app needs to be reconnected",
      description:
        "ChainReact's access to this account was revoked or expired, so the step could not run.",
      hint: "Reconnect the app to resume this workflow.",
      severity: "error",
      action: "reconnect",
    },
  }),
] as const satisfies readonly RunListItem[];

const RUNS: readonly RunListItem[] = [
  RUN_OK,
  RUN_RUNNING,
  RUN_RATE_LIMITED,
  RUN_QUEUED,
  RUN_STALE,
  RUN_RECONNECT,
];

// ── emit ─────────────────────────────────────────────────────────────────────

function emit(name: string, node: Element | null) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), node ? node.outerHTML : "<!-- nothing -->", "utf8");
  expect(node).not.toBeNull();
  expect(node!.outerHTML.length).toBeGreaterThan(200);
}

/** Emit every root, for states that render an overlay beside the page subtree. */
function emitAll(name: string, container: HTMLElement, mustContain: string) {
  mkdirSync(OUT, { recursive: true });
  const html = container.innerHTML;
  writeFileSync(join(OUT, `${name}.html`), html, "utf8");
  expect(html).toContain(mustContain);
  expect(container.children.length).toBeGreaterThan(1);
}

/** Mirrors `app/workflows/page.tsx` — the default (1600px) container. */
function WorkflowsPage({ children }: { children: ReactNode }) {
  return (
    <AppPageContainer className="gap-6 py-6 sm:py-8">{children}</AppPageContainer>
  );
}

/** Mirrors `app/runs/page.tsx` — the deliberate `content` (1152px) column. */
function RunsPage({ children }: { children: ReactNode }) {
  return (
    <AppPageContainer width="content" className="gap-6 py-6 sm:py-8">
      {children}
    </AppPageContainer>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="data-surface-toast"
      style={{ maxWidth: "calc(100vw - 2rem)" }}
      className="fixed bottom-6 left-1/2 z-50 w-max -translate-x-1/2 whitespace-normal break-words rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg"
    >
      {message}
    </div>
  );
}

function table(over: Partial<Parameters<typeof WorkflowsTable>[0]> = {}) {
  return (
    <WorkflowsTable
      workflows={WORKFLOWS}
      folderNameById={FOLDER_NAMES}
      onChanged={noop}
      folderActionsFor={folderActionsFor}
      {...over}
    />
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ── Workflow list / table ────────────────────────────────────────────────────

describe("Workflow list visual harness", () => {
  it("01 — typical list", () => {
    const { container } = render(<WorkflowsPage>{table()}</WorkflowsPage>);
    emit("wflist-01-typical", container.firstElementChild);
  });

  it("02 — long workflow / folder / provider identity", () => {
    const { container } = render(
      <WorkflowsPage>
        {table({ workflows: [WF_LONG, WF_UNBROKEN, WF_DISABLED] })}
      </WorkflowsPage>,
    );
    emit("wflist-02-long-identity", container.firstElementChild);
  });

  it("03 — selection active + bulk toolbar", () => {
    const selected = new Set([WF_ID(1), WF_ID(2)]);
    const { container } = render(
      <WorkflowsPage>
        <WorkflowsBulkActions
          count={selected.size}
          folders={FOLDER_OPTIONS}
          pending={false}
          onMove={noop}
          onTrash={noop}
          onClear={noop}
        />
        {table({
          selectedIds: selected,
          onToggleSelect: noop,
          onToggleSelectAll: noop,
        })}
      </WorkflowsPage>,
    );
    emit("wflist-03-selection-bulk", container.firstElementChild);
  });

  it("04 — a row with its action menu ACTIVATED (trigger state, not the panel)", async () => {
    const { container } = render(<WorkflowsPage>{table()}</WorkflowsPage>);
    await act(async () => {
      screen.getAllByTestId("workflow-actions-menu-trigger")[1]?.click();
    });
    await settle();
    // Deliberately captures the PAGE subtree only, not the popover panel.
    //
    // `WorkflowActionsMenu` is a Radix Popover: the panel is portalled to
    // `document.body` and positioned at runtime by Floating UI, which is also what
    // keeps it inside the viewport. Re-hosting that portalled markup in a static
    // HTML snapshot produces an unpositioned, unstyled block pinned at the top-left
    // — it would render a misleading screenshot and measure a layout the browser
    // never actually produces. Menu containment is the library's collision
    // detection; what THIS batch controls is that the trigger stays reachable and
    // that both presentations expose the same actions, and those are asserted in
    // tests/unit/features/workflows/workflowListResponsive.test.tsx.
    emit("wflist-04-menu-activated", container.firstElementChild);
  });

  it("05 — empty state", () => {
    const { container } = render(
      <WorkflowsPage>
        <WorkflowsEmptyState kind="no-workflows" />
      </WorkflowsPage>,
    );
    emit("wflist-05-empty", container.firstElementChild);
  });

  it("06 — toast over the list", () => {
    const { container } = render(
      <>
        <WorkflowsPage>{table()}</WorkflowsPage>
        <Toast message="Couldn't move that workflow: the request to /api/workflows/00000002-0000-4000-8000-000000000002 returned 409 Conflict" />
      </>,
    );
    emitAll("wflist-06-toast", container, 'data-testid="data-surface-toast"');
  });

  it("07 — selection active with long identity (checkbox lane + long names)", () => {
    const selected = new Set([WF_ID(2), WF_ID(3)]);
    const { container } = render(
      <WorkflowsPage>
        {table({
          workflows: [WF_LONG, WF_UNBROKEN, WF_DISABLED, WF_DRAFT],
          selectedIds: selected,
          onToggleSelect: noop,
          onToggleSelectAll: noop,
        })}
      </WorkflowsPage>,
    );
    emit("wflist-07-selection-long", container.firstElementChild);
  });
});

// ── Runs list ────────────────────────────────────────────────────────────────

describe("Runs list visual harness", () => {
  it("01 — mixed statuses: succeeded, running, failed, queued, stale queued", () => {
    const { container } = render(
      <RunsPage>
        <ul data-testid="runs-list" aria-label="Runs list" className="flex flex-col gap-2">
          {RUNS.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </ul>
      </RunsPage>,
    );
    emit("runlist-01-mixed", container.firstElementChild);
  });

  it("02 — failed run with a very long provider error and guidance", () => {
    const { container } = render(
      <RunsPage>
        <ul data-testid="runs-list" aria-label="Runs list" className="flex flex-col gap-2">
          <RunRow run={RUN_RATE_LIMITED} />
          <RunRow run={RUN_RECONNECT} />
        </ul>
      </RunsPage>,
    );
    emit("runlist-02-failed-long-error", container.firstElementChild);
  });

  it("03 — long workflow identity on a run row", () => {
    const { container } = render(
      <RunsPage>
        <ul data-testid="runs-list" aria-label="Runs list" className="flex flex-col gap-2">
          <RunRow run={RUN_RUNNING} />
          <RunRow
            run={run({
              id: RUN_ID(7),
              workflowName: LONG_UNBROKEN_WF,
              status: "succeeded",
              durationMs: 987654,
            })}
          />
        </ul>
      </RunsPage>,
    );
    emit("runlist-03-long-identity", container.firstElementChild);
  });

  it("04 — empty state", () => {
    const { container } = render(
      <RunsPage>
        <RunsEmptyState kind="no-runs" />
      </RunsPage>,
    );
    emit("runlist-04-empty", container.firstElementChild);
  });

  it("05 — toast over the runs list", () => {
    const { container } = render(
      <>
        <RunsPage>
          <ul data-testid="runs-list" aria-label="Runs list" className="flex flex-col gap-2">
            {RUNS.slice(0, 3).map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        </RunsPage>
        <Toast message="Couldn't refresh runs: the request to /api/runs returned 503 Service Unavailable" />
      </>,
    );
    emitAll("runlist-05-toast", container, 'data-testid="data-surface-toast"');
  });
});

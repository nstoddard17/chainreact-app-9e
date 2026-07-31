/**
 * RESPONSIVE-BUILDER-RUNS-6 — Workflow Builder Runs surfaces visual harness.
 *
 * Same approach as the accepted harnesses: render the REAL components with
 * synthetic fixtures, write the markup to `owner-review/html/brun-*.html`, and
 * let `scripts/responsive/measure-app-shell.mjs` wrap it and
 * measure continuously from 360→1600 in Chromium.
 *
 * AUDITED SURFACE (what actually ships — no invented sections):
 *
 *   1. Runs TAB (`RunsPanel` → `RunList` + `RunDetailPane`). Deliberately
 *      payload-free by construction: its own doc comment says "per-step OUTPUT is
 *      never rendered here". So it has status, source label, test tag, Started,
 *      Duration, the humanized error, the step timeline, and the action CTAs —
 *      and NO inputs, outputs, JSON, logs, trigger payload, file references, run
 *      id, or copy controls.
 *   2. Latest-run RESULTS panel (`RunResultsPanel`, right-drawer `results` mode).
 *      This is the only place per-step OUTPUT is rendered, as pretty-printed JSON
 *      in a `max-h-48 overflow-auto` block, plus the run id, the classified error
 *      and its CTA.
 *
 * NOT PRESENT anywhere in these surfaces, so deliberately not fixtured: input
 * viewers, trigger-payload viewers, log viewers, embedded output tables, file
 * references, and a queued run row (`WorkflowRunSummary.status` is
 * succeeded | failed; "Running" exists only as the synthetic live row).
 * `features/workflow-builder/panels/RunHistory.tsx` is an ORPHAN — rendered
 * nowhere — so it is not a shipped surface either.
 *
 * FIXTURE SAFETY: every value is synthetic. No production payloads, customer
 * data, emails, tokens, keys, secrets or signed URLs.
 */
const mockListWorkflowRuns = jest.fn();
const mockGetWorkflowRun = jest.fn();

jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    listWorkflowRuns: (...a: unknown[]) => mockListWorkflowRuns(...a),
    getWorkflowRun: (...a: unknown[]) => mockGetWorkflowRun(...a),
    runNowWorkflow: jest.fn(),
    updateWorkflow: jest.fn(),
    activateWorkflow: jest.fn(),
    publishWorkflow: jest.fn(),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/workflows/x",
  useSearchParams: () => new URLSearchParams(),
}));

import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RunsPanel } from "@/features/workflow-builder/canvas/RunsPanel";
import { RunResultsPanel } from "@/features/workflow-builder/panels/RunResultsPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type {
  WorkflowNode,
  WorkflowRunDetail,
  WorkflowRunSummary,
} from "@/contracts/workflow";

const OUT = join(process.cwd(), "owner-review", "html");
const WF_ID = "11111111-1111-4111-8111-111111111111";

// ── Synthetic content at the widest realistic forms ──────────────────────────

const LONG_NODE_NAME =
  "Send the quarterly revenue reconciliation digest to the finance operations channel";
const LONG_ERROR_DESC =
  "The connected app returned 429 Too Many Requests for this workspace. The provider reported: rate limit exceeded for method conversations.history on token scope channels:history; retry after 60 seconds. ChainReact stopped the run before any duplicate messages were delivered.";
const RUN_ID_LONG = "9f8e7d6c-5b4a-4392-8170-6e5d4c3b2a19";

function node(over: Partial<WorkflowNode> & { id: string }): WorkflowNode {
  return {
    kind: "action",
    provider: "slack",
    type: "send_message",
    config: {},
    position: { x: 0, y: 0 },
    ...over,
  } as WorkflowNode;
}

const manualTrigger = node({
  id: "trigger-1",
  kind: "trigger",
  provider: "native",
  type: "manual.run",
});
const stepNodeA = node({ id: "node-a", displayName: LONG_NODE_NAME });
const stepNodeB = node({ id: "node-b", displayName: "Create the HubSpot deal record" });
const stepNodeC = node({ id: "node-c", displayName: "Append a row to the ledger sheet" });

function boot(extra: WorkflowNode[] = []): void {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
  useGraphSlice.setState({ workflowId: WF_ID, pendingNodes: [manualTrigger, ...extra] });
}

function summary(over: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: "run-1",
    workflowId: WF_ID,
    status: "succeeded",
    triggerNodeId: "trigger-1",
    startedAt: "2026-07-30T09:00:00Z",
    finishedAt: "2026-07-30T09:00:12Z",
    errorClassification: null,
    triggeredBy: "manual",
    isTest: false,
    ...over,
  };
}

function detail(over: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return { ...summary(), steps: [], ...over };
}

const RATE_LIMIT_ERROR = {
  title: "Slack rejected the request because the workspace hit its rate limit",
  description: LONG_ERROR_DESC,
  hint: "ChainReact will not retry automatically. Re-run once the provider's limit window has passed.",
  severity: "error" as const,
  action: "retry_later" as const,
};

/** A chatty provider response — the widest realistic JSON, all synthetic. */
const WIDE_OUTPUT = {
  ok: true,
  channel: "C0000000000",
  ts: "1753963200.000100",
  message: {
    text: "Quarterly revenue reconciliation complete — 1,284 records matched, 3 exceptions raised for manual review by the finance operations team.",
    permalink_template:
      "https://example.invalid/archives/C0000000000/p1753963200000100?thread_ts=1753963200.000100&cid=C0000000000",
    blocks: [{ type: "section", block_id: "sectionBlockWithAVeryLongIdentifier0001" }],
  },
};

// ── emit ─────────────────────────────────────────────────────────────────────

function emit(name: string, node: Element | null) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), node ? node.outerHTML : "<!-- nothing -->", "utf8");
  expect(node).not.toBeNull();
  expect(node!.outerHTML.length).toBeGreaterThan(200);
}

function emitAll(name: string, container: HTMLElement, mustContain: string) {
  mkdirSync(OUT, { recursive: true });
  const html = container.innerHTML;
  writeFileSync(join(OUT, `${name}.html`), html, "utf8");
  expect(html).toContain(mustContain);
  expect(container.children.length).toBeGreaterThan(1);
}

/**
 * The Runs TAB's real host: `BuilderTabPanels` renders it as the full-width
 * centre workspace (`relative min-h-0 flex-1 overflow-y-auto`), and the panel
 * itself is `absolute inset-0`. A fixed height stands in for the viewport-height
 * workspace so the absolutely-positioned panel has a box to fill.
 */
function TabHost({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="builder-tab-panel"
      data-tab="runs"
      className="relative min-h-0 flex-1 overflow-y-auto"
      style={{ background: "var(--builder-bg)", height: "760px" }}
    >
      {children}
    </div>
  );
}

/**
 * The results panel's real host: `BuilderRightDrawer`, sized by the ACCEPTED
 * builder layout policy rather than by a single hard-coded width.
 *
 * That policy (`builderLayoutPolicy.ts`) makes the config/results surface an
 * in-flow `w-[380px]` column only in the `wide` tier (≥1280px); below that it is
 * a `w-[min(24rem,92vw)]` overlay sheet so it cannot squeeze the canvas. A
 * fixture that rendered the 380px in-flow column at 360px would be measuring a
 * state the builder never produces — and it did, which is why this host now
 * mirrors the policy with `xl:` (1280) instead. The overlay tier is expressed
 * in-flow so it stays measurable; its width maths is identical.
 */
function DrawerHost({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0" style={{ height: "760px" }}>
      <div className="min-w-0 flex-1" />
      <aside
        data-testid="builder-right-drawer"
        className="flex w-[min(24rem,92vw)] flex-col border-l xl:w-[380px] xl:shrink-0"
        style={{ borderColor: "var(--builder-border)", background: "var(--builder-panel)" }}
      >
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="builder-runs-toast"
      style={{ maxWidth: "calc(100vw - 2rem)" }}
      className="fixed bottom-6 left-1/2 z-50 w-max -translate-x-1/2 whitespace-normal break-words rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg"
    >
      {message}
    </div>
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockListWorkflowRuns.mockReset();
  mockGetWorkflowRun.mockReset();
  mockGetWorkflowRun.mockImplementation((_w: string, runId: string) =>
    Promise.resolve(detail({ id: runId })),
  );
});

afterEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

// ── Runs tab ─────────────────────────────────────────────────────────────────

describe("Builder Runs tab visual harness", () => {
  it("01 — empty runs panel", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([]);
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    emit("brun-01-empty", container.firstElementChild);
  });

  it("02 — loading runs panel", async () => {
    boot();
    mockListWorkflowRuns.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    emit("brun-02-loading", container.firstElementChild);
  });

  it("03 — typical successful run, multi-step", async () => {
    boot([stepNodeA, stepNodeB, stepNodeC]);
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "run-a" }),
      summary({ id: "run-b", triggeredBy: "scheduled" }),
      summary({ id: "run-c", triggeredBy: "webhook", isTest: true }),
    ]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "run-a",
        steps: [
          { nodeId: "node-a", status: "succeeded" },
          { nodeId: "node-b", status: "succeeded" },
          { nodeId: "node-c", status: "skipped" },
        ],
      }),
    );
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    emit("brun-03-success-multistep", container.firstElementChild);
  });

  it("04 — failed run with a long provider error and a failed step", async () => {
    boot([stepNodeA, stepNodeB]);
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "run-f", status: "failed", errorClassification: RATE_LIMIT_ERROR }),
      summary({ id: "run-a" }),
    ]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "run-f",
        status: "failed",
        errorClassification: RATE_LIMIT_ERROR,
        steps: [
          { nodeId: "node-a", status: "succeeded" },
          {
            nodeId: "node-b",
            status: "failed",
            error: {
              code: "PROVIDER_RATE_LIMITED",
              message:
                "Slack returned 429 for chat.postMessage; the workspace limit for this method was exceeded.",
            },
          },
        ],
      }),
    );
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    emit("brun-04-failed-long-error", container.firstElementChild);
  });

  it("05 — a step whose node is no longer on the canvas (missing-node fallback)", async () => {
    boot([stepNodeA]);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a", status: "failed" })]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "run-a",
        status: "failed",
        steps: [
          { nodeId: "node-a", status: "succeeded" },
          { nodeId: "node-gone", status: "failed", error: { code: "X", message: "Gone." } },
        ],
      }),
    );
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    emit("brun-05-missing-node", container.firstElementChild);
  });

  it("06 — run-again unavailable (provider trigger, non-manual)", async () => {
    useGraphSlice.getState().reset();
    useConfigSlice.getState().reset();
    useRunSlice.getState().reset();
    useGraphSlice.setState({
      workflowId: WF_ID,
      pendingNodes: [
        node({ id: "trigger-1", kind: "trigger", provider: "slack", type: "message_received" }),
        stepNodeA,
      ],
    });
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a", triggeredBy: "webhook" })]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({ id: "run-a", triggeredBy: "webhook", steps: [{ nodeId: "node-a", status: "succeeded" }] }),
    );
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    emit("brun-06-run-again-unavailable", container.firstElementChild);
  });

  it("07 — live running row selected", async () => {
    boot([stepNodeA]);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    useRunSlice.setState({ status: "pending", runId: "live-run-1" });
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    await act(async () => {
      screen.getByTestId("run-row-live-run-1").click();
    });
    await settle();
    emit("brun-07-running", container.firstElementChild);
  });

  it("08b — narrow SELECTED-RUN surface (a run was chosen from the list)", async () => {
    // Selecting a run switches the narrow presentation to the detail surface and
    // reveals its Back control. From `lg` up the same markup shows both surfaces
    // side-by-side and the Back control is not rendered at all.
    boot([stepNodeA, stepNodeB]);
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "run-f", status: "failed", errorClassification: RATE_LIMIT_ERROR }),
      summary({ id: "run-a" }),
    ]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "run-f",
        status: "failed",
        errorClassification: RATE_LIMIT_ERROR,
        steps: [
          { nodeId: "node-a", status: "succeeded" },
          {
            nodeId: "node-b",
            status: "failed",
            error: { code: "PROVIDER_RATE_LIMITED", message: "Slack returned 429." },
          },
        ],
      }),
    );
    const { container } = render(
      <TabHost>
        <RunsPanel />
      </TabHost>,
    );
    await settle();
    await act(async () => {
      screen.getByTestId("run-row-run-f").click();
    });
    await settle();
    emit("brun-08b-narrow-detail", container.firstElementChild);
  });

  it("08 — toast over the runs tab", async () => {
    boot([stepNodeA]);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    const { container } = render(
      <>
        <TabHost>
          <RunsPanel />
        </TabHost>
        <Toast message="Couldn't start a test run: the request to /api/workflows/11111111-1111-4111-8111-111111111111/run-now returned 409 Conflict" />
      </>,
    );
    await settle();
    emitAll("brun-08-toast", container, 'data-testid="builder-runs-toast"');
  });
});

// ── Latest-run results panel (the only per-step OUTPUT surface) ──────────────

describe("Builder latest-run results panel visual harness", () => {
  function seedResults(over: Partial<WorkflowRunDetail> = {}, status: "succeeded" | "failed" = "succeeded") {
    boot([stepNodeA, stepNodeB]);
    useRunSlice.setState({
      status,
      runId: RUN_ID_LONG,
      detail: detail({ id: RUN_ID_LONG, status, ...over }),
      fetchError: null,
      pollCount: 3,
    });
  }

  it("09 — output JSON expanded (in-flow 380px drawer)", async () => {
    seedResults({
      steps: [
        { nodeId: "node-a", status: "succeeded", output: WIDE_OUTPUT },
        { nodeId: "node-b", status: "succeeded" },
      ],
    });
    const { container } = render(
      <DrawerHost>
        <RunResultsPanel />
      </DrawerHost>,
    );
    await settle();
    await act(async () => {
      screen.getByTestId("step-node-a-toggle").click();
    });
    await settle();
    emit("brun-09-output-json", container.firstElementChild);
  });

  it("10 — output JSON with an extremely long single-line value", async () => {
    // The worst case for the viewer: one unbreakable line far wider than any
    // drawer. It must scroll INSIDE the block and never size the panel.
    seedResults({
      steps: [
        {
          nodeId: "node-a",
          status: "succeeded",
          output: {
            cursor:
              "eyJvZmZzZXQiOjEyODQsInNvcnQiOiJjcmVhdGVkX2F0OmRlc2MiLCJmaWx0ZXIiOiJhY2NvdW50X2lkPTAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsInYiOjJ9_SYNTHETIC_FIXTURE_NOT_A_REAL_CURSOR",
          },
        },
      ],
    });
    const { container } = render(
      <DrawerHost>
        <RunResultsPanel />
      </DrawerHost>,
    );
    await settle();
    await act(async () => {
      screen.getByTestId("step-node-a-toggle").click();
    });
    await settle();
    emit("brun-10-output-json-overlay", container.firstElementChild);
  });

  it("11 — failed latest run: run id, classified error, step error code", async () => {
    seedResults(
      {
        errorClassification: RATE_LIMIT_ERROR,
        steps: [
          { nodeId: "node-a", status: "succeeded" },
          {
            nodeId: "node-b",
            status: "failed",
            error: {
              code: "PROVIDER_RATE_LIMITED",
              message:
                "Slack returned 429 for chat.postMessage; the workspace limit for this method was exceeded.",
            },
          },
        ],
      },
      "failed",
    );
    const { container } = render(
      <DrawerHost>
        <RunResultsPanel />
      </DrawerHost>,
    );
    await settle();
    emit("brun-11-results-failed", container.firstElementChild);
  });

  it("12 — idle results panel (no run started yet)", async () => {
    boot([stepNodeA]);
    const { container } = render(
      <DrawerHost>
        <RunResultsPanel />
      </DrawerHost>,
    );
    await settle();
    emit("brun-12-results-idle", container.firstElementChild);
  });

  it("13 — pending results panel (waiting for the engine)", async () => {
    boot([stepNodeA]);
    useRunSlice.setState({ status: "pending", runId: RUN_ID_LONG, pollCount: 7 });
    const { container } = render(
      <DrawerHost>
        <RunResultsPanel />
      </DrawerHost>,
    );
    await settle();
    emit("brun-13-results-pending", container.firstElementChild);
  });
});

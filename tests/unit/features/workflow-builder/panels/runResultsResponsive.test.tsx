/**
 * RESPONSIVE-BUILDER-RUNS-6 — latest-run results panel responsive behaviour.
 *
 * This is the ONLY builder surface that renders per-step output, so it is the
 * one place the "a code block must not become the panel's minimum width" rule
 * actually bites. Geometry is proven by the browser sweep; what is asserted here
 * is that the viewer is a bounded scroller rather than a width-setter, that long
 * identifiers break, and that redaction/formatting behaviour is untouched.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunResultsPanel } from "@/features/workflow-builder/panels/RunResultsPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type { WorkflowNode, WorkflowRunDetail } from "@/contracts/workflow";

const WF_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "9f8e7d6c-5b4a-4392-8170-6e5d4c3b2a19";
const LONG_NODE_NAME =
  "Send the quarterly revenue reconciliation digest to the finance operations channel";

const nodeA: WorkflowNode = {
  id: "node-a",
  kind: "action",
  provider: "slack",
  type: "send_message",
  config: {},
  position: { x: 0, y: 0 },
  displayName: LONG_NODE_NAME,
};

function detail(over: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    id: RUN_ID,
    workflowId: WF_ID,
    status: "succeeded",
    triggerNodeId: "trigger-1",
    startedAt: "2026-07-30T09:00:00Z",
    finishedAt: "2026-07-30T09:00:12Z",
    errorClassification: null,
    triggeredBy: "manual",
    isTest: false,
    steps: [],
    ...over,
  };
}

function seed(over: Partial<WorkflowRunDetail> = {}, status: "succeeded" | "failed" = "succeeded") {
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
  useGraphSlice.setState({ workflowId: WF_ID, pendingNodes: [nodeA] });
  useRunSlice.setState({
    status,
    runId: RUN_ID,
    detail: detail({ status, ...over }),
    fetchError: null,
    pollCount: 2,
  });
}

afterEach(() => {
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("the output viewer is a bounded scroller, not a width-setter", () => {
  it("scrolls internally and cannot size the panel", async () => {
    const user = userEvent.setup();
    seed({ steps: [{ nodeId: "node-a", status: "succeeded", output: { ok: true } }] });
    render(<RunResultsPanel />);

    await user.click(screen.getByTestId("step-node-a-toggle"));
    const pre = screen.getByTestId("step-node-a-output");
    // Bounded in BOTH axes, and capped so its intrinsic content width can never
    // become the panel's minimum width.
    expect(pre.className).toContain("overflow-auto");
    expect(pre.className).toContain("max-h-48");
    expect(pre.className).toContain("max-w-full");
    expect(pre.className).toContain("min-w-0");
  });

  it("keeps the output disclosure reachable and reversible", async () => {
    const user = userEvent.setup();
    seed({ steps: [{ nodeId: "node-a", status: "succeeded", output: { ok: true } }] });
    render(<RunResultsPanel />);

    const toggle = screen.getByTestId("step-node-a-toggle");
    expect(toggle.className).toContain("shrink-0");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("step-node-a-output")).toBeVisible();
    await user.click(toggle);
    expect(screen.queryByTestId("step-node-a-output")).toBeNull();
  });

  it("still pretty-prints the output exactly as before", async () => {
    const user = userEvent.setup();
    seed({
      steps: [{ nodeId: "node-a", status: "succeeded", output: { ok: true, channel: "C000" } }],
    });
    render(<RunResultsPanel />);
    await user.click(screen.getByTestId("step-node-a-toggle"));
    // Formatting is behaviour, not styling — the layout work must not touch it.
    expect(screen.getByTestId("step-node-a-output")).toHaveTextContent(
      '{ "ok": true, "channel": "C000" }',
    );
  });

  it("renders no output block at all for a step that has none", () => {
    seed({ steps: [{ nodeId: "node-a", status: "succeeded" }] });
    render(<RunResultsPanel />);
    // No output ⇒ no disclosure. Redaction/absence behaviour is unchanged.
    expect(screen.queryByTestId("step-node-a-toggle")).toBeNull();
    expect(screen.queryByTestId("step-node-a-output")).toBeNull();
  });
});

describe("long technical values stay contained", () => {
  it("breaks the run id, which is one unbroken 36-character token", () => {
    seed({ steps: [] });
    render(<RunResultsPanel />);
    const runId = screen.getByTestId("run-id");
    expect(runId).toHaveTextContent(RUN_ID);
    // Only `break-all` can split an id with no spaces in it.
    expect(runId.className).toContain("break-all");
    expect(runId.className).toContain("min-w-0");
  });

  it("wraps a long step name and declares a floor on its allocated cell", () => {
    seed({ steps: [{ nodeId: "node-a", status: "succeeded" }] });
    render(<RunResultsPanel />);
    const step = screen.getByTestId("step-node-a");
    const cell = step.querySelector("[data-legible-min]") as HTMLElement;
    expect(cell).not.toBeNull();
    expect(within(cell).getByText(LONG_NODE_NAME).className).toContain("break-words");
    // The floor is on the flex-1 cell that ALLOCATES space, not the text itself.
    expect(cell.className).toContain("flex-1");
    expect(cell.className).not.toMatch(/(^|\s)shrink-0(\s|$)/);
  });
});

describe("error presentation is unchanged", () => {
  const classification = {
    title: "Slack rejected the request because the workspace hit its rate limit",
    description: "The connected app returned 429 Too Many Requests for this workspace.",
    hint: "Re-run once the provider's limit window has passed.",
    severity: "error" as const,
    action: "retry_later" as const,
  };

  it("keeps the classified block, its role and its CTA classification", () => {
    seed({ errorClassification: classification, steps: [] }, "failed");
    render(<RunResultsPanel />);

    const block = screen.getByTestId("run-error-classification");
    expect(block).toHaveAttribute("role", "alert");
    expect(within(block).getByText(classification.title).className).toContain("break-words");
    // `retry_later` has no safe destination, so it stays guidance TEXT.
    const cta = screen.getByTestId("run-error-cta");
    expect(cta).toHaveAttribute("data-cta-action", "retry_later");
    expect(cta.tagName.toLowerCase()).toBe("p");
  });

  it("keeps the per-step error code and message together and wrapping", () => {
    seed(
      {
        steps: [
          {
            nodeId: "node-a",
            status: "failed",
            error: { code: "PROVIDER_RATE_LIMITED", message: "Slack returned 429." },
          },
        ],
      },
      "failed",
    );
    render(<RunResultsPanel />);
    const step = screen.getByTestId("step-node-a");
    expect(step).toHaveTextContent("PROVIDER_RATE_LIMITED: Slack returned 429.");
    expect(within(step).getByText(/Slack returned 429/).className).toContain("break-words");
  });
});

describe("non-terminal states are unchanged", () => {
  it("keeps the idle and pending copy", () => {
    useGraphSlice.getState().reset();
    useRunSlice.getState().reset();
    useGraphSlice.setState({ workflowId: WF_ID, pendingNodes: [nodeA] });
    const { rerender } = render(<RunResultsPanel />);
    expect(screen.getByTestId("latest-run-idle")).toBeVisible();

    act(() => {
      useRunSlice.setState({ status: "pending", runId: RUN_ID, pollCount: 4 });
    });
    rerender(<RunResultsPanel />);
    expect(screen.getByTestId("latest-run-pending")).toHaveTextContent("poll 4");
  });
});

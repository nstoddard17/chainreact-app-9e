/**
 * Tests for features/workflow-builder/canvas/DataMapPanel — Slice
 * 4.BUILDER-DATA-MAP-MVP-1.
 *
 * The top-level Data Map tab renders a user-facing data outline from the
 * current DRAFT graph + existing node metadata. Critical contracts under test:
 *   - trigger-only / empty → honest empty state (no outline);
 *   - linear trigger → action(s) → workflow-ordered outline (trigger first);
 *   - a `{{trigger...}}` reference surfaces under "Uses variables" with a
 *     FRIENDLY source label (never the raw token / internal id);
 *   - NO raw config values, raw `{{nodeId.path}}` action tokens, or internal
 *     node ids leak into the primary UI.
 */

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { DataMapPanel } from "@/features/workflow-builder/canvas/DataMapPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDefinition, WorkflowRunDetail } from "@/contracts/workflow";

const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Trigger",
  description: "Runs when you click Run Now.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [{ name: "email", type: "string", description: "Sender email." }],
  displayOrder: 10,
};

const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Send an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [
    { name: "url", label: "URL", type: "text", required: true },
    { name: "timeoutSeconds", label: "Timeout", type: "number", required: false },
  ],
  outputs: [
    { name: "status", type: "number" },
    { name: "body", type: "object", fields: [{ name: "id", type: "string" }] },
    // Object output WITHOUT declared child fields → "run a test" hint unless a
    // sample exists to discover its children from.
    { name: "headers", type: "object" },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const delayMeta: ActionMeta = {
  key: "native:delay",
  provider: "native",
  type: "delay",
  displayName: "Delay",
  description: "Wait before continuing.",
  category: "logic",
  requiresIntegration: false,
  fields: [{ name: "seconds", label: "Seconds", type: "number", required: true }],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const SECRET_VALUE = "sentinel-secret-value-xyz";
const ACTION_A_ID = "act-aaa-111";
const ACTION_B_ID = "act-bbb-222";

beforeEach(() => {
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta, delayMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
});

function hydrate(def: WorkflowDefinition): void {
  useGraphSlice.getState().hydrate("wf-1", def);
}

const triggerNode = {
  id: "trigger-1",
  kind: "trigger" as const,
  provider: "native",
  type: "manual.run",
  config: {},
  position: { x: 0, y: 0 },
};

describe("DataMapPanel — empty / trigger-only", () => {
  it("shows the honest empty state when there are no action steps", async () => {
    hydrate({ nodes: [triggerNode], edges: [] });
    render(<DataMapPanel />);
    // Empty-state placeholder, NOT the data outline.
    expect(await screen.findByTestId("builder-tab-placeholder")).toHaveAttribute(
      "data-tab",
      "data-map",
    );
    expect(screen.queryByTestId("data-map-panel")).not.toBeInTheDocument();
  });

  it("shows the empty state for a completely empty workflow", async () => {
    hydrate({ nodes: [], edges: [] });
    render(<DataMapPanel />);
    expect(
      await screen.findByTestId("builder-tab-placeholder"),
    ).toHaveAttribute("data-tab", "data-map");
  });
});

describe("DataMapPanel — workflow with actions", () => {
  function bootLinearGraph(): void {
    hydrate({
      nodes: [
        triggerNode,
        {
          id: ACTION_A_ID,
          kind: "action",
          provider: "native",
          type: "http_request",
          // url references the trigger; `note` is a non-meta literal sentinel
          // (must never be rendered → proves raw values aren't dumped).
          config: { url: "{{trigger.email}}", note: SECRET_VALUE },
          position: { x: 0, y: 120 },
        },
        {
          id: ACTION_B_ID,
          kind: "action",
          provider: "native",
          type: "delay",
          // references action A's output → exercises the friendly action-source
          // label ("HTTP Request") + the raw-token / raw-id no-leak guarantee.
          config: { seconds: `{{${ACTION_A_ID}.status}}` },
          position: { x: 0, y: 240 },
        },
      ],
      edges: [
        { id: "e1", from: "trigger-1", to: ACTION_A_ID },
        { id: "e2", from: ACTION_A_ID, to: ACTION_B_ID },
      ],
    });
  }

  it("renders a workflow-ordered outline: trigger first, then actions in graph order", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");

    const cards = screen.getAllByTestId("data-map-node");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute("data-node-kind", "trigger");
    // graph order: trigger → A (HTTP Request) → B (Delay).
    expect(within(cards[0]!).getByRole("heading", { name: "Manual Trigger" })).toBeInTheDocument();
    expect(within(cards[1]!).getByRole("heading", { name: "HTTP Request" })).toBeInTheDocument();
    expect(within(cards[2]!).getByRole("heading", { name: "Delay" })).toBeInTheDocument();
  });

  it("surfaces a {{trigger...}} reference under 'Uses variables' with a friendly source label", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    // Friendly source label (the trigger's display name) + path — not the raw token.
    expect(within(actionA).getByText(/Uses variables/i)).toBeInTheDocument();
    expect(within(actionA).getAllByText("URL:").length).toBeGreaterThan(0);
    expect(within(actionA).getByText("Manual Trigger")).toBeInTheDocument();
    expect(within(actionA).getByText(/email/)).toBeInTheDocument();
  });

  it("shows configured field status but never raw sensitive / variable values", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    // "URL" is configured (label + status shown); its value is a {{variable}}
    // reference → shown as "configured", not the literal token. The non-meta
    // `note` sentinel is never rendered.
    expect(within(actionA).getByText("Configured")).toBeInTheDocument();
    expect(within(actionA).getAllByText(/URL/).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(SECRET_VALUE))).not.toBeInTheDocument();
  });

  it("Uses-variables side resolves an action→action reference to the upstream friendly name (never the raw id/token)", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionB = screen.getAllByTestId("data-map-node")[2]!;

    // action B (Delay) uses action A's `status` → resolved to the upstream
    // step's FRIENDLY name ("HTTP Request") in the Uses-variables section.
    expect(within(actionB).getByText(/Uses variables/i)).toBeInTheDocument();
    expect(within(actionB).getAllByText("Seconds:").length).toBeGreaterThan(0);
    expect(within(actionB).getByText("HTTP Request")).toBeInTheDocument();

    // The Uses side stays id/token-free; Delay has no outputs, so B's card
    // carries no produced-field token either → its card never shows a raw id.
    expect(actionB.textContent).not.toContain(ACTION_A_ID);
    expect(actionB.textContent).not.toContain(ACTION_B_ID);
    expect(actionB.textContent).not.toContain(`{{${ACTION_A_ID}.status}}`);
  });

  it("Produces side shows friendly, step-scoped labels (not the raw UUID) + flattened nested paths", async () => {
    // Slice 4.BUILDER-DATA-MAP-3 — the PRIMARY display is friendly; the schema
    // object `body` flattens to `body.id`. The UUID token is NOT shown by default.
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    expect(within(actionA).getByText("Step 1 → status")).toBeInTheDocument();
    expect(within(actionA).getByText("Step 1 → body.id")).toBeInTheDocument();
    expect(actionA.textContent).not.toContain(`{{${ACTION_A_ID}.status}}`);
  });

  it("reveals the real engine token (with node id) only behind the 'Show token' toggle", async () => {
    bootLinearGraph();
    const { container } = render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");

    const statusRow = container.querySelector('[data-output-path="status"]') as HTMLElement;
    fireEvent.click(within(statusRow).getByTestId("data-map-token-toggle"));
    expect(within(statusRow).getByTestId("data-map-var-token")).toHaveTextContent(
      `{{${ACTION_A_ID}.status}}`,
    );
  });

  it("shows a 'run a test' hint for an object output with no declared/sample fields", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    expect(within(actionA).getByText("Step 1 → headers")).toBeInTheDocument();
    expect(within(actionA).getByTestId("data-map-object-hint")).toHaveTextContent(
      /run a test to inspect fields/i,
    );
  });

  it("flattens an object output from sanitized sample data when a test run exists", async () => {
    bootLinearGraph();
    // Inject a sanitized run detail exposing action A's `headers` object output.
    useRunSlice.setState({
      detail: {
        id: "11111111-1111-1111-1111-111111111111",
        workflowId: "wf-1",
        status: "succeeded",
        triggerNodeId: "trigger-1",
        startedAt: "2026-05-22T00:00:00Z",
        finishedAt: "2026-05-22T00:00:01Z",
        errorClassification: null,
        steps: [
          {
            nodeId: ACTION_A_ID,
            status: "succeeded",
            output: { headers: { "content-type": "application/json" } },
          },
        ],
      } as WorkflowRunDetail,
    });
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    expect(within(actionA).getByText("Step 1 → headers.content-type")).toBeInTheDocument();
    expect(within(actionA).getByTestId("data-map-sample-value")).toHaveTextContent(
      'Example: "application/json"',
    );
  });

  it("offers a friendly trigger variable label, with {{trigger.<path>}} behind the toggle", async () => {
    bootLinearGraph();
    const { container } = render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const triggerCard = screen.getAllByTestId("data-map-node")[0]!;

    expect(within(triggerCard).getByText("Trigger → email")).toBeInTheDocument();
    const emailRow = container.querySelector('[data-output-path="email"]') as HTMLElement;
    fireEvent.click(within(emailRow).getByTestId("data-map-token-toggle"));
    expect(within(emailRow).getByTestId("data-map-var-token")).toHaveTextContent(
      "{{trigger.email}}",
    );
  });
});

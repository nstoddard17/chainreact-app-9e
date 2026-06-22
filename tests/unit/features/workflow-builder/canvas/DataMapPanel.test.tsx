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

import { render, screen, within } from "@testing-library/react";
import { DataMapPanel } from "@/features/workflow-builder/canvas/DataMapPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDefinition } from "@/contracts/workflow";

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
    expect(within(actionA).getByText("URL:")).toBeInTheDocument();
    expect(within(actionA).getByText("Manual Trigger")).toBeInTheDocument();
    expect(within(actionA).getByText(/email/)).toBeInTheDocument();
  });

  it("shows configured field LABELS but never their raw values", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    // "URL" is configured (label shown); the literal value is never rendered.
    expect(within(actionA).getByText(/Configured/i)).toBeInTheDocument();
    expect(within(actionA).getAllByText("URL").length).toBeGreaterThan(0);
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
    expect(within(actionB).getByText("Seconds:")).toBeInTheDocument();
    expect(within(actionB).getByText("HTTP Request")).toBeInTheDocument();

    // The Uses side stays id/token-free; Delay has no outputs, so B's card
    // carries no produced-field token either → its card never shows a raw id.
    expect(actionB.textContent).not.toContain(ACTION_A_ID);
    expect(actionB.textContent).not.toContain(ACTION_B_ID);
    expect(actionB.textContent).not.toContain(`{{${ACTION_A_ID}.status}}`);
  });

  it("Produces side offers a copyable {{nodeId.path}} token per action output, incl. flattened nested paths", async () => {
    // Slice 4.BUILDER-DATA-MAP-2 — action outputs are now copyable (the whole
    // point of the tab: paste variables into later steps). The node id in the
    // token is a workflow-local identifier, not a secret.
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const actionA = screen.getAllByTestId("data-map-node")[1]!;

    expect(within(actionA).getByText("status")).toBeInTheDocument();
    expect(within(actionA).getByText("body.id")).toBeInTheDocument();
    expect(within(actionA).getByText(`{{${ACTION_A_ID}.status}}`)).toBeInTheDocument();
    expect(within(actionA).getByText(`{{${ACTION_A_ID}.body.id}}`)).toBeInTheDocument();
  });

  it("offers a safe copyable {{trigger.<path>}} token for the trigger's outputs", async () => {
    bootLinearGraph();
    render(<DataMapPanel />);
    await screen.findByTestId("data-map-panel");
    const triggerCard = screen.getAllByTestId("data-map-node")[0]!;

    // The trigger's `email` output is copyable; the token carries no node id.
    expect(within(triggerCard).getByText("email")).toBeInTheDocument();
    expect(within(triggerCard).getByText("{{trigger.email}}")).toBeInTheDocument();
  });
});

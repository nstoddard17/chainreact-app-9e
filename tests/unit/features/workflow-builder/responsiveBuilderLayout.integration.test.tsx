/**
 * BUILDER-RESPONSIVE-LAYOUT-1 — responsive builder behaviour, end to end in RTL.
 *
 * These tests protect USER BEHAVIOUR at narrow widths, not class strings:
 * whether the canvas actually gets the width back, whether a transcript and a
 * composer draft survive a sheet being closed and reopened, whether pending
 * config edits survive the same, whether the actions moved out of the header are
 * still reachable, whether two sheets can cover the canvas at once, and whether
 * any of it can touch the saved workflow graph.
 *
 * The one assertion that is deliberately structural is "the canvas is no longer
 * sharing the row with a config column" — that IS the behaviour under test, and
 * jsdom has no layout engine to measure real pixels with. It is asserted through
 * the surface's `data-presentation` contract plus the absence of the in-flow
 * width, and the real-pixel version of the same claim is covered by the
 * Playwright viewport spec.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn() }),
}));

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
  };
});

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => Promise.resolve([]),
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: () => Promise.resolve([]),
  listProviderActions: () => Promise.resolve([]),
  listProviderTriggers: () => Promise.resolve([]),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type { WorkflowDetail } from "@/contracts/workflow";
import { installBuilderViewport } from "../../../helpers/builderViewport";

const definition = {
  nodes: [
    {
      id: "t1",
      kind: "trigger" as const,
      provider: "slack",
      type: "slack.message.channel",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "a1",
      kind: "action" as const,
      provider: "slack",
      type: "slack.chat.postMessage",
      config: { text: "hello" },
      position: { x: 0, y: 140 },
    },
    {
      id: "a2",
      kind: "action" as const,
      provider: "slack",
      type: "slack.chat.postMessage",
      config: {},
      position: { x: 0, y: 280 },
    },
  ],
  edges: [
    { id: "e1", from: "t1", to: "a1" },
    { id: "e2", from: "a1", to: "a2" },
  ],
};

const workflow: WorkflowDetail = {
  id: "wf-1",
  // A long name — one of the owner's required scenarios.
  name: "Quarterly revenue reconciliation and Slack digest for the finance team",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: definition,
  deletedAt: null,
  createdAt: "2026-05-06T00:00:00Z",
  updatedAt: "2026-05-06T00:00:00Z",
};

const providers = [{ id: "slack", displayName: "Slack" }];

let viewport: ReturnType<typeof installBuilderViewport> | null = null;

function mount(width: number) {
  viewport = installBuilderViewport(width);
  const utils = render(
    <WorkflowBuilder
      workflow={workflow}
      triggerProviders={providers}
      actionProviders={providers}
      documentBuilderEnabled
      defaultBuilderView="visual"
    />,
  );
  return utils;
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRouterRefresh.mockReset();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
  window.localStorage.clear();
});

afterEach(() => {
  viewport?.restore();
  viewport = null;
});

const rail = () => screen.getByTestId("builder-left-agent-rail");
const drawer = () => screen.queryByTestId("builder-right-drawer");
const scrim = () => screen.queryByTestId("builder-overlay-scrim");

/** Open a node's configuration the way a user does — by clicking its card. */
function selectNode(nodeId: string) {
  act(() => {
    useConfigSlice.getState().openNode({
      nodeId,
      initialValues: definition.nodes.find((n) => n.id === nodeId)!.config,
    });
  });
}

describe("wide desktop (1440px) — the existing layout is untouched", () => {
  it("keeps the rail and the config panel as in-flow columns beside the canvas", () => {
    mount(1440);
    selectNode("a1");
    expect(rail()).toHaveAttribute("data-presentation", "panel");
    expect(drawer()).toHaveAttribute("data-presentation", "panel");
    // No sheet ⇒ no scrim ⇒ nothing dims or covers the canvas.
    expect(scrim()).toBeNull();
  });

  it("shows the whole toolbar inline with no overflow control", () => {
    mount(1440);
    expect(screen.getByTestId("builder-header")).toHaveAttribute(
      "data-density",
      "full",
    );
    expect(screen.getByTestId("builder-header-templates-button")).toBeInTheDocument();
    expect(screen.getByTestId("builder-view-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("builder-header-undo")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-header-overflow-trigger")).toBeNull();
  });
});

describe("medium (1024px) — the canvas gets width priority", () => {
  it("opens node configuration as a sheet so it stops consuming canvas width", () => {
    mount(1024);
    selectNode("a1");
    const panel = drawer()!;
    expect(panel).toHaveAttribute("data-presentation", "overlay");
    // The in-flow 380px column is what used to squeeze the canvas; as a sheet the
    // width class is gone entirely.
    expect(panel.className).not.toMatch(/w-\[380px\]/);
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(scrim()).not.toBeNull();
  });

  it("keeps the agent rail an in-flow column, but a narrower one", () => {
    mount(1024);
    const aside = rail();
    expect(aside).toHaveAttribute("data-presentation", "panel");
    expect(aside.style.width).toBe("272px");
  });

  it("keeps the rail open alongside an open config sheet — the transcript is not sacrificed", () => {
    mount(1024);
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    selectNode("a1");
    expect(drawer()).not.toBeNull();
    expect(rail()).toHaveAttribute("data-collapsed", "false");
  });

  it("keeps Run Live Test directly visible inline at medium width (WORKFLOW-LIVE-TEST-MERGE-1)", () => {
    mount(1024);
    expect(screen.getByTestId("run-controls-live-test-button")).toBeVisible();
    expect(screen.getByTestId("run-controls-live-test-button")).toBeEnabled();
  });

  it("keeps Save, Test and the lifecycle action reachable, with the rest in overflow", async () => {
    const user = userEvent.setup();
    mount(1024);
    expect(screen.getByTestId("builder-header")).toHaveAttribute(
      "data-density",
      "compact",
    );
    // Primary actions stay inline.
    expect(screen.getByTestId("builder-header-save-button")).toBeVisible();
    expect(screen.getByTestId("builder-header-validation-pill")).toBeVisible();
    expect(screen.getByRole("button", { name: /^activate$/i })).toBeVisible();

    // Secondary actions moved, and are genuinely reachable rather than hidden.
    expect(screen.queryByTestId("builder-header-templates-button")).toBeNull();
    await user.click(screen.getByTestId("builder-header-overflow-trigger"));
    const panel = screen.getByTestId("builder-header-overflow-panel");
    expect(panel).toContainElement(
      screen.getByTestId("builder-header-templates-button"),
    );
    expect(panel).toContainElement(screen.getByTestId("builder-view-toggle"));
    expect(panel).toContainElement(screen.getByTestId("builder-header-undo"));
  });

  it("the overflow control is a working popover: Escape closes it and returns focus", async () => {
    const user = userEvent.setup();
    mount(1024);
    const trigger = screen.getByTestId("builder-header-overflow-trigger");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("builder-header-overflow-panel")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});

describe("narrow (390px phone) — one secondary surface at a time", () => {
  it("presents both the rail and configuration as sheets over a full-width canvas", () => {
    mount(390);
    expect(rail()).toHaveAttribute("data-presentation", "overlay");
    selectNode("a1");
    expect(drawer()).toHaveAttribute("data-presentation", "overlay");
  });

  it("closes the config sheet when the agent sheet is opened, and vice versa", async () => {
    const user = userEvent.setup();
    mount(390);
    // Start from a closed rail so the canvas is the primary surface.
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");

    // Selecting a node opens config...
    selectNode("a1");
    expect(drawer()).not.toBeNull();

    // ...and opening the agent sheet must not stack a second sheet on top of it.
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    expect(drawer()).toBeNull();

    // The reverse direction: selecting a node again closes the agent sheet.
    selectNode("a1");
    await waitFor(() => expect(drawer()).not.toBeNull());
    expect(rail()).toHaveAttribute("data-collapsed", "true");
  });

  it("keeps exactly one scrim, never two stacked dimmers", async () => {
    const user = userEvent.setup();
    mount(390);
    selectNode("a1");
    expect(screen.getAllByTestId("builder-overlay-scrim")).toHaveLength(1);
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    expect(screen.getAllByTestId("builder-overlay-scrim")).toHaveLength(1);
  });

  it("gives the collapsed rail a reachable reopen control (there is no spine to click)", async () => {
    const user = userEvent.setup();
    mount(390);
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    // The in-flow spine must NOT be rendered on a phone — it would eat canvas
    // width for a control the header already provides.
    expect(screen.queryByTestId("builder-left-agent-rail-expand")).toBeNull();
    const toggle = screen.getByTestId("builder-header-left-rail-toggle");
    expect(toggle).toHaveAccessibleName(/expand react agent/i);
    await user.click(toggle);
    expect(rail()).toHaveAttribute("data-collapsed", "false");
  });

  it("labels the rail's own close control honestly — it closes, it does not collapse", () => {
    mount(390);
    expect(
      screen.getByTestId("builder-left-agent-rail-collapse"),
    ).toHaveAccessibleName(/close react agent/i);
  });

  it("moves the section tabs to their own row rather than squeezing them", () => {
    mount(390);
    expect(screen.getByTestId("builder-header")).toHaveAttribute(
      "data-density",
      "minimal",
    );
    const tabRow = screen.getByTestId("builder-header-tab-row");
    expect(tabRow).toContainElement(screen.getByRole("tab", { name: /builder/i }));
    // Every section is still reachable — nothing was dropped to make room.
    for (const name of [/builder/i, /runs/i, /data map/i, /history/i, /settings/i]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("keeps Save and the lifecycle action inline, and the issue COUNT visible", () => {
    mount(390);
    expect(screen.getByTestId("builder-header-save-button")).toBeVisible();
    expect(screen.getByRole("button", { name: /^activate$/i })).toBeVisible();
    const pill = screen.getByTestId("builder-header-validation-pill");
    expect(pill).toHaveAttribute("data-compact", "true");
    // Compact drops the word, never the number: the count is what the user acts on.
    expect(pill).toHaveAccessibleName(/\d+ issue|OK|Ready/i);
    expect(pill).toHaveAttribute("data-error-count");
  });

  it("keeps the whole testing control (primary + options) reachable through the overflow control", async () => {
    // LIVE-TEST-HEADER-UX-1 — the automated panel's single split control moves into the
    // overflow intact: the primary Run Live Test action AND its testing-options popover
    // trigger, so narrow widths lose no capability.
    const user = userEvent.setup();
    mount(390);
    expect(screen.queryByTestId("run-controls-live-test-button")).toBeNull();
    await user.click(screen.getByTestId("builder-header-overflow-trigger"));
    const panel = screen.getByTestId("builder-header-overflow-panel");
    expect(panel).toContainElement(screen.getByTestId("run-controls-live-test-button"));
    expect(panel).toContainElement(
      screen.getByTestId("run-controls-testing-options-trigger"),
    );
  });

  it("keeps Run Live Test reachable AND enabled through the overflow control (WORKFLOW-LIVE-TEST-MERGE-1)", async () => {
    // The regression Marcus hit: a crowded header must never leave the automated
    // workflow's REAL testing entry point undiscoverable — at overflow densities
    // the More panel exposes Run Live Test itself, clickable, not merely an
    // unexplained disabled Test Workflow control.
    const user = userEvent.setup();
    mount(390);
    expect(screen.queryByTestId("run-controls-live-test-button")).toBeNull();
    await user.click(screen.getByTestId("builder-header-overflow-trigger"));
    const panel = screen.getByTestId("builder-header-overflow-panel");
    const liveTest = screen.getByTestId("run-controls-live-test-button");
    expect(panel).toContainElement(liveTest);
    expect(liveTest).toBeEnabled();
  });
});

describe("state survives every presentation change", () => {
  /*
    The React Agent's transcript and composer draft survive a sheet being closed
    or a presentation change because the rail NEVER remounts its payload — it
    hides it in place at a stable position in the element tree. The proof used
    here is DOM-node identity: if React had torn the subtree down and rebuilt it,
    the payload element would be a different node and any child state would be
    gone with it.

    The end-to-end version of this claim — real typed text in the real composer,
    surviving a real close/reopen — is covered against a live gateway by
    `dual-builder-rail-layout-journey.spec.ts` (DOC-RAIL-LAYOUT-1) and by the new
    Playwright viewport spec. Mounting the real composer here would require the
    Hermes gateway, so this asserts the mechanism that makes it work, and
    `BuilderLeftAgentRail.test.tsx` asserts the same contract with a stateful
    child standing in for the composer.
  */
  it("never remounts the agent payload when the sheet is closed and reopened", async () => {
    const user = userEvent.setup();
    mount(390);
    const payloadBefore = screen.getByTestId("builder-left-agent-rail-payload");

    await user.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    expect(rail()).toHaveAttribute("data-collapsed", "true");
    // Hidden, not destroyed — that is the whole contract.
    const payloadWhileClosed = screen.getByTestId("builder-left-agent-rail-payload");
    expect(payloadWhileClosed).toBe(payloadBefore);
    expect(payloadWhileClosed).toHaveAttribute("hidden");

    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    expect(screen.getByTestId("builder-left-agent-rail-payload")).toBe(payloadBefore);
  });

  it("never remounts the agent payload when the window crosses every tier", () => {
    mount(1440);
    const payloadBefore = screen.getByTestId("builder-left-agent-rail-payload");
    const asideBefore = rail();

    // Column → narrower column → sheet → back. A remount anywhere in this
    // sequence would discard the conversation.
    act(() => viewport!.set(1024));
    expect(screen.getByTestId("builder-left-agent-rail-payload")).toBe(payloadBefore);
    act(() => viewport!.set(390));
    expect(screen.getByTestId("builder-left-agent-rail-payload")).toBe(payloadBefore);
    act(() => viewport!.set(1440));

    expect(screen.getByTestId("builder-left-agent-rail-payload")).toBe(payloadBefore);
    // And there is still exactly ONE rail — no per-layout duplicate.
    expect(rail()).toBe(asideBefore);
    expect(screen.getAllByTestId("builder-left-agent-rail")).toHaveLength(1);
  });

  it("preserves pending config edits when the config sheet is closed and reopened", async () => {
    const user = userEvent.setup();
    mount(390);
    selectNode("a1");
    await waitFor(() => expect(drawer()).not.toBeNull());

    // Edit a field through the slice (the field renderers need provider metadata
    // this harness deliberately does not load; the draft is the thing under test).
    act(() => {
      useConfigSlice.getState().updateField({
        nodeId: "a1",
        name: "text",
        value: "edited but not saved",
      });
    });

    // Close the sheet — via the rail-exclusion path, the harshest one, because it
    // routes through the same close that clears the selected node.
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    expect(drawer()).toBeNull();

    // Reopen the same step: the unsaved edit is still there.
    selectNode("a1");
    await waitFor(() => expect(drawer()).not.toBeNull());
    expect(useConfigSlice.getState().drafts["a1"]?.values["text"]).toBe(
      "edited but not saved",
    );
  });

  it("preserves pending config edits across a resize that changes the presentation", () => {
    mount(1440);
    selectNode("a1");
    act(() => {
      useConfigSlice.getState().updateField({
        nodeId: "a1",
        name: "text",
        value: "typed on desktop",
      });
    });
    // Rotating a tablet must not discard what the user is typing.
    act(() => viewport!.set(768));
    expect(drawer()).toHaveAttribute("data-presentation", "overlay");
    expect(useConfigSlice.getState().activeNodeId).toBe("a1");
    expect(useConfigSlice.getState().drafts["a1"]?.values["text"]).toBe(
      "typed on desktop",
    );
  });
});

describe("the saved workflow graph is out of reach of layout", () => {
  it("no resize, sheet, or collapse mutates the graph or marks it dirty", async () => {
    const user = userEvent.setup();
    mount(1440);
    const before = JSON.stringify({
      nodes: useGraphSlice.getState().pendingNodes,
      edges: useGraphSlice.getState().pendingEdges,
    });
    expect(useGraphSlice.getState().isDirty).toBe(false);

    act(() => viewport!.set(1024));
    act(() => viewport!.set(390));
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    selectNode("a1");
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    act(() => viewport!.set(1440));

    const after = JSON.stringify({
      nodes: useGraphSlice.getState().pendingNodes,
      edges: useGraphSlice.getState().pendingEdges,
    });
    expect(after).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    // And nothing was persisted along the way.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("does not move node positions when the viewport changes", () => {
    mount(1440);
    const positions = useGraphSlice
      .getState()
      .pendingNodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`);
    act(() => viewport!.set(390));
    expect(
      useGraphSlice.getState().pendingNodes.map(
        (n) => `${n.id}:${n.position.x},${n.position.y}`,
      ),
    ).toEqual(positions);
  });
});

describe("sheet keyboard behaviour", () => {
  it("Escape closes the agent sheet on a narrow screen", () => {
    mount(390);
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(rail()).toHaveAttribute("data-collapsed", "true");
  });

  it("Escape does NOT close the in-flow rail on a desktop — it is not an overlay", () => {
    mount(1440);
    expect(rail()).toHaveAttribute("data-collapsed", "false");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(rail()).toHaveAttribute("data-collapsed", "false");
  });

  it("moves focus into the agent sheet when it opens on a narrow screen", async () => {
    const user = userEvent.setup();
    mount(390);
    await user.click(screen.getByTestId("builder-left-agent-rail-collapse"));
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    await waitFor(() => {
      expect(rail().contains(document.activeElement)).toBe(true);
    });
  });

  it("clicking the scrim dismisses the sheet that is on top", async () => {
    const user = userEvent.setup();
    mount(390);
    selectNode("a1");
    await waitFor(() => expect(drawer()).not.toBeNull());
    await user.click(scrim()!);
    expect(drawer()).toBeNull();
  });
});

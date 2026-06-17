/**
 * Tests for features/workflow-builder/canvas/SettingsPanel — Slice
 * 4.BUILDER-SETTINGS-MVP-1.
 *
 * The top-level Settings tab shows real workflow-LEVEL metadata + behavior
 * derived from the threaded WorkflowDetail subset + the live graphSlice draft.
 * Contracts under test:
 *   - real values render (name, status, published, trigger, counts, timestamps);
 *   - save status reflects graphSlice.isDirty;
 *   - not-yet-built behavior shows explicit "Coming later" rows (no dead UI);
 *   - credentials / node-level config are NOT presented as Settings content.
 */

import { render, screen, within } from "@testing-library/react";
import {
  SettingsPanel,
  type WorkflowSettingsMeta,
} from "@/features/workflow-builder/canvas/SettingsPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

const triggerNode = {
  id: "trig-1",
  kind: "trigger" as const,
  provider: "native",
  type: "manual.run",
  config: {},
  position: { x: 0, y: 0 },
};

const actionNode = {
  id: "act-1",
  kind: "action" as const,
  provider: "github",
  type: "add_comment",
  config: { repository: "octocat/x" },
  position: { x: 0, y: 120 },
};

const linearDef: WorkflowDefinition = {
  nodes: [triggerNode, actionNode],
  edges: [{ id: "e1", from: "trig-1", to: "act-1" }],
};

const activeSettings: WorkflowSettingsMeta = {
  name: "My Onboarding Flow",
  state: "active",
  createdAt: "2026-06-01T10:30:00.000Z",
  updatedAt: "2026-06-10T14:05:00.000Z",
  activeRevisionId: "11111111-1111-1111-1111-111111111111",
  unpublishedChanges: true,
};

const providerLabels = { native: "Built-in", github: "GitHub" };

function hydrate(def: WorkflowDefinition): void {
  useGraphSlice.getState().hydrate("wf-1", def);
}

beforeEach(() => {
  useGraphSlice.getState().reset();
});

describe("SettingsPanel — real workflow-level values", () => {
  it("renders the four sections (no blank sections)", () => {
    hydrate(linearDef);
    render(<SettingsPanel settings={activeSettings} providerLabels={providerLabels} />);
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    const sections = screen.getAllByTestId("settings-section").map((s) => s.getAttribute("data-section"));
    expect(sections).toEqual([
      "General",
      "Status & publishing",
      "Run behavior",
      "Error handling & notifications",
    ]);
  });

  it("shows the workflow name, status, and published state", () => {
    hydrate(linearDef);
    render(<SettingsPanel settings={activeSettings} providerLabels={providerLabels} />);
    expect(screen.getByText("My Onboarding Flow")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    // Active workflow with unpublished draft changes surfaces that explicitly.
    expect(screen.getByText(/not yet published/i)).toBeInTheDocument();
  });

  it("shows real trigger type and node/edge counts from the draft graph", () => {
    hydrate(linearDef);
    render(<SettingsPanel settings={activeSettings} providerLabels={providerLabels} />);
    const runBehavior = screen
      .getAllByTestId("settings-section")
      .find((s) => s.getAttribute("data-section") === "Run behavior")!;
    expect(within(runBehavior).getByText(/manual\.run/)).toBeInTheDocument();
    expect(within(runBehavior).getByText("1 action")).toBeInTheDocument();
    expect(within(runBehavior).getByText("2 nodes · 1 edge")).toBeInTheDocument();
  });

  it("renders timestamps deterministically in UTC", () => {
    hydrate(linearDef);
    render(<SettingsPanel settings={activeSettings} providerLabels={providerLabels} />);
    expect(screen.getByText("2026-06-01 10:30 UTC")).toBeInTheDocument();
    expect(screen.getByText("2026-06-10 14:05 UTC")).toBeInTheDocument();
  });

  it("reflects the live unsaved-changes state from graphSlice", () => {
    hydrate(linearDef);
    // A fresh hydrate is clean.
    const { rerender } = render(
      <SettingsPanel settings={activeSettings} providerLabels={providerLabels} />,
    );
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    // Mutating the draft flips isDirty → the row updates.
    useGraphSlice.getState().updateNodePosition("act-1", { x: 50, y: 200 });
    rerender(<SettingsPanel settings={activeSettings} providerLabels={providerLabels} />);
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("shows 'Not published yet' when there is no active revision", () => {
    hydrate(linearDef);
    render(
      <SettingsPanel
        settings={{ ...activeSettings, state: "draft", activeRevisionId: null, unpublishedChanges: false }}
        providerLabels={providerLabels}
      />,
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Not published yet")).toBeInTheDocument();
  });
});

describe("SettingsPanel — no dead UI", () => {
  it("shows explicit 'Coming later' rows for not-yet-built behavior", () => {
    hydrate(linearDef);
    render(<SettingsPanel settings={activeSettings} providerLabels={providerLabels} />);
    // Each not-yet-built row carries a "Coming later" badge + an explanation.
    const comingLater = screen.getAllByTestId("settings-coming-later-row");
    expect(comingLater.length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.getByText("Schedule & timezone")).toBeInTheDocument();
    expect(screen.getByText("Retry & error handling")).toBeInTheDocument();
    expect(screen.getByText("Failure notifications")).toBeInTheDocument();
    // No badge row is left without its "Coming later" affordance.
    for (const row of comingLater) {
      expect(within(row).getByText("Coming later")).toBeInTheDocument();
    }
  });
});

describe("SettingsPanel — boundaries (not credentials, not node config)", () => {
  it("does not present provider credentials or node-level config as Settings content", () => {
    hydrate(linearDef);
    const { container } = render(
      <SettingsPanel settings={activeSettings} providerLabels={providerLabels} />,
    );
    // Workflow Settings must not host credentials / secrets…
    expect(container.textContent).not.toMatch(/password|api key|token|secret|credential/i);
    // …nor surface a node's configured field value (here the GitHub repo).
    expect(container.textContent).not.toContain("octocat/x");
    // …and it points the user to where connections / step config actually live.
    expect(screen.getByText(/connections live in Apps|App connections live in Apps/i)).toBeInTheDocument();
    expect(screen.getByText(/config panel/i)).toBeInTheDocument();
  });
});

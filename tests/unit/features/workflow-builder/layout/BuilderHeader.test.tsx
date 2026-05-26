/**
 * Tests for features/workflow-builder/layout/BuilderHeader.
 *
 * BuilderHeader (Slice 4.BUILDER-UI-SHELL-1) is the new compact strip that
 * owns workflow identity (read-only name) + the lifted Save button + the
 * Saved / Unsaved / Saving / Error status pill. It reads save state
 * straight from the graph slice and wires Cmd/Ctrl+S via
 * useBuilderShortcuts.
 *
 * The companion WorkflowBuilder integration test
 * (tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx) already
 * exercises the full add → save → "Saved." round-trip end-to-end, so this
 * file targets the header surface in isolation: status pill states, save
 * button accessibility, and the Cmd+S keyboard wiring.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

import { BuilderHeader } from "@/features/workflow-builder/layout/BuilderHeader";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

describe("BuilderHeader — render contract", () => {
  it("renders the workflow name in a header landmark", () => {
    render(<BuilderHeader workflowName="My workflow" />);
    expect(
      screen.getByRole("banner", { name: /workflow builder header/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("My workflow")).toBeInTheDocument();
  });

  it("renders a Save button (the WorkflowBuilder integration test asserts on this exact accessible name)", () => {
    render(<BuilderHeader workflowName="x" />);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });
});

describe("BuilderHeader — status pill", () => {
  it("shows no pill when the slice is clean and has never saved", () => {
    render(<BuilderHeader workflowName="x" />);
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
    expect(screen.queryByText(/saving/i)).toBeNull();
    expect(screen.queryByText(/^saved\.$/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows 'Unsaved changes' once the slice becomes dirty", () => {
    render(<BuilderHeader workflowName="x" />);
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
    });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("surfaces saveError inside a role='alert' pill (preserves the WorkflowBuilder integration contract)", () => {
    render(<BuilderHeader workflowName="x" />);
    // Drive the slice into the error state via its public save() path so we
    // exercise the real reducer wiring rather than poking internal fields.
    mockUpdateWorkflow.mockRejectedValueOnce(new Error("network down"));
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
    });
    return useGraphSlice
      .getState()
      .save()
      .catch(() => undefined)
      .then(() => {
        const alert = screen.getByRole("alert");
        expect(alert.textContent ?? "").toMatch(/failed to save/i);
      });
  });
});

describe("BuilderHeader — Save behavior", () => {
  it("Save is disabled when the slice is clean", () => {
    render(<BuilderHeader workflowName="x" />);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("Save becomes enabled once the slice is dirty and dispatches updateWorkflow on click", async () => {
    const user = userEvent.setup();
    mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: body.draftDefinition,
      deletedAt: null,
      createdAt: "2026-05-25T00:00:00Z",
      updatedAt: "2026-05-25T00:00:00Z",
    }));
    render(<BuilderHeader workflowName="x" />);
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
    });
    const btn = screen.getByRole("button", { name: /^save$/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        draftDefinition: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ kind: "trigger", provider: "slack" }),
          ]),
        }),
      }),
    );
    expect(await screen.findByText(/^saved\.$/i)).toBeInTheDocument();
  });
});

describe("BuilderHeader — Cmd+S keyboard wiring", () => {
  it("Cmd+S triggers Save when the slice is dirty", async () => {
    const user = userEvent.setup();
    mockUpdateWorkflow.mockResolvedValue({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: { nodes: [], edges: [] },
      deletedAt: null,
      createdAt: "2026-05-25T00:00:00Z",
      updatedAt: "2026-05-25T00:00:00Z",
    });
    render(<BuilderHeader workflowName="x" />);
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
    });
    await user.keyboard("{Meta>}s{/Meta}");
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });

  it("Cmd+S is a no-op when the slice is clean (no spurious updateWorkflow)", async () => {
    const user = userEvent.setup();
    render(<BuilderHeader workflowName="x" />);
    await user.keyboard("{Meta>}s{/Meta}");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

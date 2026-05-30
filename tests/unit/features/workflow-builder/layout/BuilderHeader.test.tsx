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

// Slice 4.WORKFLOWS-PAGE-1 follow-up — the header's back button calls
// `useRouter().push("/workflows")`. Override the global jest.setup default
// so the test can assert on the navigation target.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { BuilderHeader } from "@/features/workflow-builder/layout/BuilderHeader";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockPush.mockReset();
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

describe("BuilderHeader — back button (Slice 4.WORKFLOWS-PAGE-1 follow-up)", () => {
  it("renders an enabled 'Back to workflows' button", () => {
    render(<BuilderHeader workflowName="x" />);
    const back = screen.getByTestId("builder-header-back-button");
    expect(back).toBeInTheDocument();
    expect(back).toBeEnabled();
    expect(back).toHaveAccessibleName(/back to workflows/i);
  });

  it("clicking the back button navigates to /workflows", async () => {
    const user = userEvent.setup();
    render(<BuilderHeader workflowName="x" />);
    await user.click(screen.getByTestId("builder-header-back-button"));
    expect(mockPush).toHaveBeenCalledWith("/workflows");
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

describe("BuilderHeader — left rail toggle (LEFT-AGENT-1)", () => {
  it("does NOT render the rail toggle when the leftRail prop is omitted (SHELL-1 baseline)", () => {
    render(<BuilderHeader workflowName="x" />);
    expect(
      screen.queryByTestId("builder-header-left-rail-toggle"),
    ).toBeNull();
  });

  it("renders the toggle with 'Collapse React Agent' when leftRail is expanded", () => {
    render(
      <BuilderHeader
        workflowName="x"
        leftRail={{ isCollapsed: false, onToggle: () => undefined }}
      />,
    );
    const toggle = screen.getByTestId("builder-header-left-rail-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute("aria-label")).toMatch(
      /collapse react agent/i,
    );
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.getAttribute("data-collapsed")).toBe("false");
  });

  it("renders the toggle with 'Expand React Agent' when leftRail is collapsed", () => {
    render(
      <BuilderHeader
        workflowName="x"
        leftRail={{ isCollapsed: true, onToggle: () => undefined }}
      />,
    );
    const toggle = screen.getByTestId("builder-header-left-rail-toggle");
    expect(toggle.getAttribute("aria-label")).toMatch(/expand react agent/i);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("data-collapsed")).toBe("true");
  });

  it("clicking the toggle fires onToggle exactly once", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <BuilderHeader
        workflowName="x"
        leftRail={{ isCollapsed: false, onToggle }}
      />,
    );
    await user.click(screen.getByTestId("builder-header-left-rail-toggle"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not mention a general / app-level assistant on the toggle (scope guardrail)", () => {
    render(
      <BuilderHeader
        workflowName="x"
        leftRail={{ isCollapsed: false, onToggle: () => undefined }}
      />,
    );
    const toggle = screen.getByTestId("builder-header-left-rail-toggle");
    expect(toggle.getAttribute("aria-label") ?? "").not.toMatch(
      /help assistant/i,
    );
  });
});

describe("BuilderHeader — validation pill (VALIDATION-1)", () => {
  it("does NOT render the validation pill when the validation prop is omitted (SHELL-1 baseline)", () => {
    render(<BuilderHeader workflowName="x" />);
    expect(
      screen.queryByTestId("builder-header-validation-pill"),
    ).toBeNull();
  });

  it("renders a 'Ready' pill when there are no issues (configured trigger present)", () => {
    // Hydrate has already run in beforeEach. Add a configured trigger.
    act(() => {
      useGraphSlice.getState().addTriggerFromMeta({
        key: "slack:slack.message",
        provider: "slack",
        type: "slack:message",
        displayName: "Slack Message",
        description: "x",
        category: "messaging",
        activation: "webhook",
        requiresIntegration: true,
        fields: [],
        payloadShape: [],
        displayOrder: 10,
      });
    });
    render(
      <BuilderHeader
        workflowName="x"
        validation={{ onOpen: () => undefined }}
      />,
    );
    const pill = screen.getByTestId("builder-header-validation-pill");
    expect(pill.getAttribute("data-state")).toBe("ready");
    expect(pill.textContent).toMatch(/ready/i);
  });

  it("renders an issue count when validation errors exist (no_trigger on empty workflow)", () => {
    // beforeEach hydrates with no nodes → no_trigger error fires.
    render(
      <BuilderHeader
        workflowName="x"
        validation={{ onOpen: () => undefined }}
      />,
    );
    const pill = screen.getByTestId("builder-header-validation-pill");
    expect(pill.getAttribute("data-state")).toBe("error");
    expect(pill.getAttribute("data-error-count")).toBe("1");
    expect(pill.textContent).toMatch(/^1 issue$/i);
  });

  it("pluralizes 'issues' when there is more than one", () => {
    act(() => {
      // No trigger + an unconfigured action → 2 errors.
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    render(
      <BuilderHeader
        workflowName="x"
        validation={{ onOpen: () => undefined }}
      />,
    );
    const pill = screen.getByTestId("builder-header-validation-pill");
    expect(pill.textContent).toMatch(/^2 issues$/i);
  });

  it("clicking the pill fires onOpen exactly once", async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    render(
      <BuilderHeader
        workflowName="x"
        validation={{ onOpen }}
      />,
    );
    await user.click(screen.getByTestId("builder-header-validation-pill"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("uses aria-label 'Open validation summary' on the pill", () => {
    render(
      <BuilderHeader
        workflowName="x"
        validation={{ onOpen: () => undefined }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /open validation summary/i }),
    ).toBeInTheDocument();
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

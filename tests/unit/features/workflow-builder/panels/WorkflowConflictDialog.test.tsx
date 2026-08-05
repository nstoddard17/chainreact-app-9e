/**
 * @jest-environment jsdom
 *
 * WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — the shared conflict
 * dialog. Drives the REAL graphSlice (conflict entered via flagConflict);
 * mocks only the typed API client.
 *
 * User-visible contract:
 *   - explains that the changes were NOT saved, without accusing any specific
 *     user and without exposing internal revision tokens;
 *   - "Keep my changes here" dismisses to a persistent reminder banner (the
 *     conflict is still resolvable later — never silently forgotten);
 *   - "Reload latest version" requires an explicit discard confirmation BEFORE
 *     anything replaces the local draft, and hydrates the newer server
 *     revision only after that confirmation.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockGetWorkflowApi = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    getWorkflow: (...args: unknown[]) => mockGetWorkflowApi(...args),
  };
});

import { WorkflowConflictDialog } from "@/features/workflow-builder/panels/WorkflowConflictDialog";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

const REV = "2026-08-01T00:00:00.000Z";
const NEWER = "2026-08-01T00:05:00.000Z";

const BASE_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "t1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: { channel: "C1" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

const LATEST_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "t1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: { channel: "C-latest" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

beforeEach(() => {
  mockGetWorkflowApi.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", BASE_DEF, REV);
});

function enterConflict(): void {
  useGraphSlice.getState().flagConflict({ source: "manual_save", latestRevision: NEWER });
}

it("renders nothing while there is no conflict", () => {
  render(<WorkflowConflictDialog />);
  expect(screen.queryByTestId("workflow-conflict-dialog")).not.toBeInTheDocument();
  expect(screen.queryByTestId("workflow-conflict-banner")).not.toBeInTheDocument();
});

it("shows the conflict dialog with honest, neutral copy — and no internal revision values", () => {
  enterConflict();
  render(<WorkflowConflictDialog />);
  const dialog = screen.getByTestId("workflow-conflict-dialog");
  expect(dialog).toHaveTextContent(/this workflow changed elsewhere/i);
  expect(dialog).toHaveTextContent(/your changes have not been saved/i);
  // Neutral attribution — never a specific person.
  expect(dialog).toHaveTextContent(/another tab or account member/i);
  // No internal token leaks into the UI.
  expect(dialog.textContent).not.toContain(NEWER);
  expect(dialog.textContent).not.toContain(REV);
});

it("'Keep my changes here' dismisses to a persistent reminder banner; 'Review' reopens the dialog", () => {
  enterConflict();
  render(<WorkflowConflictDialog />);
  fireEvent.click(screen.getByTestId("workflow-conflict-keep"));

  expect(screen.queryByTestId("workflow-conflict-dialog")).not.toBeInTheDocument();
  const banner = screen.getByTestId("workflow-conflict-banner");
  expect(banner).toHaveTextContent(/changed elsewhere/i);
  expect(banner).toHaveTextContent(/not saved/i);
  // Local edits stay intact behind the banner.
  expect(useGraphSlice.getState().conflict).not.toBeNull();

  fireEvent.click(screen.getByTestId("workflow-conflict-banner-review"));
  expect(screen.getByTestId("workflow-conflict-dialog")).toBeInTheDocument();
});

it("reload requires explicit confirmation; 'Go back' cancels without touching the draft", () => {
  enterConflict();
  render(<WorkflowConflictDialog />);
  fireEvent.click(screen.getByTestId("workflow-conflict-reload"));

  const confirm = screen.getByTestId("workflow-conflict-reload-confirm");
  expect(confirm).toHaveTextContent(/discard/i);
  expect(mockGetWorkflowApi).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("workflow-conflict-cancel-reload"));
  expect(screen.queryByTestId("workflow-conflict-reload-confirm")).not.toBeInTheDocument();
  expect(mockGetWorkflowApi).not.toHaveBeenCalled();
  expect(useGraphSlice.getState().conflict).not.toBeNull();
});

it("confirmed reload hydrates the latest server revision and clears the conflict (dialog disappears)", async () => {
  enterConflict();
  mockGetWorkflowApi.mockResolvedValueOnce({
    id: "wf-1",
    draftDefinition: LATEST_DEF,
    updatedAt: NEWER,
  });
  render(<WorkflowConflictDialog />);
  fireEvent.click(screen.getByTestId("workflow-conflict-reload"));
  fireEvent.click(screen.getByTestId("workflow-conflict-confirm-reload"));

  await waitFor(() =>
    expect(screen.queryByTestId("workflow-conflict-dialog")).not.toBeInTheDocument(),
  );
  const s = useGraphSlice.getState();
  expect(s.conflict).toBeNull();
  expect(s.hydratedRevision).toBe(NEWER);
  expect((s.pendingNodes[0]!.config as { channel?: string }).channel).toBe("C-latest");
});

it("a failed reload keeps the conflict and shows a retryable error (never clears without fresh state)", async () => {
  enterConflict();
  mockGetWorkflowApi.mockRejectedValueOnce(new TypeError("fetch failed"));
  render(<WorkflowConflictDialog />);
  fireEvent.click(screen.getByTestId("workflow-conflict-reload"));
  fireEvent.click(screen.getByTestId("workflow-conflict-confirm-reload"));

  await waitFor(() =>
    expect(screen.getByTestId("workflow-conflict-reload-error")).toBeInTheDocument(),
  );
  expect(useGraphSlice.getState().conflict).not.toBeNull();
  expect(screen.getByTestId("workflow-conflict-dialog")).toBeInTheDocument();
});

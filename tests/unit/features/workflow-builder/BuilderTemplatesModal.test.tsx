/**
 * @jest-environment jsdom
 *
 * features/workflow-builder/panels/BuilderTemplatesModal (CS-XT-IN-BUILDER). Mocks the
 * template API client, the router, and the graph slice. Proves: loading → list → empty →
 * error/retry states; "Create new workflow" reuses the use-template path and navigates;
 * "Replace current" requires an explicit confirmation; a confirmed replace validates/applies
 * (re-hydrates the canvas) + closes; canceling leaves the workflow untouched (no replace
 * call); and action errors surface visibly. Replacement never touches a template-write API.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = {
  listMarketplaceTemplates: jest.fn(),
  createWorkflowFromTemplateForCurrent: jest.fn(),
  replaceCurrentWorkflowFromTemplate: jest.fn(),
};
jest.mock("@/lib/api/workflowTemplates", () => ({
  listMarketplaceTemplates: (...a: unknown[]) => api.listMarketplaceTemplates(...a),
  createWorkflowFromTemplateForCurrent: (...a: unknown[]) => api.createWorkflowFromTemplateForCurrent(...a),
  replaceCurrentWorkflowFromTemplate: (...a: unknown[]) => api.replaceCurrentWorkflowFromTemplate(...a),
  TemplateApiError: class TemplateApiError extends Error {
    code: string; status: number;
    constructor(m: string, c: string, s: number) { super(m); this.code = c; this.status = s; }
  },
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockHydrate = jest.fn();
jest.mock("@/features/workflow-builder/state/graphSlice", () => ({
  useGraphSlice: { getState: () => ({ hydrate: mockHydrate }) },
}));

import { BuilderTemplatesModal } from "@/features/workflow-builder/panels/BuilderTemplatesModal";
import { TemplateApiError } from "@/lib/api/workflowTemplates";

const WF = "wf-current";

function tpl(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1", name: "Failed payment recovery", description: "Catch declined charges.",
    source: "official", isOfficial: true, visibility: "public", creatorDisplayName: null,
    usageCount: 10, forkCount: 2, forkedFromTemplateId: null, publishedAt: "2026-06-01T00:00:00Z",
    schemaVersion: 1, createdAt: "2026-06-01T00:00:00Z", ...over,
  };
}

function renderModal(
  over: { isDirty?: boolean; workflowState?: "draft" | "active" | "paused" | "disabled"; onClose?: () => void } = {},
) {
  const onClose = over.onClose ?? jest.fn();
  render(
    <BuilderTemplatesModal
      workflowId={WF}
      isDirty={over.isDirty ?? false}
      workflowState={over.workflowState ?? "draft"}
      onClose={onClose}
    />,
  );
  return { onClose };
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  mockPush.mockReset();
  mockHydrate.mockReset();
  api.listMarketplaceTemplates.mockResolvedValue([tpl()]);
});

describe("BuilderTemplatesModal — list states", () => {
  it("shows loading, then renders templates with attribution", async () => {
    api.listMarketplaceTemplates.mockResolvedValue([
      tpl({ id: "off", isOfficial: true }),
      tpl({ id: "com", name: "Lead capture", isOfficial: false, source: "user", creatorDisplayName: "Priya" }),
    ]);
    renderModal();
    expect(screen.getByTestId("builder-templates-loading")).toBeInTheDocument();
    expect(await screen.findByText("Failed payment recovery")).toBeInTheDocument();
    expect(screen.getByText("Lead capture")).toBeInTheDocument();
    expect(screen.getByTestId("builder-template-official")).toBeInTheDocument();
    expect(screen.getByText(/By Priya/)).toBeInTheDocument();
  });

  it("renders the empty state when no templates exist", async () => {
    api.listMarketplaceTemplates.mockResolvedValue([]);
    renderModal();
    expect(await screen.findByTestId("builder-templates-empty")).toBeInTheDocument();
  });

  it("renders an error + retry that re-fetches", async () => {
    api.listMarketplaceTemplates.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderModal();
    expect(await screen.findByTestId("builder-templates-error")).toBeInTheDocument();
    api.listMarketplaceTemplates.mockResolvedValueOnce([tpl()]);
    await user.click(screen.getByTestId("builder-templates-retry"));
    expect(await screen.findByText("Failed payment recovery")).toBeInTheDocument();
  });
});

describe("BuilderTemplatesModal — create new workflow", () => {
  it("reuses the use-template path and navigates to the new workflow", async () => {
    api.createWorkflowFromTemplateForCurrent.mockResolvedValue({ workflowId: "wf-new", name: "New" });
    const user = userEvent.setup();
    renderModal();
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-create-tpl-1"));
    await waitFor(() => expect(api.createWorkflowFromTemplateForCurrent).toHaveBeenCalledWith(WF, "tpl-1"));
    expect(mockPush).toHaveBeenCalledWith("/workflows/wf-new");
    // Create must not have replaced the current workflow.
    expect(api.replaceCurrentWorkflowFromTemplate).not.toHaveBeenCalled();
  });
});

describe("BuilderTemplatesModal — replace current workflow", () => {
  it("requires an explicit confirmation before calling the replace API", async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    // Confirmation dialog appears; NO replace call yet.
    expect(screen.getByTestId("builder-templates-replace-confirm")).toBeInTheDocument();
    expect(api.replaceCurrentWorkflowFromTemplate).not.toHaveBeenCalled();
  });

  it("canceling the confirmation leaves the workflow untouched (no replace, no hydrate, no close)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    await user.click(screen.getByTestId("builder-templates-replace-cancel"));
    expect(screen.queryByTestId("builder-templates-replace-confirm")).toBeNull();
    expect(api.replaceCurrentWorkflowFromTemplate).not.toHaveBeenCalled();
    expect(mockHydrate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Modal still open.
    expect(screen.getByTestId("builder-templates-modal")).toBeInTheDocument();
  });

  it("confirmed replace applies the template (re-hydrates the canvas) and closes", async () => {
    const newDef = { nodes: [{ id: "n1", kind: "trigger", provider: "slack", type: "x", position: { x: 0, y: 0 }, config: {} }], edges: [] };
    api.replaceCurrentWorkflowFromTemplate.mockResolvedValue({ id: WF, draftDefinition: newDef, updatedAt: "2026-06-09T00:00:00Z" });
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    await user.click(screen.getByTestId("builder-templates-replace-confirm-button"));
    await waitFor(() => expect(api.replaceCurrentWorkflowFromTemplate).toHaveBeenCalledWith(WF, "tpl-1"));
    expect(mockHydrate).toHaveBeenCalledWith(WF, newDef, "2026-06-09T00:00:00Z");
    expect(onClose).toHaveBeenCalled();
  });

  it("warns about unsaved changes in the confirmation when the builder is dirty", async () => {
    const user = userEvent.setup();
    renderModal({ isDirty: true });
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    expect(screen.getByTestId("builder-templates-replace-dirty-warning")).toBeInTheDocument();
  });

  it("shows a stronger warning when the current workflow is ACTIVE (stays active; review/test)", async () => {
    const user = userEvent.setup();
    renderModal({ workflowState: "active" });
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    const warning = screen.getByTestId("builder-templates-replace-active-warning");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/currently active/i);
    expect(warning).toHaveTextContent(/review its connections and test it/i);
  });

  it("does NOT show the active warning for a draft workflow", async () => {
    const user = userEvent.setup();
    renderModal({ workflowState: "draft" });
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    expect(screen.queryByTestId("builder-templates-replace-active-warning")).toBeNull();
    // The base copy still steers users to reconnect + test before relying on it.
    expect(screen.getByTestId("builder-templates-replace-confirm")).toHaveTextContent(/reconnect any accounts and test/i);
  });

  it("surfaces a permission/update error visibly and does not hydrate or close", async () => {
    api.replaceCurrentWorkflowFromTemplate.mockRejectedValue(new TemplateApiError("Workflow not found.", "WORKFLOW_NOT_FOUND", 404));
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText("Failed payment recovery");
    await user.click(screen.getByTestId("builder-template-replace-tpl-1"));
    await user.click(screen.getByTestId("builder-templates-replace-confirm-button"));
    expect(await screen.findByTestId("builder-templates-action-error")).toHaveTextContent(/workflow not found/i);
    expect(mockHydrate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

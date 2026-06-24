/**
 * ANON-BUILDER-2/3 — idempotent post-auth restore of an anonymous draft.
 *
 * Proves: a real workflow is created + the skeleton imported only while
 * authenticated; on partial failure the created workflow id is persisted and a
 * retry REUSES it (no duplicate empty workflow); an invalid stored target
 * recovers safely; the draft + target are cleared on success and RETAINED on
 * failure; the prompt + reason are parked; nothing auto-activates/runs.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateWorkflow = jest.fn();
const mockUpdateWorkflow = jest.fn();
const mockGetWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    createWorkflow: (...a: unknown[]) => mockCreateWorkflow(...a),
    updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
    getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
  };
});

const mockReplace = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: jest.fn() }),
}));

import { AnonymousDraftRestorer } from "@/features/workflow-builder/AnonymousDraftRestorer";
import { WorkflowApiError } from "@/lib/api/workflows";
import {
  consumeRestoredContext,
  readAnonDraft,
  readRestoreTarget,
  saveAnonDraft,
} from "@/lib/anonymousBuilder";

const DRAFT_KEY = "chainreact:anon-builder-draft";

beforeEach(() => {
  mockCreateWorkflow.mockReset();
  mockUpdateWorkflow.mockReset();
  mockGetWorkflow.mockReset();
  mockReplace.mockReset();
  mockRefresh.mockReset();
  window.localStorage.clear();
});

function seedDraft() {
  saveAnonDraft({
    prompt: "Notify #wins on a 5-star review",
    nodes: [
      { id: "t1", kind: "trigger", provider: "slack", type: "slack.message", config: { secretToken: "nope" } },
      { id: "a1", kind: "action", provider: "slack", type: "send", config: { channel: "#wins" } },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  });
}

describe("AnonymousDraftRestorer — happy path", () => {
  it("creates a real workflow, imports the sanitized skeleton, parks prompt+reason, clears draft+target", async () => {
    seedDraft();
    mockCreateWorkflow.mockResolvedValue({ id: "wf-new", name: "x", state: "draft" });
    mockUpdateWorkflow.mockResolvedValue({ id: "wf-new" });

    render(<AnonymousDraftRestorer reason="activate" />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows/wf-new"));

    expect(mockCreateWorkflow).toHaveBeenCalledWith({ name: "Notify #wins on a 5-star review" });
    const def = mockUpdateWorkflow.mock.calls[0][1].draftDefinition;
    expect(def.nodes).toHaveLength(2);
    expect(def.nodes[0].config).not.toHaveProperty("secretToken");
    // Prompt + reason parked for the real builder; anon draft + target cleared.
    expect(consumeRestoredContext("wf-new")).toEqual({
      prompt: "Notify #wins on a 5-star review",
      reason: "activate",
    });
    expect(readAnonDraft()).toBeNull();
    expect(readRestoreTarget()).toBe("");
  });

  it("redirects home when there's no draft (nothing created)", async () => {
    render(<AnonymousDraftRestorer />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows"));
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
  });
});

describe("AnonymousDraftRestorer — idempotency (Scope A)", () => {
  it("persists the created workflow id when the skeleton PATCH fails", async () => {
    seedDraft();
    mockCreateWorkflow.mockResolvedValue({ id: "wf-created", name: "x", state: "draft" });
    mockUpdateWorkflow.mockRejectedValue(new Error("import failed"));

    render(<AnonymousDraftRestorer reason="save" />);

    await screen.findByTestId("anonymous-restore-error");
    // Created id stored BEFORE the PATCH → kept for retry; draft retained.
    expect(readRestoreTarget()).toBe("wf-created");
    expect(readAnonDraft()).not.toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeTruthy();
  });

  it("retry REUSES the stored workflow id and does not create another workflow", async () => {
    seedDraft();
    mockCreateWorkflow.mockResolvedValue({ id: "wf-created", name: "x", state: "draft" });
    mockUpdateWorkflow.mockRejectedValueOnce(new Error("import failed"));
    mockUpdateWorkflow.mockResolvedValue({ id: "wf-created" });
    // On retry the restorer verifies the existing target is accessible.
    mockGetWorkflow.mockResolvedValue({ id: "wf-created" });

    render(<AnonymousDraftRestorer reason="save" />);
    const retry = await screen.findByTestId("anonymous-restore-retry");
    await userEvent.click(retry);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows/wf-created"));
    // createWorkflow called exactly ONCE across both attempts — no duplicate.
    expect(mockCreateWorkflow).toHaveBeenCalledTimes(1);
    expect(mockGetWorkflow).toHaveBeenCalledWith("wf-created");
    // Success clears the draft + target.
    expect(readAnonDraft()).toBeNull();
    expect(readRestoreTarget()).toBe("");
  });

  it("recovers when the stored target is gone (404): clears it and creates a new workflow once", async () => {
    seedDraft();
    // Pre-existing stale target from a previous attempt.
    window.localStorage.setItem("chainreact:anon-restore-target", "wf-deleted");
    mockGetWorkflow.mockRejectedValue(new WorkflowApiError("gone", "WORKFLOW_NOT_FOUND", 404));
    mockCreateWorkflow.mockResolvedValue({ id: "wf-fresh", name: "x", state: "draft" });
    mockUpdateWorkflow.mockResolvedValue({ id: "wf-fresh" });

    render(<AnonymousDraftRestorer />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows/wf-fresh"));
    expect(mockCreateWorkflow).toHaveBeenCalledTimes(1);
    expect(readRestoreTarget()).toBe("");
  });

  it("a transient verify error does NOT create a duplicate (keeps target, shows retry)", async () => {
    seedDraft();
    window.localStorage.setItem("chainreact:anon-restore-target", "wf-existing");
    mockGetWorkflow.mockRejectedValue(new WorkflowApiError("server", "SERVER_ERROR", 500));

    render(<AnonymousDraftRestorer />);

    await screen.findByTestId("anonymous-restore-error");
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
    expect(readRestoreTarget()).toBe("wf-existing");
    expect(readAnonDraft()).not.toBeNull();
  });
});

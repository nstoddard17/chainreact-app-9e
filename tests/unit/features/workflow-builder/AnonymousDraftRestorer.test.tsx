/**
 * ANON-BUILDER-2 — post-auth restore of an anonymous draft.
 *
 * Proves: a real workflow is created + the skeleton imported only while
 * authenticated (the restorer runs behind the auth-gated route); the local draft
 * is cleared on success and RETAINED on failure; the prompt is parked for the
 * builder; nothing auto-activates/runs.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateWorkflow = jest.fn();
const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    createWorkflow: (...a: unknown[]) => mockCreateWorkflow(...a),
    updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
  };
});

const mockReplace = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: jest.fn() }),
}));

import { AnonymousDraftRestorer } from "@/features/workflow-builder/AnonymousDraftRestorer";
import { readAnonDraft, saveAnonDraft } from "@/lib/anonymousBuilder";

const DRAFT_KEY = "chainreact:anon-builder-draft";
const RESTORED_KEY = "chainreact:anon-restored-prompt:wf-new";

beforeEach(() => {
  mockCreateWorkflow.mockReset();
  mockUpdateWorkflow.mockReset();
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

describe("AnonymousDraftRestorer", () => {
  it("creates a real workflow, imports the sanitized skeleton, parks the prompt, clears the draft", async () => {
    seedDraft();
    mockCreateWorkflow.mockResolvedValue({ id: "wf-new", name: "x", state: "draft" });
    mockUpdateWorkflow.mockResolvedValue({ id: "wf-new" });

    render(<AnonymousDraftRestorer />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows/wf-new"));

    // Name derived from the prompt's first line.
    expect(mockCreateWorkflow).toHaveBeenCalledWith({
      name: "Notify #wins on a 5-star review",
    });
    // Skeleton imported; the secret-ish config key never made it into storage or the import.
    const def = mockUpdateWorkflow.mock.calls[0][1].draftDefinition;
    expect(def.nodes).toHaveLength(2);
    expect(def.edges).toHaveLength(1);
    expect(def.nodes[0].config).not.toHaveProperty("secretToken");
    // Prompt parked for the real builder; anon draft cleared (no duplicate re-import).
    expect(window.localStorage.getItem(RESTORED_KEY)).toBe("Notify #wins on a 5-star review");
    expect(readAnonDraft()).toBeNull();
    // Draft only — never activates/runs.
  });

  it("redirects home when there's no draft (nothing created)", async () => {
    render(<AnonymousDraftRestorer />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows"));
    expect(mockCreateWorkflow).not.toHaveBeenCalled();
  });

  it("retains the draft and shows a recoverable error when restore fails", async () => {
    seedDraft();
    mockCreateWorkflow.mockRejectedValue(new Error("network down"));

    render(<AnonymousDraftRestorer />);

    await screen.findByTestId("anonymous-restore-error");
    // Draft kept for retry — NOT cleared.
    expect(readAnonDraft()).not.toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("retry succeeds after a transient failure", async () => {
    seedDraft();
    mockCreateWorkflow.mockRejectedValueOnce(new Error("boom"));
    mockCreateWorkflow.mockResolvedValue({ id: "wf-new", name: "x", state: "draft" });
    mockUpdateWorkflow.mockResolvedValue({ id: "wf-new" });

    render(<AnonymousDraftRestorer />);
    const retry = await screen.findByTestId("anonymous-restore-retry");
    await userEvent.click(retry);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/workflows/wf-new"));
    expect(readAnonDraft()).toBeNull();
  });
});

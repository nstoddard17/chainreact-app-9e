/**
 * Document Builder — bottom React Agent workspace (DOC-REACT-AGENT-1).
 *
 * Two layers, both against the REAL logic:
 *   - the pure context/reference model (`documentAgentContext`), which decides
 *     what the agent is "working on" and which sentences a pending proposal
 *     touches — derived from the EXISTING projection + preview, never a second
 *     selection or diff format;
 *   - the workspace component itself: expand/collapse, accessible labels and
 *     focus states, keyboard reachability, the temporary sentence highlight,
 *     and no horizontal overflow at a narrow width.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentAgentWorkspace } from "@/features/workflow-builder/document/DocumentAgentWorkspace";
import {
  WHOLE_WORKFLOW_CONTEXT,
  describeProposalChanges,
  resolveDocumentAgentContext,
  titleForNodeId,
} from "@/features/workflow-builder/document/documentAgentContext";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";
import type { DocumentPreviewModel } from "@/features/workflow-builder/document/documentPreviewProjection";

const nodes = [
  { id: "t", kind: "trigger" as const, provider: "native", type: "scheduled", config: {}, position: { x: 0, y: 0 } },
  { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 100 } },
  { id: "b", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 200 } },
];
const edges = [
  { id: "e1", from: "t", to: "a" },
  { id: "e2", from: "a", to: "b" },
];
const meta = {
  requiredFieldsByType: {
    "native:scheduled": { displayName: "Scheduled Trigger", requiredFields: [{ name: "cron", label: "Schedule" }] },
    "slack:send_channel_message": {
      displayName: "Send Channel Message",
      requiredFields: [{ name: "text", label: "Message" }],
    },
  },
  summaryFieldsByType: {
    "native:scheduled": { displayName: "Scheduled Trigger", fields: [{ name: "cron", label: "Schedule", type: "cron" as const, required: true }] },
    "slack:send_channel_message": {
      displayName: "Send Channel Message",
      fields: [{ name: "text", label: "Message", type: "textarea" as const, required: true }],
    },
  },
};
const model = projectDefinitionToDocument({
  nodes,
  edges,
  requiredFieldsByType: meta.requiredFieldsByType,
  summaryFieldsByType: meta.summaryFieldsByType,
});

describe("agent context follows the locked priority", () => {
  it("an open unresolved field wins over everything else", () => {
    const ctx = resolveDocumentAgentContext({
      model,
      stop: { nodeId: "t", fieldName: "cron" },
      selectedIds: new Set(["a", "b"]),
    });
    expect(ctx.kind).toBe("field");
    expect(ctx.label).toBe("Schedule");
    expect(ctx.nodeId).toBe("t");
    expect(ctx.clearable).toBe(true);
  });

  it("a single focused sentence is enough — multi-select is never required", () => {
    const ctx = resolveDocumentAgentContext({ model, stop: null, selectedIds: new Set(["a"]) });
    expect(ctx.kind).toBe("step");
    expect(ctx.label).toBe("Send Channel Message");
    expect(ctx.nodeId).toBe("a");
  });

  it("a multi-selection inside ONE group reads as that group", () => {
    const ctx = resolveDocumentAgentContext({
      model,
      stop: null,
      selectedIds: new Set(["a", "b"]),
      presentation: { version: 1, sections: [{ id: "s1", title: "Notify the team", nodeIds: ["a", "b"] }] },
    });
    expect(ctx.kind).toBe("group");
    expect(ctx.label).toBe("Notify the team");
  });

  it("nothing selected → the whole workflow, and it is not clearable", () => {
    const ctx = resolveDocumentAgentContext({ model, stop: null, selectedIds: new Set() });
    expect(ctx).toEqual(WHOLE_WORKFLOW_CONTEXT);
    expect(ctx.clearable).toBe(false);
  });

  it("resolves a step title from the projected document", () => {
    expect(titleForNodeId(model, "b")).toBe("Send Channel Message");
    expect(titleForNodeId(model, "ghost")).toBe("this step");
  });
});

describe("proposal changes come from the EXISTING preview projection", () => {
  const preview: DocumentPreviewModel = {
    kind: "edit",
    title: "Proposed changes",
    summary: "One change",
    warnings: [],
    ghosts: [{ previewId: "p1", title: "Send Email", provider: "gmail", type: "send", purpose: "", missingInputs: [] }],
    proposedModel: null,
    statusByNodeId: new Map([
      ["a", "modified"],
      ["b", "unchanged"],
    ]),
    removed: [{ nodeId: "t", title: "Scheduled Trigger" }],
    needsVisualReview: false,
  };

  it("names the affected LIVE sentences and marks an added step as unfocusable", () => {
    const changes = describeProposalChanges(preview, model);
    expect(changes).toEqual([
      { nodeId: "a", title: "Send Channel Message", status: "changed" },
      { nodeId: null, title: "Send Email", status: "added" },
      { nodeId: "t", title: "Scheduled Trigger", status: "removed" },
    ]);
  });

  it("returns nothing without a proposal, and is bounded", () => {
    expect(describeProposalChanges(null, model)).toEqual([]);
    expect(describeProposalChanges(preview, model, 1)).toHaveLength(1);
  });
});

describe("the workspace surface", () => {
  const baseProps = {
    expanded: false,
    onExpandedChange: jest.fn(),
    busy: false,
    hasConversation: false,
    context: WHOLE_WORKFLOW_CONTEXT,
    onClearContext: jest.fn(),
    onSubmit: jest.fn(),
  };

  beforeEach(() => {
    baseProps.onExpandedChange.mockReset();
    baseProps.onClearContext.mockReset();
    baseProps.onSubmit.mockReset();
  });

  it("keeps the compact composer available and labels it for assistive tech", () => {
    render(<DocumentAgentWorkspace {...baseProps} />);
    const section = screen.getByTestId("document-agent-workspace");
    expect(section).toHaveAttribute("aria-label", "React Agent");
    expect(section).toHaveAttribute("data-expanded", "false");
    expect(screen.getByTestId("document-ask-react-input")).toHaveAttribute("aria-label", "Ask React");
    // Collapsed → no transcript region at all (no second full-height panel).
    expect(screen.queryByTestId("document-agent-transcript")).toBeNull();
  });

  it("submitting expands the workspace and sends the prompt onward", () => {
    render(<DocumentAgentWorkspace {...baseProps} />);
    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "  fix the schedule  " } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    expect(baseProps.onExpandedChange).toHaveBeenCalledWith(true);
    expect(baseProps.onSubmit).toHaveBeenCalledWith("fix the schedule");
    // The composer clears, ready for a follow-up.
    expect((screen.getByTestId("document-ask-react-input") as HTMLInputElement).value).toBe("");
  });

  it("an empty prompt never sends", () => {
    render(<DocumentAgentWorkspace {...baseProps} />);
    fireEvent.change(screen.getByTestId("document-ask-react-input"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("document-ask-react-submit"));
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it("expanded: transcript region, a labelled collapse control, and a polite status line", () => {
    render(
      <DocumentAgentWorkspace {...baseProps} expanded busy statusMessage="React proposed changes.">
        <p>transcript body</p>
      </DocumentAgentWorkspace>,
    );
    expect(screen.getByTestId("document-agent-transcript")).toHaveTextContent("transcript body");
    expect(screen.getByTestId("document-agent-busy")).toBeInTheDocument();
    const collapse = screen.getByTestId("document-agent-collapse");
    expect(collapse).toHaveAttribute("aria-label", "Collapse React Agent");
    expect(collapse.tagName).toBe("BUTTON");
    const status = screen.getByTestId("document-agent-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("React proposed changes.");

    fireEvent.click(collapse);
    expect(baseProps.onExpandedChange).toHaveBeenCalledWith(false);
    // The composer is still available while expanded (follow-up instructions).
    expect(screen.getByTestId("document-ask-react-input")).toBeInTheDocument();
  });

  it("re-opening is possible once there is a conversation", () => {
    render(<DocumentAgentWorkspace {...baseProps} hasConversation />);
    const expand = screen.getByTestId("document-agent-expand");
    expect(expand).toHaveAttribute("aria-label", "Show React Agent conversation");
    fireEvent.click(expand);
    expect(baseProps.onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("shows the working context and lets the user clear it", () => {
    render(
      <DocumentAgentWorkspace
        {...baseProps}
        context={{ kind: "step", label: "Teams message", nodeId: "a", fieldName: null, clearable: true }}
      />,
    );
    const chip = screen.getByTestId("document-agent-context");
    expect(chip).toHaveAttribute("data-context-kind", "step");
    expect(chip).toHaveTextContent("Working on: Teams message");
    const clear = screen.getByTestId("document-agent-context-clear");
    expect(clear).toHaveAttribute("aria-label", "Stop working on Teams message");
    fireEvent.click(clear);
    expect(baseProps.onClearContext).toHaveBeenCalled();
  });

  it("the whole-workflow context is shown but has no clear control", () => {
    render(<DocumentAgentWorkspace {...baseProps} />);
    expect(screen.getByTestId("document-agent-context")).toHaveTextContent("Working on: Whole workflow");
    expect(screen.queryByTestId("document-agent-context-clear")).toBeNull();
  });

  it("proposal references are keyboard-operable buttons that focus the named sentence", () => {
    const onFocusChange = jest.fn();
    render(
      <DocumentAgentWorkspace
        {...baseProps}
        expanded
        onFocusChange={onFocusChange}
        changes={[
          { nodeId: "a", title: "Teams message", status: "changed" },
          { nodeId: null, title: "Send Email", status: "added" },
        ]}
        proposalActions={<button type="button">Review changes</button>}
      />,
    );
    const ref = screen.getByTestId("document-agent-change-a");
    expect(ref.tagName).toBe("BUTTON");
    expect(ref).toHaveAttribute("aria-label", "Show “Teams message” in the workflow (changed)");
    fireEvent.click(ref);
    expect(onFocusChange).toHaveBeenCalledWith("a");
    // A step that does not exist yet is listed but not clickable.
    expect(screen.queryByTestId("document-agent-change-null")).toBeNull();
    expect(screen.getByTestId("document-agent-changes")).toHaveTextContent("Send Email");
    // The existing proposal controls are rendered here, not re-implemented.
    expect(screen.getByRole("button", { name: "Review changes" })).toBeInTheDocument();
  });

  it("stays inside the readable column at a narrow width (no horizontal overflow)", () => {
    render(<DocumentAgentWorkspace {...baseProps} expanded hasConversation />);
    const section = screen.getByTestId("document-agent-workspace");
    // The dock is width-capped and centred rather than fixed-width, so a narrow
    // viewport shrinks it instead of overflowing the document column.
    expect(section.className).toContain("max-w-[860px]");
    expect(section.className).toContain("w-full");
    expect(section.className).toContain("mx-auto");
    // The transcript scrolls internally rather than growing the page.
    expect(screen.getByTestId("document-agent-transcript").className).toContain("crv2-agent-body");
  });
});

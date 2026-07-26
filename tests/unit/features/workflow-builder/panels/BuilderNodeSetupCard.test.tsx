/**
 * BuilderNodeSetupCard — inline "Fix setup issues" card for EXISTING draft nodes
 * (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP).
 *
 * Proves it renders supported local controls for an existing node's missing required fields (async
 * select via the EXISTING resolver, textarea for message), applies sanitized values to the draft node
 * via onUpdateStep on "Update step", shows a safe "open the step" message for unsupported fields, and
 * never calls Hermes / a model / a mutation API itself.
 */
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderNodeSetupCard } from "@/features/workflow-builder/panels/BuilderNodeSetupCard";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

const slackTarget: CheckWorkflowSetupTarget = {
  nodeId: "a1",
  provider: "slack",
  type: "send_channel_message",
  label: "Send Channel Message",
  missingFieldNames: ["channel", "text"],
};

const setupFieldsByType: PreviewSetupFieldsByType = {
  "slack:send_channel_message": [
    { name: "channel", label: "Channel", type: "select-async", required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
};

describe("BuilderNodeSetupCard", () => {
  it("renders an async Channel dropdown (via the resolver, not Hermes) and a Message textarea", async () => {
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [{ value: "C1", label: "#general" }], hasMore: false });
    render(
      <BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} workflowId="wf-9" onUpdateStep={() => {}} />,
    );
    expect(screen.getByTestId("builder-node-setup-rail")).toBeInTheDocument();
    // Message renders as a textarea.
    expect((screen.getByTestId("node-setup-a1-text") as HTMLElement).tagName).toBe("TEXTAREA");
    // Channel loads through the existing resolver helper with workflow provenance — never Hermes.
    const channel = await screen.findByTestId("node-setup-a1-channel");
    await waitFor(() => expect(channel.querySelectorAll("option").length).toBe(2)); // placeholder + #general
    expect(mockFetchOptionsSource.mock.calls[0]![0]).toBe("slack:channels");
    expect(mockFetchOptionsSource.mock.calls[0]![1]).toMatchObject({ workflowId: "wf-9" });
  });

  it("filling fields and clicking 'Update step' applies sanitized values to the existing node", async () => {
    const user = userEvent.setup();
    const onUpdateStep = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [{ value: "C1", label: "#general" }], hasMore: false });
    render(
      <BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} workflowId="wf-9" onUpdateStep={onUpdateStep} />,
    );
    const channel = await screen.findByTestId("node-setup-a1-channel");
    await waitFor(() => expect(channel.querySelectorAll("option").length).toBe(2));
    fireEvent.change(channel, { target: { value: "C1" } });
    fireEvent.change(screen.getByTestId("node-setup-a1-text"), { target: { value: "Hello team" } });

    await user.click(screen.getByTestId("node-setup-a1-update"));

    expect(onUpdateStep).toHaveBeenCalledTimes(1);
    expect(onUpdateStep).toHaveBeenCalledWith("a1", { channel: "C1", text: "Hello team" });
    // Confirmation shown after applying.
    expect(screen.getByTestId("node-setup-a1-applied")).toBeInTheDocument();
  });

  it("shows a safe 'open the step' message for a field with no supported local control (e.g. secret/connection)", () => {
    // A required field that is NOT in setupFieldsByType (secret/connection fields are excluded upstream).
    const target: CheckWorkflowSetupTarget = { ...slackTarget, missingFieldNames: ["text", "apiKey"] };
    render(
      <BuilderNodeSetupCard nodes={[target]} setupFieldsByType={setupFieldsByType} onUpdateStep={() => {}} />,
    );
    // Supported field still renders a control…
    expect(screen.getByTestId("node-setup-a1-text")).toBeInTheDocument();
    // …the unsupported one shows the safe message, with no inline control.
    expect(screen.queryByTestId("node-setup-a1-apiKey")).toBeNull();
    expect(screen.getByTestId("node-setup-a1-unsupported")).toHaveTextContent(
      "Open Send Channel Message to finish setup.",
    );
  });

  // REACT-AGENT-RESOLVER-RECOVERY-1 — "open the step" must be something the user can actually DO.
  it("makes the 'open the step' message a working action when node reveal is wired", async () => {
    const user = userEvent.setup();
    const onFieldInteract = jest.fn();
    const target: CheckWorkflowSetupTarget = { ...slackTarget, missingFieldNames: ["apiKey"] };
    render(
      <BuilderNodeSetupCard
        nodes={[target]}
        setupFieldsByType={setupFieldsByType}
        onUpdateStep={() => {}}
        onFieldInteract={onFieldInteract}
      />,
    );
    await user.click(screen.getByTestId("node-setup-a1-unsupported-open"));
    expect(onFieldInteract).toHaveBeenCalledWith("a1", "apiKey", "focus");
  });

  // REACT-AGENT-RESOLVER-RECOVERY-1 — an EXISTING draft node's failed resolver gets the same shared
  // recovery block, and its step editor really opens (the node exists, so no apply is involved).
  it("offers a working Open step editor when an existing node's options fail to load", async () => {
    const user = userEvent.setup();
    const onFieldInteract = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "slack:channels",
      code: "PROVIDER_REAUTH_REQUIRED",
      message: "Your Slack connection is missing a required permission. Reconnect Slack to grant it.",
    });
    render(
      <BuilderNodeSetupCard
        nodes={[slackTarget]}
        setupFieldsByType={setupFieldsByType}
        onUpdateStep={() => {}}
        onFieldInteract={onFieldInteract}
        providerLabels={{ slack: "Slack" }}
      />,
    );
    const box = await screen.findByTestId("node-setup-a1-channel-error");
    expect(box).toHaveAttribute("data-recovery-kind", "reconnect-required");
    expect(box).toHaveTextContent(/missing a required permission/i);
    expect(box).not.toHaveTextContent(/You can finish this in the step editor/i);
    await user.click(screen.getByTestId("node-setup-a1-channel-open-step-editor"));
    expect(onFieldInteract).toHaveBeenCalledWith("a1", "channel", "focus");
  });

  it("renders only the 'open the step' message (no Update button) when no field is locally supported", () => {
    const target: CheckWorkflowSetupTarget = { ...slackTarget, missingFieldNames: ["apiKey"] };
    render(<BuilderNodeSetupCard nodes={[target]} setupFieldsByType={setupFieldsByType} onUpdateStep={() => {}} />);
    expect(screen.getByTestId("node-setup-a1-unsupported")).toBeInTheDocument();
    expect(screen.queryByTestId("node-setup-a1-update")).toBeNull();
  });

  it("pressing Enter in the Message textarea applies the update (parity with the Update step button)", async () => {
    const onUpdateStep = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [], hasMore: false });
    render(<BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} onUpdateStep={onUpdateStep} />);
    const text = await screen.findByTestId("node-setup-a1-text");
    fireEvent.change(text, { target: { value: "Hello team" } });
    fireEvent.keyDown(text, { key: "Enter" });
    expect(onUpdateStep).toHaveBeenCalledWith("a1", { text: "Hello team" });
  });

  it("Shift+Enter in the textarea does NOT submit (newline)", async () => {
    const onUpdateStep = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [], hasMore: false });
    render(<BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} onUpdateStep={onUpdateStep} />);
    const text = await screen.findByTestId("node-setup-a1-text");
    fireEvent.change(text, { target: { value: "line1" } });
    fireEvent.keyDown(text, { key: "Enter", shiftKey: true });
    expect(onUpdateStep).not.toHaveBeenCalled();
  });

  it("pressing Enter in a single-line text field submits the update", () => {
    const onUpdateStep = jest.fn();
    const target: CheckWorkflowSetupTarget = { ...slackTarget, missingFieldNames: ["subject"] };
    const fields: PreviewSetupFieldsByType = {
      "slack:send_channel_message": [{ name: "subject", label: "Subject", type: "text", required: true }],
    };
    render(<BuilderNodeSetupCard nodes={[target]} setupFieldsByType={fields} onUpdateStep={onUpdateStep} />);
    const input = screen.getByTestId("node-setup-a1-subject");
    fireEvent.change(input, { target: { value: "Standup" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdateStep).toHaveBeenCalledWith("a1", { subject: "Standup" });
  });

  it("focusing a control emits onFieldInteract(focus) with the metadata field KEY", async () => {
    const onFieldInteract = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [], hasMore: false });
    render(
      <BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} onUpdateStep={() => {}} onFieldInteract={onFieldInteract} />,
    );
    fireEvent.focus(await screen.findByTestId("node-setup-a1-text"));
    expect(onFieldInteract).toHaveBeenCalledWith("a1", "text", "focus");
  });

  it("selecting an async dropdown option emits onFieldInteract(change)", async () => {
    const onFieldInteract = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [{ value: "C1", label: "#general" }], hasMore: false });
    render(
      <BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} workflowId="wf-9" onUpdateStep={() => {}} onFieldInteract={onFieldInteract} />,
    );
    const channel = await screen.findByTestId("node-setup-a1-channel");
    await waitFor(() => expect(channel.querySelectorAll("option").length).toBe(2));
    fireEvent.change(channel, { target: { value: "C1" } });
    expect(onFieldInteract).toHaveBeenCalledWith("a1", "channel", "change");
  });

  it("is presentational: filling a control does not call the options mutation/Hermes path on its own", async () => {
    const onUpdateStep = jest.fn();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [], hasMore: false });
    render(<BuilderNodeSetupCard nodes={[slackTarget]} setupFieldsByType={setupFieldsByType} onUpdateStep={onUpdateStep} />);
    await screen.findByTestId("node-setup-a1-channel"); // let the async control settle
    fireEvent.change(screen.getByTestId("node-setup-a1-text"), { target: { value: "draft text" } });
    // Typing alone never applies anything (no implicit save/update).
    expect(onUpdateStep).not.toHaveBeenCalled();
  });
});

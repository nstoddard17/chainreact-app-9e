/**
 * Tests for AI-CONFIG-ASSIST CS-3 chat-fill bubble (ChatFillBody).
 *
 * Labels only — no raw node id / field key rendered. Proposal shows the exact
 * value + Confirm/Cancel (disabled once resolved); summary shows previous/new +
 * "Not saved yet"; blocked shows safe guidance. No Apply control anywhere.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatFillBody } from "@/features/workflow-builder/panels/_BuilderAiPanelChatFill";

const PROPOSAL = {
  nodeId: "slack1",
  fieldKey: "text",
  nodeLabel: "Send Channel Message",
  fieldLabel: "Message",
  previousValue: "",
  newValue: "hello from ChainReact",
};

describe("ChatFillBody — proposal", () => {
  it("renders the value + node/field LABELS, not raw ids/keys", () => {
    render(
      <ChatFillBody
        fill={{ phase: "proposal", proposal: PROPOSAL }}
        resolved={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const bubble = screen.getByTestId("builder-ai-chat-fill-proposal");
    expect(bubble).toHaveTextContent("Message");
    expect(bubble).toHaveTextContent("Send Channel Message");
    expect(screen.getByTestId("builder-ai-chat-fill-value")).toHaveTextContent("hello from ChainReact");
    // No raw node id / field key leaked.
    expect(bubble.textContent).not.toMatch(/\bslack1\b/);
    expect(bubble.textContent).not.toMatch(/\btext\b/);
    // No Apply control.
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
  });

  it("Confirm and Cancel call their handlers", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ChatFillBody
        fill={{ phase: "proposal", proposal: PROPOSAL }}
        resolved={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByTestId("builder-ai-chat-fill-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("builder-ai-chat-fill-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the buttons once resolved", () => {
    render(
      <ChatFillBody
        fill={{ phase: "proposal", proposal: PROPOSAL }}
        resolved
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByTestId("builder-ai-chat-fill-confirm")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-chat-fill-cancel")).toBeDisabled();
  });
});

describe("ChatFillBody — summary", () => {
  it("shows previous value, new value, and 'Not saved yet'", () => {
    render(
      <ChatFillBody
        fill={{ phase: "summary", proposal: { ...PROPOSAL, previousValue: "old" } }}
        resolved
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const summary = screen.getByTestId("builder-ai-chat-fill-summary");
    expect(summary).toHaveTextContent("Message");
    expect(summary).toHaveTextContent("Send Channel Message");
    expect(summary).toHaveTextContent("old");
    expect(summary).toHaveTextContent("hello from ChainReact");
    expect(summary).toHaveTextContent(/not saved yet/i);
    expect(summary.textContent).not.toMatch(/\bslack1\b/);
  });
});

describe("ChatFillBody — blocked", () => {
  it("renders safe guidance text", () => {
    render(
      <ChatFillBody
        fill={{ phase: "blocked", message: "This field holds sensitive data and can’t be auto-filled — enter it directly in the field." }}
        resolved={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByTestId("builder-ai-chat-fill-blocked")).toHaveTextContent(/sensitive/i);
    expect(screen.queryByTestId("builder-ai-chat-fill-confirm")).not.toBeInTheDocument();
  });
});

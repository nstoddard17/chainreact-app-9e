/**
 * Tests for AI-CONFIG-ASSIST CS-6 chat-fill discoverability in the composer
 * (BuilderAiPanelComposer).
 *
 * When the panel passes `chatFillHint` (an ELIGIBLE field is highlighted), the
 * composer shows a contextual helper hint + a field-specific placeholder so the
 * user knows they can type the missing value here. Labels only — never the raw
 * field key / node id. Absent → the composer behaves exactly as before.
 */
import { render, screen } from "@testing-library/react";
import { BuilderAiPanelComposer } from "@/features/workflow-builder/panels/_BuilderAiPanelComposer";

const baseProps = {
  prompt: "",
  onPromptChange: jest.fn(),
  onSubmit: jest.fn(),
  onClear: jest.fn(),
  followUpMode: false,
  planning: false,
  busy: false,
  hasMessages: false,
  onCheckWorkflow: jest.fn(),
  checking: false,
};

describe("BuilderAiPanelComposer — chat-fill hint (CS-6)", () => {
  it("shows the helper hint + Message placeholder when a field is highlighted", () => {
    render(
      <BuilderAiPanelComposer
        {...baseProps}
        chatFillHint={{ fieldLabel: "Message", nodeLabel: "Send Channel Message" }}
      />,
    );
    const hint = screen.getByTestId("builder-ai-chatfill-hint");
    expect(hint).toHaveTextContent("Message");
    // Says confirmation happens before filling, and that save stays manual.
    expect(hint.textContent).toMatch(/ask before filling/i);
    expect(hint.textContent).toMatch(/save manually/i);
    // Placeholder is field-specific.
    expect(screen.getByTestId("builder-ai-prompt")).toHaveAttribute("placeholder", "Type Message value…");
  });

  it("hint + placeholder use LABELS only — no raw field key / node id", () => {
    render(
      <BuilderAiPanelComposer
        {...baseProps}
        chatFillHint={{ fieldLabel: "Message", nodeLabel: "Send Channel Message" }}
      />,
    );
    const hint = screen.getByTestId("builder-ai-chatfill-hint");
    const placeholder = screen.getByTestId("builder-ai-prompt").getAttribute("placeholder") ?? "";
    expect(hint.textContent).not.toMatch(/\btext\b/); // the field KEY
    expect(hint.textContent).not.toMatch(/\bslack/i); // any node-id shape
    expect(placeholder).not.toMatch(/\btext\b/);
  });

  it("does NOT show the hint when no field is highlighted (default composer)", () => {
    render(<BuilderAiPanelComposer {...baseProps} chatFillHint={null} />);
    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    // Default planning placeholder restored.
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toMatch(/describe a change/i);
  });

  it("omitting the prop entirely behaves like the pre-CS-6 composer", () => {
    render(<BuilderAiPanelComposer {...baseProps} />);
    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toMatch(/describe a change/i);
  });

  it("keeps the follow-up placeholder when in follow-up mode with no chat-fill target", () => {
    render(<BuilderAiPanelComposer {...baseProps} followUpMode chatFillHint={null} />);
    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toMatch(/reply with the missing details/i);
  });
});

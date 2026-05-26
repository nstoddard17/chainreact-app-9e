/**
 * Tests for features/workflow-builder/ai/AiRequiredInputList.tsx (Slice 4.AI-14).
 *
 * Pin the Builder ("card") and Repair ("plain") variants, the optional
 * field-hint extension, and the no-leak / empty-items / stable-testId
 * guarantees both consumers depend on.
 */
import { render, screen } from "@testing-library/react";
import { AiRequiredInputList } from "@/features/workflow-builder/ai/AiRequiredInputList";

describe("AiRequiredInputList", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(
      <AiRequiredInputList title="Need from you:" items={[]} testId="x" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title + one <li> per item (default plain variant)", () => {
    render(
      <AiRequiredInputList
        title="Need from you:"
        items={[
          { label: "Which Slack user?", field: "userId" },
          { label: "Pick a channel" },
        ]}
        testId="repair-required-input"
      />,
    );
    const node = screen.getByTestId("repair-required-input");
    expect(node).toHaveTextContent("Need from you:");
    expect(node).toHaveTextContent("Which Slack user?");
    expect(node).toHaveTextContent("Pick a channel");
    expect(node.querySelectorAll("li")).toHaveLength(2);
  });

  it("does NOT render the field hint by default (Builder-preserved behavior)", () => {
    // Builder's planner items today never populate `field`, but if a future
    // planner change did populate it, we must not silently start showing it
    // in the Builder until the consumer opts in.
    render(
      <AiRequiredInputList
        title="Need from you:"
        items={[{ label: "Which Slack user?", field: "userId" }]}
        testId="t"
      />,
    );
    expect(screen.getByTestId("t")).not.toHaveTextContent("(field:");
    expect(screen.getByTestId("t")).toHaveTextContent("Which Slack user?");
  });

  it("renders the field hint when showFieldHint is true (Repair behavior)", () => {
    render(
      <AiRequiredInputList
        title="Need from you:"
        items={[{ label: "Which Slack user?", field: "userId" }]}
        testId="t"
        showFieldHint
      />,
    );
    expect(screen.getByTestId("t")).toHaveTextContent(
      "Which Slack user? (field: userId)",
    );
  });

  it("omits the field hint span when showFieldHint is true but the item has no field", () => {
    render(
      <AiRequiredInputList
        title="Need from you:"
        items={[{ label: "Pick something" }]}
        testId="t"
        showFieldHint
      />,
    );
    expect(screen.getByTestId("t")).not.toHaveTextContent("(field:");
  });

  it("applies the card variant wrapper class (Builder needs-input callout)", () => {
    render(
      <AiRequiredInputList
        title="More information is needed before this can be built:"
        items={[{ label: "Pick a channel" }]}
        testId="builder-ai-needs-input"
        variant="card"
      />,
    );
    const node = screen.getByTestId("builder-ai-needs-input");
    // Card variant adds a bordered background block; plain variant doesn't.
    expect(node.className).toContain("rounded");
    expect(node.className).toContain("border");
    expect(node.className).toContain("bg-background");
  });

  it("applies the plain variant wrapper class (Repair list)", () => {
    render(
      <AiRequiredInputList
        title="Need from you:"
        items={[{ label: "Which Slack user?", field: "userId" }]}
        testId="repair-required-input"
      />,
    );
    const node = screen.getByTestId("repair-required-input");
    expect(node.className).toContain("flex");
    expect(node.className).not.toContain("rounded");
    expect(node.className).not.toContain("border");
  });

  it("renders labels verbatim — no rewriting / sanitization (no-leak risk introduced)", () => {
    // The shared view never inspects the label content. If a caller passes a
    // user-supplied value, it lands in the DOM as-is — i.e. the leak surface
    // is the SAME as before this extraction (the caller). Pin that contract.
    render(
      <AiRequiredInputList
        title="Need from you:"
        items={[{ label: "Literal label from the caller." }]}
        testId="t"
      />,
    );
    expect(screen.getByTestId("t")).toHaveTextContent(
      "Literal label from the caller.",
    );
  });
});

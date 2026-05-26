/**
 * Tests for features/workflow-builder/ai/AiBulletList.tsx (Slice 4.AI-14).
 *
 * Pin the small contract two AI surfaces (Builder + Repair) now depend on:
 * empty-items → null (callers don't gate); optional title; severity tint;
 * stable testId; ReactNode items rendered verbatim (no leak introduced by
 * the shared view).
 */
import { render, screen } from "@testing-library/react";
import { AiBulletList } from "@/features/workflow-builder/ai/AiBulletList";

describe("AiBulletList", () => {
  it("renders nothing when items is empty (callers don't have to gate)", () => {
    const { container } = render(<AiBulletList items={[]} testId="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a titled list with one <li> per item", () => {
    render(
      <AiBulletList
        title="Assumptions"
        items={["The user has connected Slack.", "DM goes to me."]}
        testId="assumptions"
      />,
    );
    const node = screen.getByTestId("assumptions");
    expect(node).toHaveTextContent("Assumptions");
    expect(node).toHaveTextContent("The user has connected Slack.");
    expect(node).toHaveTextContent("DM goes to me.");
    expect(node.querySelectorAll("li")).toHaveLength(2);
  });

  it("omits the heading when title is not provided (headless list)", () => {
    render(
      <AiBulletList
        items={["Reconnect your Slack integration."]}
        testId="recs"
      />,
    );
    const node = screen.getByTestId("recs");
    // No <p> heading rendered when title is absent.
    expect(node.querySelector("p")).toBeNull();
    expect(node).toHaveTextContent("Reconnect your Slack integration.");
  });

  it("defaults to muted severity (text-muted-foreground on the <ul>)", () => {
    render(<AiBulletList items={["a"]} testId="t" />);
    const ul = screen.getByTestId("t").querySelector("ul")!;
    expect(ul.className).toContain("text-muted-foreground");
  });

  it("applies the warning severity class (amber) when severity=warning", () => {
    render(<AiBulletList items={["a"]} severity="warning" testId="t" />);
    const ul = screen.getByTestId("t").querySelector("ul")!;
    expect(ul.className).toContain("text-amber-700");
    expect(ul.className).toContain("dark:text-amber-300");
    expect(ul.className).not.toContain("text-muted-foreground");
  });

  it("applies the destructive severity class when severity=destructive", () => {
    render(<AiBulletList items={["a"]} severity="destructive" testId="t" />);
    const ul = screen.getByTestId("t").querySelector("ul")!;
    expect(ul.className).toContain("text-destructive");
  });

  it("preserves the stable testId on the wrapping <div> so existing call sites still resolve", () => {
    render(<AiBulletList items={["a"]} testId="builder-ai-assumptions" />);
    expect(screen.getByTestId("builder-ai-assumptions")).toBeInTheDocument();
  });

  it("renders ReactNode items verbatim — does NOT introduce any value-rewriting / sanitization", () => {
    // No-leak guarantee: the shared component never inspects item content. If a
    // caller (Builder / Repair / future surface) passes a label, it's rendered
    // as-is. The component cannot leak — leaks would have to originate in the
    // caller. Pin that the caller's exact string is what reaches the DOM.
    render(
      <AiBulletList
        items={["A literal string the caller passed."]}
        testId="t"
      />,
    );
    expect(screen.getByTestId("t")).toHaveTextContent(
      "A literal string the caller passed.",
    );
  });
});

/**
 * Tests for features/workflow-builder/layout/BuilderShell.
 *
 * BuilderShell (Slice 4.BUILDER-UI-SHELL-1) is a presentational region
 * composer — it must render the header above the content and apply the
 * documented landmark / aria for the future right-drawer-aware layout
 * without taking on any state or behavior of its own.
 */
import { render, screen } from "@testing-library/react";
import { BuilderShell } from "@/features/workflow-builder/layout/BuilderShell";

describe("BuilderShell", () => {
  it("renders the header region and the content region", () => {
    render(
      <BuilderShell header={<div>Header content</div>}>
        <div>Body content</div>
      </BuilderShell>,
    );
    expect(screen.getByText("Header content")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("exposes a stable landmark for the shell so e2e tests / a11y tools can target it", () => {
    render(
      <BuilderShell header={<span />}>
        <span />
      </BuilderShell>,
    );
    expect(
      screen.getByRole("region", { name: /workflow builder shell/i }),
    ).toBeInTheDocument();
  });

  it("places the header before the content in DOM order", () => {
    render(
      <BuilderShell header={<div data-testid="hdr">Header</div>}>
        <div data-testid="body">Body</div>
      </BuilderShell>,
    );
    const region = screen.getByRole("region", { name: /workflow builder shell/i });
    const header = screen.getByTestId("hdr");
    const body = screen.getByTestId("body");
    expect(region.contains(header)).toBe(true);
    expect(region.contains(body)).toBe(true);
    expect(
      header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});

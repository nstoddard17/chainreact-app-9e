/**
 * Tests for features/workflow-builder/layout/BuilderShell.
 *
 * BuilderShell (Slice 4.BUILDER-UI-SHELL-1, extended in
 * Slice 4.BUILDER-LEFT-AGENT-1) is a presentational region composer:
 * header / left rail / center content / right drawer. It must render the
 * header above the body row, optionally include the leftRail and
 * rightDrawer slots, and apply the documented landmark / aria without
 * taking on any state or behavior of its own.
 */
import { render, screen } from "@testing-library/react";
import { BuilderShell } from "@/features/workflow-builder/layout/BuilderShell";

describe("BuilderShell — two-zone foundation (SHELL-1)", () => {
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

  it("does not render a leftRail or rightDrawer slot when those props are omitted", () => {
    render(
      <BuilderShell header={<span>h</span>}>
        <span>b</span>
      </BuilderShell>,
    );
    expect(screen.queryByTestId("left-rail-slot-content")).toBeNull();
    expect(screen.queryByTestId("right-drawer-slot-content")).toBeNull();
  });
});

describe("BuilderShell — four-zone layout (LEFT-AGENT-1)", () => {
  it("renders the leftRail slot alongside the content when provided", () => {
    render(
      <BuilderShell
        header={<span>h</span>}
        leftRail={<div data-testid="left-rail-slot-content">left rail</div>}
      >
        <div data-testid="body-slot-content">body</div>
      </BuilderShell>,
    );
    expect(screen.getByTestId("left-rail-slot-content")).toBeInTheDocument();
    expect(screen.getByTestId("body-slot-content")).toBeInTheDocument();
  });

  it("renders the rightDrawer slot alongside the content when provided", () => {
    render(
      <BuilderShell
        header={<span>h</span>}
        rightDrawer={
          <div data-testid="right-drawer-slot-content">right drawer</div>
        }
      >
        <div data-testid="body-slot-content">body</div>
      </BuilderShell>,
    );
    expect(screen.getByTestId("right-drawer-slot-content")).toBeInTheDocument();
    expect(screen.getByTestId("body-slot-content")).toBeInTheDocument();
  });

  it("renders all four zones simultaneously when every slot is provided", () => {
    render(
      <BuilderShell
        header={<div data-testid="hdr">h</div>}
        leftRail={<div data-testid="left-rail-slot-content">left</div>}
        rightDrawer={
          <div data-testid="right-drawer-slot-content">right</div>
        }
      >
        <div data-testid="body-slot-content">body</div>
      </BuilderShell>,
    );
    expect(screen.getByTestId("hdr")).toBeInTheDocument();
    expect(screen.getByTestId("left-rail-slot-content")).toBeInTheDocument();
    expect(screen.getByTestId("body-slot-content")).toBeInTheDocument();
    expect(screen.getByTestId("right-drawer-slot-content")).toBeInTheDocument();
  });

  it("places leftRail before content and content before rightDrawer in DOM order", () => {
    render(
      <BuilderShell
        header={<span>h</span>}
        leftRail={<div data-testid="left-rail-slot-content">left</div>}
        rightDrawer={
          <div data-testid="right-drawer-slot-content">right</div>
        }
      >
        <div data-testid="body-slot-content">body</div>
      </BuilderShell>,
    );
    const left = screen.getByTestId("left-rail-slot-content");
    const body = screen.getByTestId("body-slot-content");
    const right = screen.getByTestId("right-drawer-slot-content");
    expect(
      left.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      body.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});

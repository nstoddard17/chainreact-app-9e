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
import userEvent from "@testing-library/user-event";
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

  // 4.TEAM-WORKFLOWS-6 (TW-3b) — optional banner slot under the header.
  it("renders the banner slot between the header and the workspace row when provided", () => {
    render(
      <BuilderShell
        header={<div data-testid="hdr">h</div>}
        banner={<div data-testid="banner-slot">banner</div>}
      >
        <span>b</span>
      </BuilderShell>,
    );
    const header = screen.getByTestId("hdr");
    const banner = screen.getByTestId("banner-slot");
    const row = screen.getByTestId("builder-workspace-row");
    // header → banner → workspace row.
    expect(
      header.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      banner.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("renders no banner when the slot is omitted", () => {
    render(
      <BuilderShell header={<span>h</span>}>
        <span>b</span>
      </BuilderShell>,
    );
    expect(screen.queryByTestId("banner-slot")).toBeNull();
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

describe("BuilderShell — responsive workspace (BUILDER-RESPONSIVE-LAYOUT-1)", () => {
  const row = () => screen.getByTestId("builder-workspace-row");

  it("keeps the workspace a ROW at every width, never a stacked column", () => {
    render(
      <BuilderShell
        header={<span>h</span>}
        leftRail={<div data-testid="left-rail-slot-content">left</div>}
      >
        <div data-testid="body-slot-content">body</div>
      </BuilderShell>,
    );
    // The pre-slice shell was `flex-col md:flex-row`. Below 768px that stacked
    // the rail ABOVE the canvas inside a clipping (`overflow-hidden`) row, which
    // pushed the canvas out of view with nothing to scroll — the specific reason
    // a phone could not reach the workflow at all. Presentation modes replaced
    // the stack, so the row is unconditionally a row.
    expect(row().className).toMatch(/\bflex-row\b/);
    expect(row().className).not.toMatch(/\bflex-col\b/);
    expect(row().className).not.toMatch(/md:flex-row/);
  });

  it("is a positioning context so sheets sit inside the workspace, below the header", () => {
    render(
      <BuilderShell header={<span>h</span>}>
        <span>b</span>
      </BuilderShell>,
    );
    // `relative` (not `fixed` sheets against the viewport) is what keeps the
    // builder header visible and usable while a sheet is open.
    expect(row().className).toMatch(/\brelative\b/);
  });

  it("gives the centre column the only flexible track so the canvas absorbs spare width", () => {
    render(
      <BuilderShell header={<span>h</span>}>
        <div data-testid="body-slot-content">body</div>
      </BuilderShell>,
    );
    const centre = screen.getByTestId("body-slot-content").parentElement!;
    // `min-w-0` is the load-bearing part: without it a flex item cannot shrink
    // below its content, which is how the canvas used to force overflow.
    expect(centre.className).toMatch(/\bmin-w-0\b/);
    expect(centre.className).toMatch(/\bflex-1\b/);
  });

  it("renders no scrim at all when nothing is overlaid (the wide desktop DOM is unchanged)", () => {
    render(
      <BuilderShell header={<span>h</span>}>
        <span>b</span>
      </BuilderShell>,
    );
    expect(screen.queryByTestId("builder-overlay-scrim")).toBeNull();
  });

  it("renders a dismissible scrim when a sheet is open, and dismisses on click", async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(
      <BuilderShell
        header={<span>h</span>}
        overlay={{ active: true, onDismiss, label: "config" }}
      >
        <span>b</span>
      </BuilderShell>,
    );
    const scrim = screen.getByTestId("builder-overlay-scrim");
    expect(scrim).toHaveAttribute("data-overlay-label", "config");
    await user.click(scrim);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the scrim out of the tab order and the a11y tree", () => {
    render(
      <BuilderShell
        header={<span>h</span>}
        overlay={{ active: true, onDismiss: () => {}, label: "rail" }}
      >
        <span>b</span>
      </BuilderShell>,
    );
    const scrim = screen.getByTestId("builder-overlay-scrim");
    // Keyboard and screen-reader users dismiss via Escape or the sheet's own
    // close control; a full-canvas dimmer announced as a button would be noise,
    // and a tabbable one would be a focus trap escape hatch.
    expect(scrim).toHaveAttribute("aria-hidden", "true");
    expect(scrim).toHaveAttribute("tabindex", "-1");
  });

  it("does not render the scrim when overlay is present but inactive", () => {
    render(
      <BuilderShell
        header={<span>h</span>}
        overlay={{ active: false, onDismiss: () => {}, label: "rail" }}
      >
        <span>b</span>
      </BuilderShell>,
    );
    expect(screen.queryByTestId("builder-overlay-scrim")).toBeNull();
  });
});

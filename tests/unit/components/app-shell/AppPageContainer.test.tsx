/**
 * RESPONSIVE-FOUNDATION-1 §1 — the shared page-container contract.
 *
 * Asserted by VALUE against the exported constants rather than by scraping a
 * generated Tailwind class string, so the tests survive class-order changes and
 * actually pin the three properties that matter: a bound on width, a fluid
 * gutter, and the `min-width: 0` that lets the region shrink at all.
 */
import { render, screen } from "@testing-library/react";
import {
  AppPageContainer,
  APP_PAGE_MAX_WIDTH,
  APP_PAGE_PADDING_INLINE,
  APP_PAGE_WIDTHS,
} from "@/components/app-shell/AppPageContainer";

describe("AppPageContainer", () => {
  it("bounds its width and centres itself", () => {
    render(<AppPageContainer>content</AppPageContainer>);
    const el = screen.getByTestId("app-page-container");
    expect(el.style.maxWidth).toBe(APP_PAGE_MAX_WIDTH);
    expect(el.className).toContain("mx-auto");
    expect(el.className).toContain("w-full");
  });

  it("uses a FLUID horizontal gutter rather than a breakpoint step", () => {
    render(<AppPageContainer>content</AppPageContainer>);
    const el = screen.getByTestId("app-page-container");
    // The point of clamp() here: the gutter shrinks continuously between widths
    // instead of holding one value until a breakpoint and then jumping.
    expect(el.style.paddingInline).toBe(APP_PAGE_PADDING_INLINE);
    expect(APP_PAGE_PADDING_INLINE).toMatch(/^clamp\(/);
  });

  it("carries min-w-0 so a child can never widen the page", () => {
    render(<AppPageContainer>content</AppPageContainer>);
    expect(screen.getByTestId("app-page-container").className).toContain("min-w-0");
  });

  it("does NOT clip overflow — clipping would hide bugs instead of fixing them", () => {
    render(<AppPageContainer>content</AppPageContainer>);
    const el = screen.getByTestId("app-page-container");
    expect(el.className).not.toMatch(/overflow-x-(hidden|clip)/);
    expect(el.style.overflowX).toBe("");
  });

  it("renders a <main> landmark by default and can defer to the caller's", () => {
    const { unmount } = render(<AppPageContainer>content</AppPageContainer>);
    expect(screen.getByRole("main")).toBeInTheDocument();
    unmount();
    render(<AppPageContainer as="div">content</AppPageContainer>);
    expect(screen.queryByRole("main")).toBeNull();
  });

  /**
   * RESPONSIVE-PAGES-2 — width variants. Added so pages with a DELIBERATE
   * narrower reading column (Runs, Notifications) could adopt the container
   * without silently being widened to 1600px.
   */
  it("defaults to the app width and exposes it for diagnostics", () => {
    render(<AppPageContainer>c</AppPageContainer>);
    const el = screen.getByTestId("app-page-container");
    expect(el).toHaveAttribute("data-page-width", "app");
    expect(el.style.maxWidth).toBe(APP_PAGE_WIDTHS.app);
  });

  it("preserves each page's intentional bound", () => {
    const { unmount } = render(<AppPageContainer width="content">c</AppPageContainer>);
    expect(screen.getByTestId("app-page-container").style.maxWidth).toBe(APP_PAGE_WIDTHS.content);
    unmount();
    render(<AppPageContainer width="reading">c</AppPageContainer>);
    expect(screen.getByTestId("app-page-container").style.maxWidth).toBe(APP_PAGE_WIDTHS.reading);
  });

  it("keeps the fluid gutter and min-w-0 on EVERY variant", () => {
    for (const width of ["app", "content", "reading"] as const) {
      const { unmount } = render(<AppPageContainer width={width}>c</AppPageContainer>);
      const el = screen.getByTestId("app-page-container");
      expect(el.style.paddingInline).toBe(APP_PAGE_PADDING_INLINE);
      expect(el.className).toContain("min-w-0");
      unmount();
    }
  });

  it("orders the variants widest to narrowest", () => {
    const px = (v: string) => Number(v.replace("px", ""));
    expect(px(APP_PAGE_WIDTHS.app)).toBeGreaterThan(px(APP_PAGE_WIDTHS.content));
    expect(px(APP_PAGE_WIDTHS.content)).toBeGreaterThan(px(APP_PAGE_WIDTHS.reading));
  });

  it("merges caller classes without dropping the contract", () => {
    render(<AppPageContainer className="gap-6 py-6">content</AppPageContainer>);
    const el = screen.getByTestId("app-page-container");
    expect(el.className).toContain("gap-6");
    expect(el.className).toContain("min-w-0");
    expect(el.style.maxWidth).toBe(APP_PAGE_MAX_WIDTH);
  });
});

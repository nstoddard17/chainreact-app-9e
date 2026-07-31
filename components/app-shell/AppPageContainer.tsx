import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The authenticated app's page container (RESPONSIVE-FOUNDATION-1).
 *
 * Every authenticated page previously hand-rolled its own `<main>` width and
 * padding (`flex w-full flex-col gap-6 p-6 sm:p-8` on Templates). That left two
 * gaps: nothing bounded the content on a very wide monitor, and nothing gave the
 * content region a `min-width: 0`, so a single unshrinkable child could push the
 * whole page wider than the viewport instead of the page absorbing it.
 *
 * This is deliberately a SMALL shared component, not a design-system layer. It
 * owns exactly three things:
 *
 *   1. `max-width: 1600px` and centred. 1600 is the top of the range this batch
 *      is specified to work across, and it is where the card grid stops being
 *      useful: past it, `auto-fit` tracks keep growing a fixed-content card into
 *      a stretched slab rather than adding a column. Bounding there keeps line
 *      lengths readable on ultrawide displays without letterboxing a 1440p one.
 *
 *   2. Fluid horizontal padding — `clamp(1rem, 2.5vw, 2rem)`. A single fluid
 *      value replaces the `p-6 sm:p-8` step, so the gutter shrinks CONTINUOUSLY
 *      between breakpoints instead of holding 24px until 640px and then jumping.
 *      At 360px that is 16px a side; at 1600px it caps at 32px.
 *
 *   3. `min-width: 0`. The load-bearing line. Without it a flex/grid child
 *      defaults to `min-width: auto` — it refuses to shrink below its content —
 *      which is the mechanism behind every horizontal-overflow bug this batch
 *      fixes.
 *
 * What it deliberately does NOT do: it does not position, it does not scroll,
 * and it does not clip. Dialogs, overlays and toasts are `fixed` and escape it
 * by design — bounding them here would break them. It also never sets
 * `overflow-x: hidden`, which would hide overflow bugs rather than fix them.
 */
export function AppPageContainer({
  children,
  className,
  as: Tag = "main",
  "data-testid": testId = "app-page-container",
}: {
  children: ReactNode;
  className?: string;
  /** `main` by default; pass `div` when the caller already renders the landmark. */
  as?: "main" | "div" | "section";
  "data-testid"?: string;
}) {
  return (
    <Tag
      data-testid={testId}
      className={cn("mx-auto flex w-full min-w-0 flex-col", className)}
      style={{
        maxWidth: APP_PAGE_MAX_WIDTH,
        paddingInline: APP_PAGE_PADDING_INLINE,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Exported so tests can assert the contract by value rather than by scraping a
 * generated Tailwind class string (which would break on class-order changes and
 * prove nothing about the rendered layout).
 */
export const APP_PAGE_MAX_WIDTH = "1600px";
export const APP_PAGE_PADDING_INLINE = "clamp(1rem, 2.5vw, 2rem)";

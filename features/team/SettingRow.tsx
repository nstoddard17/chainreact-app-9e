import type { ReactNode } from "react";

/**
 * Label + description row with a control on the right (Slice 4.TEAM-PAGE-4) —
 * ports the design's `SettingRow`. Rows divide with a bottom border; the first
 * and last rows trim their padding/border so they sit flush inside a Panel.
 *
 * RESPONSIVE-SETTINGS-3 — this row is the single root cause behind almost every
 * Account Settings containment failure the continuous sweep found (24 state ×
 * defect groups, breaking as wide as 1088px).
 *
 * It used to be `flex items-center justify-between` with a `shrink-0 text-right`
 * control. That is the exact anti-pattern the responsive brief names: a long
 * label competing with a control that has been told never to yield. The label
 * could shrink (`min-w-0`) but the control could not, so the row's content width
 * became the control's intrinsic width — and with a 74-character email or a long
 * account name in that control, the row grew ~300px past the card holding it.
 * The `Panel` card's `overflow-hidden` then CLIPPED the result, so the page never
 * scrolled sideways and nothing looked broken from the document's point of view;
 * the email was simply cut in half and unreadable.
 *
 * The behaviour chosen: STACK below `sm` (label over control, control full
 * width), side-by-side at `sm` and up. The control keeps `min-w-0` in both, so it
 * can shrink and its long values wrap instead of pushing. `shrink-0` is gone —
 * nothing in this row genuinely needs to hold an intrinsic width, and the one
 * kind of content that does (a button) sits in a `stacked` row already.
 *
 * Shared with the Team page's settings surface by design — same defect, same fix.
 */
export function SettingRow({
  label,
  desc,
  children,
  stacked,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      data-testid="setting-row"
      className={
        "border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 " +
        (stacked
          ? "flex flex-col items-stretch gap-2"
          : "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6")
      }
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className={stacked ? "w-full min-w-0" : "min-w-0 sm:text-right"}>{children}</div>
    </div>
  );
}

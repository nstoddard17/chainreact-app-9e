import type { ReactNode } from "react";

/**
 * Section heading (Slice 4.TEAM-PAGE-4) — ports the design's `SectionHeading`:
 * a breadcrumb (account › Settings › section), a title, an optional subtitle,
 * and an optional right-aligned action slot.
 */
export function SectionHeading({
  crumbRoot,
  crumb,
  title,
  sub,
  action,
}: {
  /** Leading breadcrumb label (the account name). */
  crumbRoot: string;
  /** Current section label shown as the active crumb. */
  crumb: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-5">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{crumbRoot}</span>
          <span aria-hidden>›</span>
          <span>Settings</span>
          <span aria-hidden>›</span>
          <span className="font-medium text-foreground">{crumb}</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

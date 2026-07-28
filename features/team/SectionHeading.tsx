import type { ReactNode } from "react";

/**
 * Section heading (Slice 4.TEAM-PAGE-4; de-duplicated in TEAM-HEADER-DEDUPE-1)
 * — the single page heading for a settings surface: a title, an optional
 * subtitle, and an optional right-aligned action slot.
 *
 * The design's `account › Settings › section` breadcrumb was removed: the active
 * account is already named in the shell's workspace switcher and the section is
 * already the highlighted item in the left settings nav, so the crumb repeated
 * both labels a third time. The title is the page's `h1` — settings surfaces
 * (Team, Account) carry no separate page header above this one.
 */
export function SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

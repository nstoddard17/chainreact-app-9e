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
    // RESPONSIVE-SETTINGS-3 — WRAP. The title and its action were a non-wrapping
    // `justify-between` row, so a long section title and an action button fought
    // for the same line. The action keeps its intrinsic width (a button label must
    // stay readable) and the row drops it onto its own line instead.
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {sub && <p className="mt-1 break-words text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * Label + description row with a control on the right (Slice 4.TEAM-PAGE-4) —
 * ports the design's `SettingRow`. Rows divide with a bottom border; the first
 * and last rows trim their padding/border so they sit flush inside a Panel.
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
      className={
        "gap-6 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 " +
        (stacked ? "flex flex-col items-stretch gap-2" : "flex items-center justify-between")
      }
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className={stacked ? "w-full" : "shrink-0 text-right"}>{children}</div>
    </div>
  );
}

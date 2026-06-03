import type { ReactNode } from "react";

/**
 * Settings panel card (Slice 4.TEAM-PAGE-4) — ports the design's `Panel`:
 * a bordered card with an optional head (title + description) and a body.
 * `flush` removes body padding for full-bleed content (e.g. a table).
 */
export function Panel({
  title,
  desc,
  children,
  flush,
}: {
  title?: string;
  desc?: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {(title || desc) && (
        <div className="px-5 pt-4">
          {title && (
            <div className="text-sm font-semibold text-foreground">{title}</div>
          )}
          {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

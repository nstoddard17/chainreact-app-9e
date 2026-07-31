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
    <section
      data-testid="settings-panel"
      // `min-w-0` so the card can be narrower than its widest child instead of
      // widening its column. `overflow-hidden` stays — it is what rounds the
      // corners — but it is deliberately NOT the containment mechanism: it clips
      // rather than fixes, which is precisely how the SettingRow defect stayed
      // invisible to a document-level overflow check for so long.
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      {(title || desc) && (
        <div className="min-w-0 px-5 pt-4">
          {title && (
            <div className="break-words text-sm font-semibold text-foreground">{title}</div>
          )}
          {desc && <p className="mt-1 break-words text-xs text-muted-foreground">{desc}</p>}
        </div>
      )}
      <div className={flush ? "min-w-0" : "min-w-0 p-5"}>{children}</div>
    </section>
  );
}

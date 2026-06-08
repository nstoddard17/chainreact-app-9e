import type { TemplateVisibility } from "@/contracts/workflowTemplate";

/**
 * Small attribution / status chips for template cards (CS-XT-7A), mirroring the design's
 * `attr-official` / `attr-author` / `vis-chip`. Brand accent is sky (#0284c7). All chips use
 * explicit light + dark classes per the project's dual-mode rule.
 */

/** "Official — by ChainReact" badge (design `OfficialBadge`). */
export function OfficialBadge() {
  return (
    <span
      data-testid="official-badge"
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m9 12 2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      ChainReact
    </span>
  );
}

/** Avatar initials from a display name (e.g. "Jane Doe" → "JD"). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Creator attribution for a public community template (safe display-name snapshot only). */
export function CreatorChip({ displayName }: { displayName: string }) {
  return (
    <span
      data-testid="creator-chip"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span
        aria-hidden
        className="grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-[9px] font-bold text-white"
      >
        {initialsOf(displayName)}
      </span>
      <span className="font-medium text-foreground">{displayName}</span>
    </span>
  );
}

/** Private / public chip for the viewer's own templates. */
export function VisibilityChip({ visibility }: { visibility: TemplateVisibility }) {
  const isPrivate = visibility === "private";
  return (
    <span
      data-testid="visibility-chip"
      className={
        isPrivate
          ? "inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
          : "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
      }
    >
      {visibility}
    </span>
  );
}

/**
 * Monochrome glyphs for the marketing chain diagrams (Slice 4.HOMEPAGE-V5-1).
 *
 * The illustrative automation chains in ScrollStory / Showcase / FeatureSticky
 * show app "nodes". The real provider-icon strip (LogoMarquee) is resolved
 * server-side from `@/integrations/_registry` — but `features/` may NOT import
 * `integrations/` (project-structure rule), and these chains are *illustrative
 * examples*, not a live registry view. So we render small monochrome lettered
 * tiles keyed off the marketing tokens instead of real brand logos. This keeps
 * the editorial monochrome look and avoids implying official brand endorsement.
 *
 * Pure presentational module — no client state, safe in server components.
 */
import type { CSSProperties } from "react";

/** A rounded monochrome tile showing an app's initial(s). */
export function BrandTile({ label, size = 24 }: { label: string; size?: number }) {
  const initial = label.trim().charAt(0).toUpperCase() || "•";
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: "var(--mk-panel-2)",
        border: "1px solid var(--mk-border)",
        color: "var(--mk-text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.5,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}

type IconProps = { size?: number; style?: CSSProperties; className?: string };

const base = (size: number): CSSProperties => ({ width: size, height: size, display: "block" });

export function CheckIcon({ size = 14, style, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={{ ...base(size), ...style }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ClockIcon({ size = 18, style, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={{ ...base(size), ...style }}
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

export function DragIcon({ size = 16, style, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      style={{ ...base(size), ...style }}
    >
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

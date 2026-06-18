import type { ReactNode } from "react";

/**
 * Monoline glyph set for the Analytics page (Slice ANALYTICS-1) — inline SVG, no
 * icon dependency, `stroke="currentColor"` so the color cascade drives the tint.
 * Mirrors the icon keys the design's widgets / library / config panel reference.
 */

export type AnalyticsIconName =
  | "Bolt"
  | "CircleCheck"
  | "Clock"
  | "Layers"
  | "History"
  | "Filter"
  | "Webhook"
  | "Sparkle"
  | "Comment"
  | "Database"
  | "Plus"
  | "X"
  | "Settings"
  | "Check"
  | "Share"
  | "Code"
  | "More"
  | "Drag"
  | "Search"
  | "AlertTriangle"
  | "Eye"
  | "CircleDot"
  | "Cube"
  | "ChevronRight";

const PATHS: Record<AnalyticsIconName, ReactNode> = {
  Bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  CircleCheck: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" />
    </>
  ),
  Clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>
  ),
  Layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  History: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <polyline points="12 8 12 12 15 14" />
    </>
  ),
  Filter: <polygon points="3 4 21 4 14 12 14 19 10 21 10 12 3 4" />,
  Webhook: (
    <>
      <path d="M9 8a3 3 0 1 1 4 2.8L10 16" />
      <path d="M7 14a3 3 0 1 0 3 5h6" />
      <path d="M16 12a3 3 0 1 1-2 5" />
    </>
  ),
  Sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />,
  Comment: <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z" />,
  Database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  Plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  X: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  Settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1z" />
    </>
  ),
  Check: <polyline points="20 6 9 17 4 12" />,
  Share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </>
  ),
  Code: (
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>
  ),
  More: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  Drag: (
    <>
      <circle cx="9" cy="6" r="1.3" />
      <circle cx="15" cy="6" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="18" r="1.3" />
      <circle cx="15" cy="18" r="1.3" />
    </>
  ),
  Search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>
  ),
  AlertTriangle: (
    <>
      <path d="M12 3l9.5 16.5h-19L12 3z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <line x1="12" y1="17.5" x2="12" y2="17.6" />
    </>
  ),
  Eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  CircleDot: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  Cube: (
    <>
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
      <path d="M3 7l9 5 9-5" />
      <line x1="12" y1="12" x2="12" y2="22" />
    </>
  ),
  ChevronRight: <polyline points="9 18 15 12 9 6" />,
};

export function AnalyticsIcon({
  name,
  size = 14,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const children = PATHS[name as AnalyticsIconName];
  if (!children) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function isAnalyticsIcon(name: string): name is AnalyticsIconName {
  return name in PATHS;
}

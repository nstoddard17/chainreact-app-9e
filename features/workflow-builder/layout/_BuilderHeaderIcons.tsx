"use client";

import type { ReactNode } from "react";

/**
 * Inline SVG icons for the builder header strip
 * (4.BUILDER-DESIGN-PARITY-1).
 *
 * Lives next to `BuilderHeader.tsx` rather than in a global icon
 * library so it stays scoped to the builder workspace's design
 * language (Geist-aligned line weight, 1.8 stroke width) and the
 * main header file stays under the 500-line target.
 *
 * Sized via width/height props rather than `currentColor` defaults so
 * the header can compose them at distinct sizes (16 for the back
 * chevron, 14 for the right-side button group) without per-icon
 * overrides.
 */

interface IconProps {
  size?: number;
}

export const ChevronLeftIcon = ({ size = 16 }: IconProps) => (
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
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export const LayersIcon = ({ size = 15 }: IconProps) => (
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
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

export const UndoIcon = ({ size = 14 }: IconProps) => (
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
  >
    <polyline points="9 14 4 9 9 4" />
    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  </svg>
);

export const RedoIcon = ({ size = 14 }: IconProps) => (
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
  >
    <polyline points="15 14 20 9 15 4" />
    <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
  </svg>
);

export const HistoryIcon = ({ size = 14 }: IconProps) => (
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
  >
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <polyline points="3 3 3 8 8 8" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
);

/**
 * Compact icon button used inside the header for back / layers / undo /
 * redo / history. Hover transitions inline (no Tailwind dependency)
 * because the surrounding `data-builder-surface` palette overrides
 * shadcn defaults.
 */
export function BuilderIconButton({
  children,
  ariaLabel,
  title,
  onClick,
  disabled,
  testId,
  dataAttrs,
  size = "md",
}: {
  children: ReactNode;
  ariaLabel: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  dataAttrs?: Record<string, string>;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? 24 : 26;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
      {...dataAttrs}
      className="inline-flex items-center justify-center rounded-[4px] transition-colors disabled:opacity-40"
      style={{
        width: dim,
        height: dim,
        background: "transparent",
        color: "var(--builder-text-2)",
        border: "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--builder-bg)";
        e.currentTarget.style.color = "var(--builder-text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--builder-text-2)";
      }}
    >
      {children}
    </button>
  );
}

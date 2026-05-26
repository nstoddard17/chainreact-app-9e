"use client";

/**
 * Shared helpers for the trigger / action pickers (Slice 4.BUILDER-ADD-FLOW-1).
 *
 * Extracted here so TriggerPicker.tsx and ActionPicker.tsx share the
 * search-filter rule + the provider chip icon component without
 * cross-importing each other (which would couple two otherwise
 * independent surfaces).
 *
 * Boundary rules:
 *   - Pure UI / pure data. No slice reads, no fetch, no provider-specific
 *     string branches.
 *   - `ProviderChipIcon` mirrors the avatar policy in `WorkflowNodeCard`:
 *     render the SVG <img> when an icon URL is supplied; fall back on
 *     `<img onError>` to a tiny letter-disc derived from the provider
 *     id. No per-provider branches.
 */

import { useState } from "react";

interface MetaWithSearchableText {
  displayName: string;
  description: string;
}

/**
 * Case-insensitive filter against `displayName + description`. Used by
 * the searchable AddNodePanel — when `query` is empty / undefined the
 * original list is returned untouched (the default behavior the pickers
 * had before BUILDER-ADD-FLOW-1).
 */
export function filterMetasBySearch<T extends MetaWithSearchableText>(
  metas: readonly T[],
  query: string | undefined,
): readonly T[] {
  if (!query) return metas;
  const q = query.trim().toLowerCase();
  if (!q) return metas;
  return metas.filter((m) => {
    const dn = m.displayName.toLowerCase();
    const desc = m.description.toLowerCase();
    return dn.includes(q) || desc.includes(q);
  });
}

interface ProviderChipIconProps {
  providerId: string;
  label: string;
  iconUrl?: string;
}

/**
 * Tiny provider chip icon used in the picker UI. Renders the SVG
 * `<img>` when a URL is supplied; on load failure (`<img onError>`)
 * falls back to a hash-free letter disc that always reads. Aria-hidden
 * because the surrounding chip / drill-in header already names the
 * provider.
 */
export function ProviderChipIcon({
  providerId: _providerId,
  label,
  iconUrl,
}: ProviderChipIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  if (iconUrl && !imageFailed) {
    return (
      <span
        aria-hidden="true"
        data-testid="picker-provider-icon"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted/70"
      >
        {/* Provider logos are small static SVGs; <img> over next/image
            avoids the domain-allowlist + sharp dependency and keeps the
            picker test surface light. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          className="h-3.5 w-3.5 object-contain"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }
  const letter = (label.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      data-testid="picker-provider-icon-fallback"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold text-muted-foreground"
    >
      {letter}
    </span>
  );
}

/**
 * Mono uppercase section header + count chip used in both TriggerPicker
 * and ActionPicker (4.BUILDER-DESIGN-PARITY-1). Mirrors the
 * `.picker-section-h` style from the Anthropic ChainV2 design.
 */
export function PickerSectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1">
      <span
        className="builder-mono text-[10px] uppercase tracking-[0.05em]"
        style={{ color: "var(--builder-muted)" }}
      >
        {label}
      </span>
      <code
        className="builder-mono text-[10px]"
        style={{ color: "var(--builder-muted-2)" }}
      >
        {count}
      </code>
    </div>
  );
}

/**
 * Row inside a picker list (native triggers / native actions / drilled-in
 * per-provider list). Renders title + description + meta-key chip.
 */
export function PickerRow({
  title,
  description,
  metaKey,
  onClick,
}: {
  title: string;
  description: string;
  metaKey: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors"
      style={{
        background: "var(--builder-panel)",
        color: "var(--builder-text)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--builder-panel-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--builder-panel)";
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium">{title}</span>
        <span
          className="line-clamp-1 text-[11px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {description}
        </span>
      </div>
      <code
        className="builder-mono shrink-0 text-[10px]"
        style={{ color: "var(--builder-muted-2)" }}
      >
        {metaKey}
      </code>
    </button>
  );
}

/**
 * 2-column provider grid card — clicking drills into the picker for
 * that provider's actions / triggers.
 */
export function ProviderCard({
  providerId,
  label,
  iconUrl,
  onClick,
  ariaLabel,
}: {
  providerId: string;
  label: string;
  iconUrl?: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-left transition-colors"
      style={{
        background: "var(--builder-panel)",
        color: "var(--builder-text)",
        border: "1px solid var(--builder-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--builder-accent)";
        e.currentTarget.style.background =
          "color-mix(in oklab, var(--builder-accent) 4%, var(--builder-panel))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--builder-border)";
        e.currentTarget.style.background = "var(--builder-panel)";
      }}
    >
      <ProviderChipIcon providerId={providerId} label={label} iconUrl={iconUrl} />
      <span className="truncate text-[12.5px] font-medium">{label}</span>
    </button>
  );
}

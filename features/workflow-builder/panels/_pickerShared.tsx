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

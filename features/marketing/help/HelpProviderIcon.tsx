"use client";

import { useState } from "react";

/**
 * Provider logo tile with initials fallback (HELP-CENTER-1).
 *
 * Same idiom as the Apps page's AppCard icon: render the registry-derived
 * `/integrations/<id>.svg` asset, and fall back to a two-letter initials
 * tile via `<img onError>` if the asset is missing. Client component only
 * because of the onError state.
 */

interface Props {
  name: string;
  iconUrl?: string;
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function HelpProviderIcon({ name, iconUrl }: Props) {
  const [failed, setFailed] = useState(false);

  if (!iconUrl || failed) {
    return (
      <span className="hc-provider-ic hc-provider-ic-fallback" aria-hidden>
        {initialsFor(name)}
      </span>
    );
  }

  return (
    <span className="hc-provider-ic" aria-hidden>
      {/* Static same-origin SVG asset; plain <img> matches the Apps page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconUrl} alt="" onError={() => setFailed(true)} />
    </span>
  );
}

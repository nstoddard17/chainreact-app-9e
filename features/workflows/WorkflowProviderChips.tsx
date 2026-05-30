"use client";

import { useState } from "react";
import type { WorkflowProviderChip } from "@/contracts/workflow";

/**
 * Stack of provider chips for a workflow row/card (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Each chip renders the provider's public SVG icon when available
 * (`/integrations/{id}.svg`, computed server-side). On a missing or 404 icon
 * the chip falls back to a 2-letter initials avatar of the provider's label.
 * `aria-label` exposes the full provider list to screen readers; overlapping
 * chips are purely visual.
 *
 * Render-only: takes the chip data the route already derived from
 * `node.provider`/`node.kind` (no config / secrets ever touched). Caps the
 * stack at `max` (default 4) and shows a "+N" tail for the rest.
 */
interface Props {
  providers: readonly WorkflowProviderChip[];
  max?: number;
  className?: string;
}

export function WorkflowProviderChips({ providers, max = 4, className }: Props) {
  if (providers.length === 0) {
    return (
      <span
        data-testid="workflow-provider-chips-empty"
        className={cn("text-xs text-muted-foreground", className)}
        aria-label="No connected apps"
      >
        —
      </span>
    );
  }

  const shown = providers.slice(0, max);
  const extra = providers.length - shown.length;
  const labels = providers.map((p) => p.label).join(", ");

  return (
    <div
      data-testid="workflow-provider-chips"
      className={cn("flex items-center", className)}
      aria-label={`Connected apps: ${labels}`}
    >
      {shown.map((p, idx) => (
        <ProviderChip key={p.id} provider={p} stacked={idx > 0} />
      ))}
      {extra > 0 && (
        <span
          data-testid="workflow-provider-chips-extra"
          className="ml-1.5 text-xs font-medium text-muted-foreground"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function ProviderChip({
  provider,
  stacked,
}: {
  provider: WorkflowProviderChip;
  stacked: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = provider.label
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      data-testid="workflow-provider-chip"
      data-provider-id={provider.id}
      title={provider.label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-[10px] font-semibold uppercase text-muted-foreground ring-1 ring-border",
        stacked && "-ml-2",
      )}
    >
      {provider.iconUrl && !imgFailed ? (
        // Public SVG at /integrations/<id>.svg — no remote loader needed; the
        // onError fallback degrades gracefully to initials if the asset is
        // missing. Using next/image for tiny static SVGs is over-optimization
        // (the builder card uses the same pattern for the same reason).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={provider.iconUrl}
          alt=""
          aria-hidden
          className="h-5 w-5"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials || "?"}</span>
      )}
    </span>
  );
}

function cn(...parts: ReadonlyArray<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(" ");
}

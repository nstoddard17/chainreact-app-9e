"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "./adapters";
import { classifyNodeStatus, type NodeStatus } from "../utils/classifyNodeStatus";

/**
 * Builder node card (Slice 4.BUILDER-CANVAS-1).
 *
 * Replaces `WorkflowNodeView` (Slice 3.5) as the canvas's custom node
 * renderer. Visual upgrade only — same `data` shape (`WorkflowNodeData`),
 * same `Handle` topology (triggers omit the top target handle; actions
 * have both), same testid surface so the existing
 * `canvas-config-sync` integration tests still find this surface by
 * `data-testid="workflow-node-view"` and `data-selected`.
 *
 * Card layout:
 *   - 320px wide bordered card, rounded-lg, soft shadow, subtle
 *     hover-lift, primary-color ring when selected.
 *   - Header row: provider initials avatar + provider label + kind chip.
 *   - Type subtitle (or "(unconfigured)").
 *   - "Not configured" amber chip when `type === ""` (i.e. the node was
 *     added via the bare `addTrigger({provider})` path and never picked a
 *     specific TriggerMeta / ActionMeta).
 *
 * Intentionally NOT in this slice (see follow-up slices):
 *   - Run-state animations (running shimmer / listening ring / paused
 *     pulse) — defer until run-state projection lands (BUILDER-RUN-PANEL-1).
 *   - Expandable config preview, Test-this-step button, more menu, drag
 *     handle (would conflict with ReactFlow drag) — V1 features deliberately
 *     not ported.
 *   - Provider-specific iconography — no `/integrations/{provider}.svg`
 *     convention exists in V2 today; we use a deterministic initials
 *     avatar fallback with no per-provider branches. Real SVG assets are
 *     a metadata concern handled later.
 *
 * Boundary rules:
 *   - Presentational. No slice reads, no fetch, no provider-specific
 *     string branches.
 *   - `data` stays narrow per the `WorkflowNodeData` contract — do NOT
 *     widen to the full WorkflowNode (would break single-source-of-truth).
 */
export function WorkflowNodeCard({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const isTrigger = data.kind === "trigger";
  const providerLabel = data.providerLabel ?? data.provider;
  const status: NodeStatus = classifyNodeStatus({ type: data.type });
  const isUnconfigured = status === "unconfigured";

  return (
    <div
      data-testid="workflow-node-view"
      data-kind={data.kind}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      className={
        selected
          ? "group flex w-[320px] flex-col gap-2 rounded-lg border-2 border-primary bg-card p-3 shadow-md transition"
          : "group flex w-[320px] flex-col gap-2 rounded-lg border border-input bg-card p-3 shadow-sm transition hover:border-foreground/20 hover:shadow-md"
      }
    >
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Top}
          isConnectableStart={false}
          aria-label="Incoming edge target"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <ProviderAvatar
          provider={data.provider}
          label={providerLabel}
          iconUrl={data.providerIcon}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate text-sm font-semibold leading-tight"
            title={providerLabel}
          >
            {providerLabel}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {data.kind}
          </span>
        </div>
        {isUnconfigured ? <NotConfiguredBadge /> : null}
      </div>
      <span
        className="truncate text-xs text-muted-foreground"
        title={data.type || undefined}
      >
        {data.type ? data.type : "(unconfigured)"}
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        aria-label="Outgoing edge source"
      />
    </div>
  );
}

/**
 * Provider avatar (Slice 4.BUILDER-INSPECTOR-1):
 *   - When `iconUrl` resolves successfully, renders the SVG inside a
 *     neutral rounded tile.
 *   - When `iconUrl` is absent OR the `<img>` errors (asset missing /
 *     network failure / SVG malformed), falls back to a deterministic
 *     initials avatar with a hash-derived background color.
 *
 * No per-provider branches anywhere — the icon URL itself comes from the
 * metadata layer (`integrations/_registry:providerIconUrl()`); this
 * component just renders or falls back.
 */
function ProviderAvatar({
  provider,
  label,
  iconUrl,
}: {
  provider: string;
  label: string;
  iconUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!iconUrl && !imageFailed;

  if (showImage) {
    return (
      <span
        aria-hidden="true"
        data-testid="provider-icon"
        data-provider={provider}
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
      >
        {/* Provider logos are small static SVGs that don't benefit from
            next/image optimization; plain <img> avoids the extra
            domain-allowlist + sharp dependency that next/image requires
            and keeps SSR straightforward. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          className="h-5 w-5 object-contain"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  const initials = computeInitials(label || provider);
  const colorClass = provider
    ? AVATAR_PALETTE[hashToBucket(provider, AVATAR_PALETTE.length)]
    : AVATAR_PALETTE[0];
  return (
    <span
      aria-hidden="true"
      data-testid="provider-initials-avatar"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${colorClass}`}
    >
      {initials}
    </span>
  );
}

function NotConfiguredBadge() {
  return (
    <span
      data-testid="not-configured-badge"
      className="shrink-0 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-300"
    >
      Not configured
    </span>
  );
}

/**
 * Up to two leading initials, uppercase. Falls back to "?" if the input
 * has no usable characters.
 */
export function computeInitials(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Deterministic, salt-free bucket selector. Used only for the avatar
 * background — never for anything security-sensitive. Stable across
 * runs / SSR / dark-mode toggles.
 */
function hashToBucket(input: string, buckets: number): number {
  if (buckets <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % buckets;
}

const AVATAR_PALETTE = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
] as const;

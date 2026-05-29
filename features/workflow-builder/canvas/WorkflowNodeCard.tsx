"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "./adapters";
import { classifyNodeStatus, type NodeStatus } from "../utils/classifyNodeStatus";

/**
 * Builder node card (Slice 4.BUILDER-CANVAS-1, restyled in
 * 4.BUILDER-DESIGN-PARITY-1).
 *
 * Adopts the Anthropic ChainV2 dense node-card aesthetic:
 *
 *   ┌─┬────────────────────────────────────────────┐
 *   │ │  [brand]   [KIND chip]  #handle            │ ← head
 *   │S│           Title                            │
 *   │T│           subtitle (mono)                  │
 *   │A│                                            │
 *   │T│  description (mono · single-line)          │ ← meta
 *   │U├────────────────────────────────────────────┤
 *   │S│  [Not configured / status badges]          │ ← foot
 *   └─┴────────────────────────────────────────────┘
 *
 * The 3px left status rail is the design's signature node detail —
 * green for triggers, orange for unconfigured, red for error states.
 *
 * Behavior contract preserved:
 *   - Same `WorkflowNodeData` shape (read-only).
 *   - Same `Handle` topology (trigger nodes omit the top target handle).
 *   - Same testid surface (`workflow-node-view`, `data-selected`,
 *     `data-kind`, `data-status`) so `canvas-config-sync` and the
 *     existing card unit tests find nodes unchanged.
 *   - Same `Not configured` chip on unconfigured nodes (test contract
 *     in `WorkflowNodeCard.test.tsx`).
 *
 * Per-node run stats (runs / last) are deferred — V2 doesn't surface
 * that data yet (see slice doc §Deferred).
 */
export function WorkflowNodeCard({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const isTrigger = data.kind === "trigger";
  const providerLabel = data.providerLabel ?? data.provider;
  const status: NodeStatus = classifyNodeStatus({ type: data.type });
  const isUnconfigured = status === "unconfigured";
  const railColor = isTrigger
    ? "var(--builder-success)"
    : isUnconfigured
      ? "var(--builder-warn)"
      : "var(--builder-accent)";

  return (
    <div
      data-testid="workflow-node-view"
      data-kind={data.kind}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      className="relative w-[280px] overflow-hidden rounded-[6px] transition-colors"
      style={{
        background: "var(--builder-panel)",
        border: `1px solid ${selected ? "var(--builder-accent)" : "var(--builder-border)"}`,
        boxShadow: selected
          ? "0 0 0 2px var(--builder-accent-soft), var(--builder-shadow-md)"
          : "var(--builder-shadow-sm)",
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: railColor }}
      />
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Top}
          isConnectableStart={false}
          aria-label="Incoming edge target"
          style={{
            width: 8,
            height: 8,
            background: "var(--builder-panel)",
            border: `1.5px solid ${selected ? "var(--builder-accent)" : "var(--builder-border-strong)"}`,
          }}
        />
      ) : null}

      <div className="flex gap-2.5 px-3 pb-1.5 pt-2.5">
        <ProviderAvatar
          provider={data.provider}
          label={providerLabel}
          iconUrl={data.providerIcon}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <KindChip kind={data.kind} />
            <code
              className="builder-mono text-[9.5px]"
              style={{ color: "var(--builder-muted-2)" }}
            >
              #{data.kind === "trigger" ? "trigger" : "action"}
            </code>
          </div>
          <div
            className="mt-0.5 truncate text-[12.5px] font-semibold leading-tight"
            title={data.displayName}
            style={{ color: "var(--builder-text)" }}
          >
            {data.displayName}
          </div>
          <div
            className="mt-0.5 truncate text-[10.5px] leading-tight"
            style={{ color: "var(--builder-muted)" }}
            title={providerLabel}
          >
            {providerLabel}
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-end gap-1 px-3 py-1.5"
        style={{
          background: "var(--builder-panel-2)",
          borderTop: "1px dashed var(--builder-border)",
        }}
      >
        {isUnconfigured ? <NotConfiguredBadge /> : <ReadyBadge />}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        aria-label="Outgoing edge source"
        style={{
          width: 8,
          height: 8,
          background: "var(--builder-panel)",
          border: `1.5px solid ${selected ? "var(--builder-accent)" : "var(--builder-border-strong)"}`,
        }}
      />
    </div>
  );
}

function KindChip({ kind }: { kind: WorkflowNodeData["kind"] }) {
  const cfg =
    kind === "trigger"
      ? {
          bg: "var(--builder-success-soft)",
          fg: "var(--builder-success)",
          border: "var(--builder-success)",
        }
      : {
          bg: "var(--builder-accent-soft)",
          fg: "var(--builder-accent)",
          border: "var(--builder-accent)",
        };
  return (
    <span
      className="builder-mono inline-flex items-center rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.05em]"
      style={{
        background: cfg.bg,
        color: cfg.fg,
        border: `1px solid ${cfg.border}`,
        lineHeight: 1.5,
      }}
    >
      {kind}
    </span>
  );
}

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
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[4px]"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          marginTop: 1,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          className="h-4 w-4 object-contain"
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
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] text-[10px] font-semibold ${colorClass}`}
      style={{ marginTop: 1 }}
    >
      {initials}
    </span>
  );
}

function NotConfiguredBadge() {
  return (
    <span
      data-testid="not-configured-badge"
      className="builder-mono inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{
        background: "var(--builder-warn-soft)",
        color: "var(--builder-warn)",
        border: "1px solid var(--builder-warn)",
      }}
    >
      Not configured
    </span>
  );
}

function ReadyBadge() {
  return (
    <span
      className="builder-mono inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[9.5px]"
      style={{
        background: "var(--builder-panel)",
        color: "var(--builder-muted)",
        border: "1px solid var(--builder-border)",
      }}
    >
      ready
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
 * background — never for anything security-sensitive.
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

"use client";

import { useState } from "react";
import type { DraftPreview, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import { ChainReactMark } from "@/components/brand/ChainReactMark";
import { isConnectionlessProvider } from "@/core/integrations/connectionlessProviders";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";

/**
 * Non-applied AI draft preview overlay (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY +
 * HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX).
 *
 * Renders a capability-validated {@link DraftPreview} as a SEPARATE, ephemeral visual layer floating
 * over the builder canvas. Each proposed step renders as a card that MIRRORS the real builder node
 * card ({@link "./WorkflowNodeCard"}) — same provider avatar, kind chip, title, and provider label —
 * but with a holographic / "proposed" treatment (glassy translucent surface, shimmer pulse, dashed
 * glowing border, subtle "Preview" badge). The mental model the styling encodes:
 *
 *   holographic/shimmering canvas node = PROPOSED, not accepted yet
 *   solid draft node = accepted into the LOCAL draft (after explicit Apply)
 *
 * GUARANTEES (locked by `workflowGuidanceUiSafety` + `builder-ai-rail-no-old-endpoint`):
 *   - PRESENTATIONAL ONLY. No store access, no network/fetch, no model/gateway call, no secret.
 *     The preview node carries capability LABELS only (provider/type) — never config values.
 *   - It NEVER merges preview nodes/edges into the real React Flow graph or any builder store.
 *   - NO setup controls render on the canvas. Setup controls (dropdowns / text fields) live in the
 *     React chat rail; normal config happens in the config drawer AFTER a node is accepted. The
 *     canvas shows holographic node cards + dashed preview edges only — never a form. A proposed
 *     node that still needs configuration shows a short "Needs setup" badge (with a field count),
 *     NEVER a long missing-field list or an input.
 *   - It surfaces exactly two explicit, user-clicked actions, both handled by the parent: `onDiscard`
 *     (drop the overlay, no mutation) and the OPTIONAL `onApply` (additive local-draft edit via the
 *     graph slice, in `WorkflowBuilder`). No Create / Use-this / Run / Save control.
 *
 * The container is `pointer-events-none` so the canvas underneath stays interactive; only the control
 * bar opts back into pointer events. Ghost nodes/edges are non-interactive.
 */

export interface BuilderPreviewOverlayProps {
  /** The ephemeral preview to render. The parent renders this overlay only when non-null. */
  readonly preview: DraftPreview;
  /** Drop the overlay (UI state only). Never mutates the workflow. */
  readonly onDiscard: () => void;
  /**
   * Optional (builder-only): apply the preview as an additive patch to the LOCAL draft. When omitted,
   * the overlay is review-only (no Apply control). Provided by `WorkflowBuilder`.
   */
  readonly onApply?: () => void;
  /**
   * Provider display-name map (`provider id → label`), so the holographic card shows the same
   * friendly provider name as the real node card. Optional — falls back to the raw provider id.
   */
  readonly providerLabels?: Readonly<Record<string, string>>;
  /**
   * Provider icon-url map (`provider id → icon url`), so the holographic card shows the same provider
   * avatar as the real node card. Optional — falls back to initials. These are public brand icon URLs
   * (never credentials / account ids).
   */
  readonly providerIcons?: Readonly<Record<string, string>>;
  /**
   * REACT-AGENT-RAIL-NODE-DISPLAY-NAMES-1 — registry display name per `provider:type`, so the ghost
   * card titles a step exactly as the real node card and the rail's setup card do. Optional — absent,
   * the shared `getNodeDisplayName` fallback title-cases the type key, which is what this overlay did
   * on its own before. Threading it removes the divergence where the registry name differs from the
   * humanized key (`stripe:event_received` is "Stripe Event Received", not "Event Received").
   */
  readonly nodeDisplayNames?: Readonly<Record<string, string>>;
}

export function BuilderPreviewOverlay({
  preview,
  onDiscard,
  onApply,
  providerLabels,
  providerIcons,
  nodeDisplayNames,
}: BuilderPreviewOverlayProps) {
  return (
    <div
      data-testid="builder-preview-overlay"
      data-preview="true"
      aria-label="Suggested workflow preview"
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center overflow-auto p-4"
    >
      {/* Top control bar — the only interactive part of the overlay. */}
      <div
        className="pointer-events-auto mb-4 flex items-center gap-3 rounded-full px-3 py-1.5 shadow-md"
        style={{
          background: "var(--builder-panel)",
          border: "1px dashed var(--builder-accent)",
        }}
      >
        <span
          data-testid="builder-preview-badge"
          className="builder-preview-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--builder-accent)", color: "white" }}
        >
          <SparkleIcon /> Suggested
        </span>
        <span
          data-testid="builder-preview-overlay-notice"
          className="text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {preview.notice}
        </span>
        {onApply && (
          <button
            type="button"
            onClick={onApply}
            data-testid="builder-preview-apply"
            className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white"
            style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
            title="Add the proposed nodes to your draft (you still review fields and save)"
          >
            Apply preview
          </button>
        )}
        <button
          type="button"
          onClick={onDiscard}
          data-testid="builder-preview-discard"
          className="rounded-full px-2 py-0.5 text-[11.5px] font-medium"
          style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
          title="Discard preview (your workflow is unchanged)"
        >
          Discard preview
        </button>
      </div>

      {(preview.title.length > 0 || preview.summary.length > 0) && (
        <div className="pointer-events-none mb-3 max-w-[420px] text-center">
          {preview.title.length > 0 && (
            <div className="text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
              {preview.title}
            </div>
          )}
          {preview.summary.length > 0 && (
            <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
              {preview.summary}
            </div>
          )}
        </div>
      )}

      {/* Ghost node chain — holographic cards that mirror the real node card, joined by dashed edges. */}
      <ol className="pointer-events-none flex flex-col items-center gap-0">
        {preview.nodes.map((node, i) => (
          <li key={node.previewId} className="flex flex-col items-center">
            <PreviewNodeCard
              node={node}
              providerLabel={providerLabels?.[node.provider] ?? node.provider}
              iconUrl={providerIcons?.[node.provider]}
              displayName={getNodeDisplayName(
                {
                  kind: node.role === "trigger" ? "trigger" : "action",
                  provider: node.provider,
                  type: node.type,
                },
                { displayName: nodeDisplayNames?.[`${node.provider}:${node.type}`] ?? null },
              )}
            />
            {/* Dashed preview edge to the next ghost node (linear chain). */}
            {i < preview.nodes.length - 1 && (
              <span
                data-testid="builder-preview-edge"
                data-preview="true"
                aria-hidden
                className="builder-preview-edge-dashed my-0 h-6 animate-pulse border-l-2 border-dashed"
                style={{ borderColor: "var(--builder-accent)" }}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One holographic preview node — mirrors {@link "./WorkflowNodeCard"}'s layout (3px status rail,
 * avatar + kind chip + title + provider label head, status foot) with a proposed/holographic
 * treatment. Presentational only: no inputs, no controls, no config drawer. A still-incomplete node
 * shows a short "Needs setup" badge (with field count) — never a field list.
 */
function PreviewNodeCard({
  node,
  providerLabel,
  iconUrl,
  displayName,
}: {
  node: DraftPreviewNode;
  providerLabel: string;
  iconUrl?: string;
  /** Resolved human step name (registry display name, else the title-cased type key). */
  displayName: string;
}) {
  const isTrigger = node.role === "trigger";
  const railColor = isTrigger ? "var(--builder-success)" : "var(--builder-accent)";
  const missingCount = node.missingInputs?.length ?? 0;

  return (
    <div
      data-testid="builder-preview-node"
      data-preview="true"
      data-kind={node.role}
      // `builder-preview-node-ghost` + `animate-pulse` are the shared holographic markers (shimmer
      // pulse); `border-dashed` + the accent glow ring read as "proposed, not accepted".
      className="builder-preview-node-ghost relative w-[280px] animate-pulse overflow-hidden rounded-[6px] border border-dashed opacity-90"
      style={{
        // Glassy translucent surface so it reads as holographic, not a solid accepted card.
        background: "color-mix(in oklab, var(--builder-panel) 80%, transparent)",
        borderColor: "var(--builder-accent)",
        boxShadow: "0 0 0 3px color-mix(in oklab, var(--builder-accent) 18%, transparent)",
        backdropFilter: "blur(1.5px)",
      }}
    >
      {/* 3px left status rail — the real card's signature detail. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: railColor }}
      />

      <div className="flex gap-2.5 px-3 pb-1.5 pt-2.5">
        <PreviewProviderAvatar provider={node.provider} label={providerLabel} iconUrl={iconUrl} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <PreviewKindChip kind={node.role} />
            <code className="builder-mono text-[9.5px]" style={{ color: "var(--builder-muted-2)" }}>
              #{isTrigger ? "trigger" : "action"}
            </code>
            <PreviewBadge />
          </div>
          <div
            className="mt-0.5 truncate text-[12.5px] font-semibold leading-tight"
            title={node.label}
            style={{ color: "var(--builder-text)" }}
          >
            {displayName}
          </div>
          {/* `provider:type` capability label (mono subtitle), mirroring the card's mono subtitle. */}
          <code
            className="builder-mono mt-0.5 truncate text-[9.5px] leading-tight"
            style={{ color: "var(--builder-muted-2)" }}
          >
            {node.label}
          </code>
          <div
            className="mt-0.5 truncate text-[10.5px] leading-tight"
            style={{ color: "var(--builder-muted)" }}
            title={providerLabel}
          >
            {providerLabel}
          </div>
        </div>
      </div>

      {/* Foot — short status only (no field list). */}
      <div
        className="flex items-center justify-end gap-1 px-3 py-1.5"
        style={{
          background: "color-mix(in oklab, var(--builder-panel-2) 80%, transparent)",
          borderTop: "1px dashed var(--builder-border)",
        }}
      >
        {missingCount > 0 ? <NeedsSetupBadge count={missingCount} /> : <ProposedReadyBadge />}
      </div>
    </div>
  );
}

function PreviewBadge() {
  return (
    <span
      data-testid="preview-node-badge"
      className="builder-mono inline-flex items-center rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.05em]"
      style={{
        background: "color-mix(in oklab, var(--builder-accent) 14%, transparent)",
        color: "var(--builder-accent)",
        border: "1px dashed var(--builder-accent)",
        lineHeight: 1.5,
      }}
    >
      Preview
    </span>
  );
}

function PreviewKindChip({ kind }: { kind: DraftPreviewNode["role"] }) {
  const isTrigger = kind === "trigger";
  const cfg = isTrigger
    ? { bg: "var(--builder-success-soft)", fg: "var(--builder-success)", border: "var(--builder-success)" }
    : { bg: "var(--builder-accent-soft)", fg: "var(--builder-accent)", border: "var(--builder-accent)" };
  return (
    <span
      className="builder-mono inline-flex items-center rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.05em]"
      style={{ background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}`, lineHeight: 1.5 }}
    >
      {isTrigger ? "trigger" : "action"}
    </span>
  );
}

/** Short "Needs setup" status with a field count — NEVER a field list. */
function NeedsSetupBadge({ count }: { count: number }) {
  return (
    <span
      data-testid="preview-node-needs-setup"
      className="builder-mono inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{
        background: "var(--builder-warn-soft)",
        color: "var(--builder-warn)",
        border: "1px solid var(--builder-warn)",
      }}
    >
      Needs setup{count > 0 ? ` · ${count}` : ""}
    </span>
  );
}

function ProposedReadyBadge() {
  return (
    <span
      className="builder-mono inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[9.5px]"
      style={{
        background: "color-mix(in oklab, var(--builder-panel) 80%, transparent)",
        color: "var(--builder-muted)",
        border: "1px solid var(--builder-border)",
      }}
    >
      ready
    </span>
  );
}

/** Provider avatar mirroring the real card — icon when available, deterministic initials otherwise. */
function PreviewProviderAvatar({
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

  // Connectionless nodes (`native` built-ins + ChainReact AI) have no registry
  // icon — show the ChainReact brand mark instead of the generic initials
  // avatar. Mirrors WorkflowNodeCard.
  if (isConnectionlessProvider(provider) && !iconUrl) {
    return (
      <span
        aria-hidden="true"
        data-testid="preview-provider-icon"
        data-provider={provider}
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[4px]"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          marginTop: 1,
        }}
      >
        <ChainReactMark size={16} />
      </span>
    );
  }

  if (showImage) {
    return (
      <span
        aria-hidden="true"
        data-testid="preview-provider-icon"
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
    ? PREVIEW_AVATAR_PALETTE[hashToBucket(provider, PREVIEW_AVATAR_PALETTE.length)]
    : PREVIEW_AVATAR_PALETTE[0];
  return (
    <span
      aria-hidden="true"
      data-testid="preview-provider-initials-avatar"
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] text-[10px] font-semibold ${colorClass}`}
      style={{ marginTop: 1 }}
    >
      {initials}
    </span>
  );
}

/** Up to two leading initials, uppercase. Falls back to "?" for empty input. */
function computeInitials(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

/** Deterministic, salt-free bucket selector — avatar background only, never security-sensitive. */
function hashToBucket(input: string, buckets: number): number {
  if (buckets <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % buckets;
}

const PREVIEW_AVATAR_PALETTE = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
] as const;

const SparkleIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
  </svg>
);

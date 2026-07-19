"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "./adapters";
import {
  BRANCH_ALWAYS_HANDLE_ID,
  branchHandleId,
  branchLabelDisplay,
} from "../utils/branchHandles";
import { classifyNodeStatus, type NodeStatus } from "../utils/classifyNodeStatus";
import { useBuilderNodeActions } from "./nodeActionsContext";
import { NodeQuickActions } from "./NodeCardQuickActions";
import { DIFF_VISUAL, DiffPill } from "./nodeCardDiff";
import { ChainReactMark } from "@/components/brand/ChainReactMark";

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
  id,
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const isTrigger = data.kind === "trigger";
  const providerLabel = data.providerLabel ?? data.provider;

  // CONFIG-UX-NODE-SUMMARY-1 — the at-a-glance line ("Send Channel Message ·
  // #support-alerts") that lets an author read the node's behavior off the
  // COLLAPSED card. It only earns a line when it adds the recognizable resource
  // name: when it equals the title the card already says it, and the adapter
  // omits the headline entirely rather than surface an unresolved raw id.
  const showSummary =
    !!data.summaryHeadline && data.summaryHeadline !== data.displayName;

  // HERMES-AGENT-PREVIEW-DIFF-GRAPH — when this card is part of an AI preview diff graph, its
  // `diffStatus` drives a diff treatment (added/removed/changed) and READ-ONLY behavior (no rename /
  // delete / tail-add affordances). `unchanged` renders normally (just non-interactive).
  const diffStatus = data.diffStatus;
  const isPreview = diffStatus !== undefined;
  const diff = diffStatus && diffStatus !== "unchanged" ? DIFF_VISUAL[diffStatus] : null;
  const isRemoved = diffStatus === "removed";

  // Slice 4.BUILDER-NODE-QUICK-ACTIONS-1 — ambient rename/delete handlers from
  // the canvas. Each affordance renders only when its handler is wired.
  const { onRenameNode, onRequestDeleteNode, onAppendAfter } = useBuilderNodeActions();
  const showTailAdd = !isPreview && !!data.isTail && !!onAppendAfter;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // True while an Escape/Enter is handling exit, so the input's trailing onBlur
  // doesn't double-commit (Enter) or wrongly commit (Escape).
  const skipBlurCommitRef = useRef(false);

  function startRename(): void {
    setNameDraft(data.customName ?? "");
    setEditingName(true);
  }
  function commitRename(): void {
    onRenameNode?.(id, nameDraft);
    setEditingName(false);
  }
  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Isolate the editor from canvas shortcuts (Delete/Backspace must not delete
    // the node; arrows/space must not pan) while the user types a name.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      setEditingName(false); // cancel — discard the draft, no rename
    }
  }
  function handleRenameBlur(): void {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      setEditingName(false);
      return;
    }
    commitRename();
  }
  const status: NodeStatus = classifyNodeStatus({
    type: data.type,
    missingRequiredConfig: data.missingRequiredConfig,
  });
  const isUnconfigured = status === "unconfigured";
  const needsSetup = status === "needs_setup";
  // Amber rail for both "not configured" (no type) and "needs setup" (required
  // field empty); accent for ready actions, success for triggers. A diff card's
  // status (added/removed/changed) overrides the rail color.
  const railColor = diff
    ? diff.rail
    : isTrigger
      ? "var(--builder-success)"
      : isUnconfigured || needsSetup
        ? "var(--builder-warn)"
        : "var(--builder-accent)";

  return (
    // Outer wrapper: positioned + NOT clipped. It hosts the connection handles so the
    // bottom source connector can protrude below the card (BUILDER-NODE-BOTTOM-CONNECTOR).
    // The inner card keeps its own `overflow-hidden` to clip its rounded corners, the
    // left status rail, and the footer background — moving overflow here is what left the
    // old bottom handle clipped to a half-circle INSIDE the node.
    <div
      data-testid="workflow-node-view"
      data-kind={data.kind}
      data-selected={selected ? "true" : undefined}
      data-status={status}
      {...(diffStatus ? { "data-diff-status": diffStatus } : {})}
      className="relative w-[280px]"
    >
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Top}
          isConnectableStart={false}
          aria-label="Incoming edge target"
          className="builder-handle"
        />
      ) : null}

      <div
        className={`relative overflow-hidden rounded-[6px] transition-colors${isRemoved ? " opacity-60" : ""}`}
        style={{
          background: "var(--builder-panel)",
          border: diff
            ? `1px ${diff.borderStyle} ${diff.border}`
            : `1px solid ${selected ? "var(--builder-accent)" : "var(--builder-border)"}`,
          boxShadow: diff
            ? diff.shadow
            : selected
              ? "0 0 0 2px var(--builder-accent-soft), var(--builder-shadow-md)"
              : "var(--builder-shadow-sm)",
        }}
      >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: railColor }}
      />

      <NodeQuickActions
        canRename={!isPreview && !!onRenameNode && !editingName}
        canDelete={!isPreview && !!onRequestDeleteNode && data.kind === "action"}
        onRename={startRename}
        onDelete={() => onRequestDeleteNode?.(id)}
      />

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
            {diff ? <DiffPill diff={diff} /> : null}
          </div>
          {editingName ? (
            <input
              data-testid="node-rename-input"
              type="text"
              maxLength={120}
              autoFocus
              aria-label="Node name"
              value={nameDraft}
              placeholder={data.displayName}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
              // Don't let a click/drag inside the field select / drag / open the node.
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              className="nodrag nopan mt-0.5 w-full rounded-[3px] px-1 py-0.5 text-[12.5px] font-semibold leading-tight outline-none"
              style={{
                background: "var(--builder-bg)",
                border: "1px solid var(--builder-accent)",
                color: "var(--builder-text)",
              }}
            />
          ) : (
            <div
              className={`mt-0.5 truncate text-[12.5px] font-semibold leading-tight${isRemoved ? " line-through" : ""}`}
              title={data.displayName}
              onDoubleClick={
                !isPreview && onRenameNode
                  ? (event) => {
                      event.stopPropagation();
                      startRename();
                    }
                  : undefined
              }
              style={{ color: isRemoved ? "var(--builder-muted)" : "var(--builder-text)" }}
            >
              {data.displayName}
            </div>
          )}
          <div
            className="mt-0.5 truncate text-[10.5px] leading-tight"
            style={{ color: "var(--builder-muted)" }}
            title={providerLabel}
          >
            {providerLabel}
          </div>
          {showSummary ? (
            <div
              data-testid="node-summary-line"
              className="mt-0.5 truncate text-[10.5px] leading-tight"
              style={{ color: "var(--builder-muted)" }}
              title={data.summaryHeadline}
            >
              {data.summaryHeadline}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-1 px-3 py-1.5"
        style={{
          background: "var(--builder-panel-2)",
          borderTop: "1px dashed var(--builder-border)",
        }}
      >
        {showTailAdd ? (
          <button
            type="button"
            data-testid="node-tail-add"
            aria-label="Add next step"
            title="Add the next step after this one"
            onClick={(event) => {
              event.stopPropagation();
              onAppendAfter?.(id);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className="nodrag inline-flex h-5 items-center gap-1 rounded-[3px] px-1.5 text-[10px] font-medium"
            style={{
              background: "var(--builder-accent-soft)",
              border: "1px dashed var(--builder-accent)",
              color: "var(--builder-accent)",
            }}
          >
            + Add step
          </button>
        ) : (
          <span />
        )}
        {isUnconfigured ? (
          <NotConfiguredBadge />
        ) : needsSetup ? (
          <NeedsSetupBadge />
        ) : (
          <ReadyBadge />
        )}
      </div>
      </div>

      {data.branchHandles && data.branchHandles.length > 0 ? (
        // BRANCH-ENT-1 C4 — one labeled source handle per route + an Always
        // (cleanup) handle. Handle IDS carry route identity; the caption row
        // below uses the same equal-column layout as the handle percentages,
        // so caption and dot stay aligned at every card width.
        <BranchHandles labels={data.branchHandles} />
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          aria-label="Outgoing edge source"
          className="builder-handle--source"
        />
      )}
    </div>
  );
}

/**
 * Labeled branch source handles + caption row for a branching node. Each
 * route handle's id is `branch:<label>` (stable route identity — never
 * positional); the trailing "Always" handle creates unlabeled cleanup edges.
 */
function BranchHandles({ labels }: { labels: readonly string[] }) {
  const all: Array<{ id: string; caption: string; isAlways: boolean }> = [
    ...labels.map((label) => ({
      id: branchHandleId(label),
      caption: branchLabelDisplay(label),
      isAlways: false,
    })),
    { id: BRANCH_ALWAYS_HANDLE_ID, caption: "Always", isAlways: true },
  ];
  const count = all.length;
  return (
    <>
      <div
        data-testid="branch-handle-captions"
        className="grid pt-0.5"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {all.map((h) => (
          <span
            key={h.id}
            className="builder-mono truncate text-center text-[8.5px] font-medium uppercase tracking-[0.04em]"
            style={{
              color: h.isAlways ? "var(--builder-muted-2)" : "var(--builder-accent)",
            }}
            title={h.isAlways ? "Runs on every result" : `${h.caption} route`}
          >
            {h.caption}
          </span>
        ))}
      </div>
      {all.map((h, i) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Bottom}
          aria-label={
            h.isAlways
              ? "Outgoing edge source (always runs)"
              : `Outgoing ${h.caption} route source`
          }
          className="builder-handle--source"
          style={{ left: `${((i + 0.5) / count) * 100}%` }}
        />
      ))}
    </>
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

  // Built-in ("native") nodes — loop, filter, delay, router, manual/schedule
  // triggers — carry `provider: "native"` and have no integrations-registry
  // icon. Show the ChainReact brand mark instead of the generic initials
  // avatar. One branch for the built-in group, not per-provider iconography.
  if (provider === "native" && !iconUrl) {
    return (
      <span
        aria-hidden="true"
        data-testid="provider-icon"
        data-provider="native"
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

function NeedsSetupBadge() {
  return (
    <span
      data-testid="needs-setup-badge"
      className="builder-mono inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{
        background: "var(--builder-warn-soft)",
        color: "var(--builder-warn)",
        border: "1px solid var(--builder-warn)",
      }}
    >
      Needs setup
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

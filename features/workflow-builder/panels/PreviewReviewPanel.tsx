"use client";

import type { ReactNode } from "react";
import type {
  ConfigDiff,
  ConfigDiffValue,
  ConfigFieldChange,
  NodeConfigDiff,
} from "@/core/workflows/buildConfigDiff";
import type {
  AgentPreviewFieldReason,
  AgentPreviewRationale,
} from "@/core/workflows/buildPreviewRationale";

/**
 * React Agent preview — right-rail "Review changes" panel (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * While an EDIT preview is active the right drawer switches into this review mode. The canvas keeps
 * showing the STRUCTURAL node diff; this rail owns the VALUE-level detail so the user never has to open
 * each node to understand what the agent changed: a one-line summary, the node-change overview, then the
 * per-node field changes (added / changed before→after / removed), the still-missing required fields,
 * and the variables the config references.
 *
 * Presentational ONLY: no store access, no fetch, no service/repository import, no persistence. All data
 * arrives via props (the diff is computed by the pure `buildConfigDiff` core helper in `WorkflowBuilder`).
 * `onApply` / `onDiscard` are the existing explicit preview actions — this panel never mutates anything.
 *
 * No-leak: the diff is already redacted/summarized by the core helper. Secret-shaped fields arrive as
 * `{ kind: "redacted" }` and render as "Changed (hidden)" — the raw value is NEVER present in props, so
 * it can never reach the DOM, a snapshot, or test output. `configDiff === null` (compute failed) renders
 * a calm fallback that still lets the user Apply or Discard.
 */

export interface PreviewReviewPanelProps {
  /** One-sentence agent summary of the proposal (preview.summary). */
  readonly summary?: string;
  /** The value-level diff, or null when computation failed (renders the fallback). */
  readonly configDiff: ConfigDiff | null;
  /**
   * REACT-AGENT-PREVIEW-WHY — deterministic "Why this change?" rationale (labels + prompt only,
   * never config values). Rendered near the top ONLY when it has bullets; null/empty → no section.
   */
  readonly rationale?: AgentPreviewRationale | null;
  /** Existing explicit "Apply preview" action (replaces the local draft). Omit in read-only mode. */
  readonly onApply?: () => void;
  /** Existing explicit "Discard preview" action (graph unchanged). Omit in read-only mode. */
  readonly onDiscard?: () => void;
  /**
   * AGENT-CHANGE-HISTORY-1 — read-only mode for the historical "View diff" drawer: render the same
   * value-level diff WITHOUT the Apply/Discard actions (a past change can't be re-applied from here).
   */
  readonly hideActions?: boolean;
}

const WHY_BULLET_DOT: Record<string, string> = {
  node_added: "var(--builder-success, #15803d)",
  node_removed: "var(--builder-danger, #b91c1c)",
  needs_user_input: "var(--builder-warning, #b45309)",
};

const STATUS_VERB: Record<NodeConfigDiff["status"], string> = {
  added: "Added",
  changed: "Changed",
  removed: "Removing",
};

interface FieldReasonGroup {
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly reasons: readonly AgentPreviewFieldReason[];
}

/** Group the flat high-risk field reasons by node, preserving first-seen order. */
function groupFieldReasonsByNode(
  reasons: readonly AgentPreviewFieldReason[],
): readonly FieldReasonGroup[] {
  const groups: FieldReasonGroup[] = [];
  const byNode = new Map<string, AgentPreviewFieldReason[]>();
  for (const reason of reasons) {
    let bucket = byNode.get(reason.nodeId);
    if (!bucket) {
      bucket = [];
      byNode.set(reason.nodeId, bucket);
      groups.push({ nodeId: reason.nodeId, nodeLabel: reason.nodeLabel, reasons: bucket });
    }
    bucket.push(reason);
  }
  return groups;
}

export function PreviewReviewPanel({
  summary,
  configDiff,
  rationale,
  onApply,
  onDiscard,
  hideActions,
}: PreviewReviewPanelProps) {
  const whyBullets = rationale?.bullets ?? [];
  const fieldReasonGroups = groupFieldReasonsByNode(rationale?.fieldReasons ?? []);
  const actions =
    !hideActions && onApply && onDiscard ? (
      <ReviewActions onApply={onApply} onDiscard={onDiscard} />
    ) : null;
  if (configDiff === null) {
    return (
      <div data-testid="preview-review-panel" className="flex flex-col gap-3 p-3">
        <p
          data-testid="preview-review-fallback"
          className="text-[12px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {hideActions
            ? "Couldn't build the change preview for this item."
            : "Couldn't build the change preview. You can still apply or discard the suggested change."}
        </p>
        {actions}
      </div>
    );
  }

  const { nodes } = configDiff;
  const missingByNode = nodes.filter((n) => n.missingRequiredFields.length > 0);

  return (
    <div data-testid="preview-review-panel" className="flex flex-col gap-3 p-3">
      {summary ? (
        <section data-testid="preview-review-summary">
          <SectionHeading>Summary</SectionHeading>
          <p className="mt-1 text-[12px]" style={{ color: "var(--builder-text)" }}>
            {summary}
          </p>
        </section>
      ) : null}

      {whyBullets.length > 0 ? (
        <section data-testid="preview-review-why">
          <SectionHeading>{rationale?.title ?? "Why this change?"}</SectionHeading>
          <ul className="mt-1 space-y-1">
            {whyBullets.map((bullet, index) => (
              <li
                key={`why-${bullet.kind}-${bullet.nodeId ?? ""}-${bullet.fieldPath ?? ""}-${index}`}
                data-testid={`preview-review-why-${bullet.kind}`}
                className="flex gap-1.5 text-[12px]"
                style={{
                  color:
                    bullet.kind === "needs_user_input"
                      ? "var(--builder-warning, #b45309)"
                      : "var(--builder-text)",
                }}
              >
                <span aria-hidden style={{ color: WHY_BULLET_DOT[bullet.kind] ?? "var(--builder-muted)" }}>
                  •
                </span>
                <span>{bullet.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {fieldReasonGroups.length > 0 ? (
        <section data-testid="preview-review-field-reasons">
          <SectionHeading>High-risk fields</SectionHeading>
          <div className="mt-1 space-y-1.5">
            {fieldReasonGroups.map((group) => (
              <div
                key={`field-reasons-${group.nodeId}`}
                data-testid={`preview-review-field-reasons-${group.nodeId}`}
              >
                <div className="text-[11px] font-semibold" style={{ color: "var(--builder-muted)" }}>
                  {group.nodeLabel}
                </div>
                <ul className="ml-3 list-disc">
                  {group.reasons.map((reason) => (
                    <li
                      key={`${reason.fieldPath}-${reason.status}`}
                      data-testid={`preview-review-field-reason-${group.nodeId}-${reason.fieldPath}`}
                      className="text-[11.5px]"
                      style={{ color: "var(--builder-text)" }}
                    >
                      {reason.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section data-testid="preview-review-node-changes">
        <SectionHeading>Node changes</SectionHeading>
        {nodes.length === 0 ? (
          <p className="mt-1 text-[12px]" style={{ color: "var(--builder-muted)" }}>
            No node-level changes.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {nodes.map((node) => (
              <li
                key={`overview-${node.nodeId}`}
                data-testid={`preview-review-overview-${node.nodeId}`}
                className="text-[12px]"
                style={{ color: "var(--builder-text)" }}
              >
                <StatusDot status={node.status} /> {STATUS_VERB[node.status]} {node.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      {nodes.length > 0 ? (
        <section data-testid="preview-review-config-changes">
          <SectionHeading>Config changes</SectionHeading>
          <div className="mt-1 space-y-3">
            {nodes.map((node) => (
              <NodeChangeCard key={`card-${node.nodeId}`} node={node} />
            ))}
          </div>
        </section>
      ) : null}

      {missingByNode.length > 0 ? (
        <section data-testid="preview-review-setup-needed">
          <SectionHeading>Setup needed</SectionHeading>
          <div className="mt-1 space-y-1.5">
            {missingByNode.map((node) => (
              <div key={`missing-${node.nodeId}`} className="text-[12px]">
                <div className="font-medium" style={{ color: "var(--builder-text)" }}>
                  {node.label}
                </div>
                <ul className="ml-3 list-disc">
                  {node.missingRequiredFields.map((f) => (
                    <li
                      key={f.name}
                      data-testid={`preview-review-missing-${node.nodeId}-${f.name}`}
                      style={{ color: "var(--builder-warning, #b45309)" }}
                    >
                      {f.label}: required
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {actions}
    </div>
  );
}

function NodeChangeCard({ node }: { readonly node: NodeConfigDiff }) {
  const nothing =
    node.addedFields.length === 0 &&
    node.changedFields.length === 0 &&
    node.removedFields.length === 0;
  return (
    <div
      data-testid={`preview-review-node-${node.nodeId}`}
      className="rounded-md border p-2"
      style={{ background: "var(--builder-panel-2)", borderColor: "var(--builder-border)" }}
    >
      <div className="text-[12px] font-semibold" style={{ color: "var(--builder-text)" }}>
        <StatusDot status={node.status} /> {node.label}
      </div>

      {node.addedFields.length > 0 ? (
        <FieldGroup title="Added fields" testid={`preview-review-added-${node.nodeId}`}>
          {node.addedFields.map((f) => (
            <FieldRow key={f.name} change={f} show="after" />
          ))}
        </FieldGroup>
      ) : null}

      {node.changedFields.length > 0 ? (
        <FieldGroup title="Changed" testid={`preview-review-changed-${node.nodeId}`}>
          {node.changedFields.map((f) => (
            <FieldRow key={f.name} change={f} show="both" />
          ))}
        </FieldGroup>
      ) : null}

      {node.removedFields.length > 0 ? (
        <FieldGroup title="Removed config" testid={`preview-review-removed-${node.nodeId}`}>
          {node.removedFields.map((f) => (
            <FieldRow key={f.name} change={f} show="before" />
          ))}
        </FieldGroup>
      ) : null}

      {node.variablesUsed.length > 0 ? (
        <FieldGroup title="Variables used" testid={`preview-review-variables-${node.nodeId}`}>
          <ul className="ml-3 list-disc">
            {node.variablesUsed.map((token) => (
              <li key={token} className="font-mono text-[11px]" style={{ color: "var(--builder-muted)" }}>
                {token}
              </li>
            ))}
          </ul>
        </FieldGroup>
      ) : null}

      {nothing && node.variablesUsed.length === 0 ? (
        <p className="mt-1 text-[11px]" style={{ color: "var(--builder-muted)" }}>
          No field-level changes.
        </p>
      ) : null}
    </div>
  );
}

function FieldRow({
  change,
  show,
}: {
  readonly change: ConfigFieldChange;
  readonly show: "before" | "after" | "both";
}) {
  return (
    <div
      data-testid={`preview-review-field-${change.name}`}
      className="text-[11.5px]"
      style={{ color: "var(--builder-text)" }}
    >
      <span className="font-medium">{change.label}</span>:{" "}
      {show === "before" ? <ValueText value={change.before} /> : null}
      {show === "after" ? <ValueText value={change.after} /> : null}
      {show === "both" ? (
        <>
          <ValueText value={change.before} /> <span aria-hidden>→</span>{" "}
          <ValueText value={change.after} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Render one redacted/summarized value. A redacted value shows a fixed "hidden" label and NEVER a
 * value (the raw value is not even present in props). Plain English for empties/summaries.
 */
function ValueText({ value }: { readonly value?: ConfigDiffValue }) {
  if (!value) return <span style={{ color: "var(--builder-muted)" }}>(none)</span>;
  switch (value.kind) {
    case "redacted":
      return (
        <span data-testid="preview-review-redacted" style={{ color: "var(--builder-muted)" }}>
          hidden
        </span>
      );
    case "empty":
      return <span style={{ color: "var(--builder-muted)" }}>(empty)</span>;
    case "scalar":
      return <span className="font-mono">{String(value.value)}</span>;
    case "text":
      return (
        <span>
          “{value.preview}”{value.truncated ? <span style={{ color: "var(--builder-muted)" }}>… (truncated)</span> : null}
        </span>
      );
    case "summary":
      return <span style={{ color: "var(--builder-muted)" }}>{value.summary}</span>;
    default:
      return null;
  }
}

function FieldGroup({
  title,
  testid,
  children,
}: {
  readonly title: string;
  readonly testid: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-testid={testid} className="mt-1.5">
      <div className="text-[11px] font-semibold" style={{ color: "var(--builder-muted)" }}>
        {title}
      </div>
      <div className="mt-0.5 space-y-0.5">{children}</div>
    </div>
  );
}

function SectionHeading({ children }: { readonly children: ReactNode }) {
  return (
    <h3
      className="text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: "var(--builder-muted)" }}
    >
      {children}
    </h3>
  );
}

function StatusDot({ status }: { readonly status: NodeConfigDiff["status"] }) {
  const color =
    status === "added"
      ? "var(--builder-success, #15803d)"
      : status === "removed"
        ? "var(--builder-danger, #b91c1c)"
        : "var(--builder-accent)";
  return <span aria-hidden style={{ color }}>●</span>;
}

function ReviewActions({
  onApply,
  onDiscard,
}: {
  readonly onApply: () => void;
  readonly onDiscard: () => void;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="button"
        onClick={onApply}
        data-testid="preview-review-apply"
        className="flex-1 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white"
        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
        title="Apply this change to your draft (you still review fields and save)"
      >
        Apply preview
      </button>
      <button
        type="button"
        onClick={onDiscard}
        data-testid="preview-review-discard"
        className="rounded-md px-2.5 py-1.5 text-[12px] font-medium"
        style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
        title="Discard preview (your workflow is unchanged)"
      >
        Discard
      </button>
    </div>
  );
}

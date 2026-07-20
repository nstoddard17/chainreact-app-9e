"use client";

import { useEffect, useMemo, useRef } from "react";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { SchemaForm } from "../config-modal/SchemaForm";
import { useNodeMeta } from "../hooks/useNodeMeta";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import { planGuidedStop, type GuidedStopInspectorReason } from "./guidedStopModel";

/**
 * 5.DUAL-BUILDER-1 CS-2 — the anchored single-question editor.
 *
 * Expands IN PLACE under the sentence that owns the clicked chip (the
 * Document makes room; nothing modal, nothing centered), with a caret tying
 * it to the phrase. The field is the REAL renderer: `SchemaForm only=` over
 * the node's full metadata + the full shared draft values, so dependsOn,
 * visibleWhen, async options, variable picker, validation, and sensitivity
 * behave exactly as in the inspector. Fields the single-question surface
 * can't carry honestly (secret/connection, composite-managed, structural
 * editors, hidden modes) offer the step-level inspector instead.
 *
 * Motion: one gentle expand transition, disabled under
 * `prefers-reduced-motion` (Tailwind `motion-reduce:transition-none`).
 */

const INSPECTOR_REASON_COPY: Record<GuidedStopInspectorReason, string> = {
  sensitive_field: "This setting is edited in the step's full settings for safety.",
  composite_field: "This value is part of a larger editor in the step's settings.",
  structural_editor: "This setting has its own editor in the step's settings.",
  hidden_field: "This setting no longer applies with the current choices.",
  unknown_field: "This setting isn't editable here.",
};

export function GuidedStopEditor({
  nodeId,
  fieldName,
  onCommit,
  onCancel,
  onOpenInspector,
}: {
  nodeId: string;
  fieldName: string;
  onCommit: () => void;
  onCancel: () => void;
  onOpenInspector: () => void;
}) {
  const node = useGraphSlice((s) => s.pendingNodes.find((n) => n.id === nodeId));
  const draft = useConfigSlice((s) => s.drafts[nodeId]);
  const updateField = useConfigSlice((s) => s.updateField);
  const { meta, loading, error } = useNodeMeta(node);

  // Stable identity so the plan memo below doesn't recompute every render.
  const values = useMemo(
    () => draft?.values ?? node?.config ?? {},
    [draft?.values, node?.config],
  );
  const errors = draft?.errors ?? {};

  const plan = useMemo(
    () => (meta ? planGuidedStop(meta.fields, fieldName, values) : null),
    [meta, fieldName, values],
  );

  // Focus the editor container on mount so Escape works immediately and
  // screen-reader users land on the question, not the page root.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  if (!node) return null;

  const field = plan?.kind === "inline" ? plan.field : undefined;
  const fieldError = field ? errors[field.name] : undefined;
  const stepTitle = getNodeDisplayName(
    node,
    meta ? { displayName: meta.displayName } : undefined,
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label={`Edit ${field?.label ?? fieldName} for ${stepTitle}`}
      data-testid="document-guided-stop"
      data-node-id={nodeId}
      data-field-name={fieldName}
      className="relative mt-2 outline-none transition-[opacity,transform] motion-reduce:transition-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {/* Caret tying the editor to the sentence above it. */}
      <span
        aria-hidden
        className="absolute -top-[7px] left-8 h-3.5 w-3.5 rotate-45 rounded-[3px]"
        style={{
          background: "var(--builder-panel)",
          borderLeft: "1.5px solid var(--builder-accent)",
          borderTop: "1.5px solid var(--builder-accent)",
        }}
      />
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "var(--builder-panel)",
          border: "1.5px solid var(--builder-accent)",
          boxShadow: "0 14px 34px -18px rgba(0,0,0,.35)",
        }}
      >
        <div className="mb-2 flex items-baseline gap-2">
          <span
            className="builder-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--builder-muted)" }}
          >
            Edit
          </span>
          <span className="text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
            {field?.label ?? fieldName}
          </span>
          <span className="text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
            · {stepTitle}
          </span>
        </div>

        {loading ? (
          <p
            className="m-0 py-2 text-[12.5px]"
            style={{ color: "var(--builder-muted)" }}
            data-testid="guided-stop-loading"
          >
            Loading this step&rsquo;s settings…
          </p>
        ) : error || !meta ? (
          <div data-testid="guided-stop-meta-error">
            <p className="m-0 text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
              This step&rsquo;s settings couldn&rsquo;t load here.
            </p>
            <button
              type="button"
              data-testid="guided-stop-open-inspector"
              onClick={onOpenInspector}
              className="mt-2 inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
              style={{
                background: "var(--builder-panel-2)",
                color: "var(--builder-text)",
                border: "1px solid var(--builder-border)",
              }}
            >
              Open step settings
            </button>
          </div>
        ) : plan?.kind === "inspector" ? (
          <div data-testid="guided-stop-inspector-handoff" data-reason={plan.reason}>
            <p className="m-0 text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
              {INSPECTOR_REASON_COPY[plan.reason]}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {plan.reason !== "hidden_field" && plan.reason !== "unknown_field" ? (
                <button
                  type="button"
                  data-testid="guided-stop-open-inspector"
                  onClick={onOpenInspector}
                  className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
                  style={{
                    background: "var(--builder-panel-2)",
                    color: "var(--builder-text)",
                    border: "1px solid var(--builder-border)",
                  }}
                >
                  Open step settings
                </button>
              ) : null}
              <button
                type="button"
                data-testid="guided-stop-cancel"
                onClick={onCancel}
                className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
                style={{ color: "var(--builder-muted)" }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* The REAL renderer chain: full field list in scope, one drawn. */}
            <SchemaForm
              fields={meta.fields}
              values={values}
              errors={errors}
              only={fieldName}
              onChange={(name, value) => updateField({ nodeId, name, value })}
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                data-testid="guided-stop-cancel"
                onClick={onCancel}
                className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
                style={{ color: "var(--builder-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="guided-stop-open-inspector"
                onClick={onOpenInspector}
                className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
                style={{ color: "var(--builder-muted)" }}
                title="Everything this step does, in one place"
              >
                All settings
              </button>
              <button
                type="button"
                data-testid="guided-stop-done"
                onClick={onCommit}
                disabled={fieldError !== undefined}
                className="ml-auto inline-flex h-8 items-center rounded-md px-3.5 text-[12.5px] font-semibold disabled:opacity-50"
                style={{
                  background: "var(--builder-text)",
                  color: "var(--builder-panel)",
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

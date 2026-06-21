"use client";

import type { PreviewSetupField } from "@/core/workflows/previewSetupFields";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";

/**
 * Shared guided-setup field controls (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP).
 *
 * Extracted from `BuilderPreviewSetupCard` so BOTH the preview-setup card (collects values into
 * ephemeral previewConfig before Apply) and the existing-node setup card (updates an existing draft
 * node on explicit "Update step") render the SAME safe local controls with identical behavior.
 *
 * GUARANTEES (presentational only): no store access, no direct fetch, no model/gateway/Hermes call, no
 * secret. Values flow up via `onChange`. Async single-select options load ONLY through the existing
 * authenticated, account-scoped resolver (`useOptionsSource` → `GET /api/options/[source]`) — the SAME
 * path normal builder config uses, NEVER a model/Hermes call. secret/connection fields are dropped
 * upstream (never in `setupFieldsByType`) so they never reach these controls.
 *
 * Each control takes a fully-formed `testid` so the caller owns the id namespace
 * (`preview-setup-<previewId>-<field>` vs `node-setup-<nodeId>-<field>`); error/retry derive from it.
 */

const inputStyle = {
  background: "var(--builder-panel-2)",
  border: "1px solid var(--builder-border)",
  color: "var(--builder-text)",
} as const;

/**
 * BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-KEYBOARD — Enter submits the setup action (parity with the
 * "Update step" button); Shift+Enter inserts a newline where the control is multiline. IME composition
 * never submits. Mirrors the chat composer's feel but is scoped to the setup field — it NEVER sends a
 * chat message or calls a model. `allowNewline` is true only for the textarea control.
 */
function submitOnEnter(
  e: import("react").KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  onSubmit: (() => void) | undefined,
  allowNewline: boolean,
): void {
  if (!onSubmit) return;
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
  if (allowNewline && e.shiftKey) return; // Shift+Enter → newline in the textarea
  e.preventDefault();
  onSubmit();
}

/**
 * Async single-select control for a `select-async` field. Loads options through the existing
 * authenticated resolver (`useOptionsSource`). NEVER a model/Hermes call. `dependsOn` parents are read
 * from `nodeConfig` (this control's own collected values); an unresolved parent defers the field.
 */
export function SetupAsyncSelectControl({
  field,
  value,
  nodeConfig,
  workflowId,
  onChange,
  onFocus,
  testid,
}: {
  field: PreviewSetupField;
  value: unknown;
  nodeConfig: Readonly<Record<string, unknown>> | undefined;
  workflowId?: string;
  onChange: (value: unknown) => void;
  /** Optional: emitted when the control gains focus (existing-node setup → reveal the node config). */
  onFocus?: () => void;
  testid: string;
}) {
  const strValue = typeof value === "string" ? value : "";

  // Resolve dependsOn parents from THIS control's collected values (never from upstream graph).
  const deps: Record<string, string> = {};
  let missingDep: string | undefined;
  for (const parent of field.dependsOn ?? []) {
    const pv = nodeConfig?.[parent];
    const s = typeof pv === "string" ? pv : typeof pv === "number" ? String(pv) : "";
    if (s.trim().length === 0) {
      if (!missingDep) missingDep = parent;
      continue;
    }
    deps[parent] = s;
  }
  const depsUnresolved = (field.dependsOn?.length ?? 0) > 0 && missingDep !== undefined;

  const { state, refetch } = useOptionsSource({
    source: field.optionsSource ?? null,
    deps,
    enabled: !depsUnresolved,
    ...(workflowId ? { workflowId } : {}),
  });

  const labelEl = (
    <span className="block" style={{ color: "var(--builder-muted)" }}>
      {field.label}
    </span>
  );

  if (depsUnresolved) {
    return (
      <label className="mt-1.5 block text-[11px]">
        {labelEl}
        <select
          data-testid={testid}
          aria-label={field.label}
          disabled
          value=""
          onChange={() => {}}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        >
          <option value="">Choose {missingDep} first</option>
        </select>
      </label>
    );
  }

  if (
    state.status === "error" ||
    state.status === "disconnected" ||
    state.status === "needs-reconnect" ||
    state.status === "owner-gated" ||
    state.status === "owner-must-connect"
  ) {
    const canRetry = state.status === "error" || state.status === "disconnected" || state.status === "needs-reconnect";
    return (
      <div className="mt-1.5 block text-[11px]">
        {labelEl}
        <div
          data-testid={`${testid}-error`}
          className="mt-0.5 rounded px-2 py-1 text-[11px]"
          style={{ background: "var(--builder-panel-2)", border: "1px solid var(--builder-border)", color: "var(--builder-muted)" }}
        >
          Couldn&apos;t load options.{" "}
          {canRetry && (
            <button
              type="button"
              data-testid={`${testid}-retry`}
              onClick={refetch}
              className="underline"
              style={{ color: "var(--builder-accent)" }}
            >
              Try again
            </button>
          )}
          {!canRetry && <span>You can finish this in the step editor.</span>}
        </div>
      </div>
    );
  }

  const loading = state.status === "loading";
  const empty = state.status === "empty";

  return (
    <label className="mt-1.5 block text-[11px]">
      {labelEl}
      <select
        data-testid={testid}
        aria-label={field.label}
        value={strValue}
        disabled={loading || empty}
        onChange={(e) => onChange(e.target.value)}
        {...(onFocus ? { onFocus } : {})}
        className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
        style={inputStyle}
      >
        <option value="">{loading ? "Loading…" : empty ? "No options available" : "Select…"}</option>
        {state.items.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One guided-setup control for a supported non-async field. Native primitives; value flows via onChange. */
export function SetupFieldControl({
  field,
  value,
  onChange,
  onFocus,
  onSubmit,
  testid,
}: {
  field: PreviewSetupField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Optional: emitted when the control gains focus (existing-node setup → reveal the node config). */
  onFocus?: () => void;
  /** Optional: Enter submits the setup action (text/number/textarea only; Shift+Enter = newline). */
  onSubmit?: () => void;
  testid: string;
}) {
  const strValue = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const focusProp = onFocus ? { onFocus } : {};

  if (field.type === "boolean") {
    return (
      <label className="mt-1.5 flex items-center gap-2 text-[11.5px]" style={{ color: "var(--builder-text)" }}>
        <input
          type="checkbox"
          data-testid={testid}
          aria-label={field.label}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          {...focusProp}
        />
        {field.label}
      </label>
    );
  }

  return (
    <label className="mt-1.5 block text-[11px]" style={{ color: "var(--builder-muted)" }}>
      {field.label}
      {field.type === "textarea" ? (
        <textarea
          data-testid={testid}
          aria-label={field.label}
          value={strValue}
          rows={2}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => submitOnEnter(e, onSubmit, true)}
          {...focusProp}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        />
      ) : field.type === "select" ? (
        <select
          data-testid={testid}
          aria-label={field.label}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          {...focusProp}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          data-testid={testid}
          aria-label={field.label}
          value={strValue}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => submitOnEnter(e, onSubmit, false)}
          {...focusProp}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        />
      )}
    </label>
  );
}

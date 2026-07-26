"use client";

import { useState } from "react";
import type { PreviewSetupField } from "@/core/workflows/previewSetupFields";
import {
  classifyOptionsRecovery,
  validateManualOptionId,
  type OptionsRecoveryErrorCode,
} from "@/core/workflows/options/optionsRecovery";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import { SetupFieldRecovery } from "./SetupFieldRecovery";

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
 *
 * REACT-AGENT-RESOLVER-RECOVERY-1 — when the resolver cannot produce a list, this control NEVER dead
 * ends. It renders the shared {@link SetupFieldRecovery} block built from the pure
 * `classifyOptionsRecovery` descriptor, so a connection problem, a rejected token, a missing
 * permission, an owner-managed credential, a provider outage, an unreachable request and an empty
 * account all read differently and each offers the recovery it actually supports (retry / reconnect /
 * open the step editor / type the provider ID). Manual mode is owned HERE, not by the recovery block,
 * so a later successful load never yanks the input out from under the user mid-type.
 */
export function SetupAsyncSelectControl({
  field,
  value,
  nodeConfig,
  workflowId,
  providerLabel,
  onChange,
  onFocus,
  onOpenStepEditor,
  openStepEditorLabel,
  openStepEditorTitle,
  testid,
}: {
  field: PreviewSetupField;
  value: unknown;
  nodeConfig: Readonly<Record<string, unknown>> | undefined;
  workflowId?: string;
  /** Display name for the field's provider ("Typeform"); falls back to a humanized source prefix. */
  providerLabel?: string;
  onChange: (value: unknown) => void;
  /** Optional: emitted when the control gains focus (existing-node setup → reveal the node config). */
  onFocus?: () => void;
  /**
   * Optional: open THIS field's node in its normal configuration panel, focused on this field.
   * Absent → the action is not rendered and no copy claims the step editor is reachable.
   */
  onOpenStepEditor?: () => void;
  openStepEditorLabel?: string;
  openStepEditorTitle?: string;
  testid: string;
}) {
  const strValue = typeof value === "string" ? value : "";

  // Manual "type the provider ID" mode. Owned by the control (not the recovery block) so it survives
  // the resolver state changing underneath it. `manualDraft === null` means "not editing yet"; the
  // draft seeds from whatever is already committed so entering manual mode loses nothing.
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

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

  // ── Manual provider-ID entry ────────────────────────────────────────────────────────────────
  // Deliberate, clearly-labeled fallback. A VALID id is committed through the same `onChange` the
  // picker uses (so it lands in exactly the same place and Apply seeds it normally); an INVALID one
  // clears the committed value instead of silently keeping a stale pick, so readiness stays honest.
  // The user's typing is never discarded — it lives in `manualDraft` regardless of validity.
  const commitManual = (next: string): void => {
    setManualDraft(next);
    const result = validateManualOptionId(next, {
      fieldLabel: field.label,
      ...(providerLabel ? { providerLabel } : {}),
    });
    if (result.ok) {
      setManualError(null);
      onChange(result.value);
      return;
    }
    setManualError(result.message);
    if (strValue.length > 0) onChange("");
  };

  if (manualMode) {
    const draft = manualDraft ?? strValue;
    return (
      <div className="mt-1.5 block text-[11px]" data-testid={`${testid}-manual-mode`}>
        {labelEl}
        <input
          type="text"
          data-testid={`${testid}-manual`}
          aria-label={`${field.label} ID`}
          value={draft}
          placeholder={`Paste the ${field.label} ID`}
          onChange={(e) => commitManual(e.target.value)}
          {...(onFocus ? { onFocus } : {})}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        />
        {manualError ? (
          <div
            data-testid={`${testid}-manual-error`}
            role="alert"
            className="mt-0.5"
            style={{ color: "var(--builder-danger, #f87171)" }}
          >
            {manualError}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            data-testid={`${testid}-picker-toggle`}
            onClick={() => {
              setManualMode(false);
              setManualError(null);
            }}
            className="underline"
            style={{ color: "var(--builder-accent)" }}
          >
            Choose from list instead
          </button>
          {onOpenStepEditor && (
            <button
              type="button"
              data-testid={`${testid}-open-step-editor`}
              onClick={onOpenStepEditor}
              className="underline"
              style={{ color: "var(--builder-accent)" }}
              {...(openStepEditorTitle ? { title: openStepEditorTitle } : {})}
            >
              {openStepEditorLabel ?? "Open step editor"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (
    state.status === "error" ||
    state.status === "disconnected" ||
    state.status === "needs-reconnect" ||
    state.status === "owner-gated" ||
    state.status === "owner-must-connect" ||
    state.status === "empty"
  ) {
    const descriptor = classifyOptionsRecovery({
      status: state.status,
      ...(state.status === "error" ? { code: state.code as OptionsRecoveryErrorCode } : {}),
      ...(field.optionsSource ? { source: field.optionsSource } : {}),
      ...(providerLabel ? { providerLabel } : {}),
      fieldLabel: field.label,
      ...(state.status === "error" && state.missingDependency !== undefined
        ? { missingDependency: state.missingDependency }
        : {}),
      // Only the route's own sanitized copy is ever forwarded; the options contract forbids provider
      // bodies / tokens / scopes in it. Generic messages are dropped in favour of the typed headline.
      ...(state.status !== "error" && "message" in state ? { serverMessage: state.message } : {}),
    });
    return (
      <div className="mt-1.5 block text-[11px]">
        {labelEl}
        <SetupFieldRecovery
          descriptor={descriptor}
          testid={testid}
          onRetry={refetch}
          onOpenStepEditor={onOpenStepEditor}
          {...(openStepEditorLabel ? { openStepEditorLabel } : {})}
          {...(openStepEditorTitle ? { openStepEditorTitle } : {})}
          {...(descriptor.canEnterManually
            ? {
                onEnterManualMode: () => {
                  setManualDraft(strValue);
                  setManualError(null);
                  setManualMode(true);
                },
              }
            : {})}
          {...(descriptor.canEnterManually
            ? {}
            : {
                manualUnavailableReason:
                  descriptor.kind === "parent-required"
                    ? "Typing an ID can't help until the earlier field is set."
                    : "Typing an ID won't help here.",
              })}
        />
      </div>
    );
  }

  const loading = state.status === "loading";

  return (
    <label className="mt-1.5 block text-[11px]">
      {labelEl}
      <select
        data-testid={testid}
        aria-label={field.label}
        value={strValue}
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
        {...(onFocus ? { onFocus } : {})}
        className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
        style={inputStyle}
      >
        <option value="">{loading ? "Loading…" : "Select…"}</option>
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

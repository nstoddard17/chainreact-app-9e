"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { SchemaSuggestionState } from "../../hooks/useSchemaSuggestion";

/**
 * The Suggest-fields status surface (AI-PROVIDER-7 CS-7).
 *
 * Split out of `SchemaFieldsField` for the same reason `SchemaFieldsRow` was:
 * the editor stays about ROWS, and this stays about the one transient
 * request. It renders nothing at all when the feature is idle, so an author
 * who never clicks the button sees exactly the CS-4 editor.
 *
 * Presentational: it owns no request state and applies nothing. Every action
 * is a callback the editor implements — which is what keeps "a proposal never
 * overwrites the author's work without a second, explicit click" a property of
 * the component tree rather than a promise in a comment.
 */
export interface SchemaFieldsSuggestPanelProps {
  readonly state: SchemaSuggestionState;
  /** True when the author already has rows a replace would discard. */
  readonly hasExistingRows: boolean;
  readonly disabled?: boolean;
  readonly onAdd: () => void;
  readonly onReplace: () => void;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

export function SchemaFieldsSuggestPanel({
  state,
  hasExistingRows,
  disabled,
  onAdd,
  onReplace,
  onRetry,
  onDismiss,
}: SchemaFieldsSuggestPanelProps) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <p
        data-testid="schema-fields-suggest-loading"
        role="status"
        className="px-1 text-[11.5px]"
        style={{ color: "var(--builder-muted)" }}
      >
        Reading your document to suggest fields...
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div
        data-testid="schema-fields-suggest-error"
        role="alert"
        className="flex flex-col gap-1.5 rounded-[5px] px-2 py-1.5"
        style={{
          border: "1px solid var(--builder-border)",
          background: "var(--builder-panel-2)",
        }}
      >
        <p className="text-[11.5px]" style={{ color: "var(--builder-text-2)" }}>
          {state.message}
        </p>
        <div className="flex items-center gap-2">
          {state.retryable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={disabled}
              data-testid="schema-fields-suggest-retry"
            >
              Try again
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  const count = state.proposal.fields.length;
  return (
    <div
      data-testid="schema-fields-suggest-proposal"
      className="flex flex-col gap-1.5 rounded-[5px] px-2 py-1.5"
      style={{
        border: "1px solid var(--builder-accent)",
        background: "var(--builder-panel-2)",
      }}
    >
      <p className="text-[11.5px]" style={{ color: "var(--builder-text-2)" }}>
        ChainReact found {count} field{count === 1 ? "" : "s"} in{" "}
        <strong>{state.proposal.sourceName}</strong>
        {state.proposal.truncated ? " (it read the first part of a long document)" : ""}.
        {hasExistingRows ? " Your current fields stay unless you replace them." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onAdd}
          disabled={disabled || count === 0}
          data-testid="schema-fields-suggest-add"
        >
          {hasExistingRows ? "Add these fields" : "Use these fields"}
        </Button>
        {hasExistingRows ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReplace}
            disabled={disabled || count === 0}
            data-testid="schema-fields-suggest-replace"
          >
            Replace my fields
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          data-testid="schema-fields-suggest-dismiss"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

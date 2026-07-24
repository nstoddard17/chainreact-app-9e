"use client";

import { useCallback, useRef, useState } from "react";
import {
  suggestSchema,
  type SchemaSuggestionErrorCode,
  type SuggestedSchemaField,
} from "@/lib/api/schemaSuggestion";

/**
 * Suggest-fields state machine (AI-PROVIDER-7 CS-7).
 *
 * Wraps the typed client in the discriminated state the schema editor renders:
 * idle → loading → (proposal | error), with an explicit `retry()` and a
 * `dismiss()` that returns to idle without touching the author's rows.
 *
 * Deliberately NOT owned by the editor component: the request is user-driven
 * (a click), never an effect, so nothing fires on mount, on re-render, or when
 * a sibling field changes. A second click while one is in flight is ignored,
 * and an unmount aborts the request rather than setting state on a dead
 * component.
 *
 * The hook never mutates config — it returns a PROPOSAL. Applying it (add or
 * replace) is the editor's explicit action.
 */

export interface SchemaSuggestionProposal {
  readonly fields: readonly SuggestedSchemaField[];
  /** Display name of the document that was read. */
  readonly sourceName: string;
  readonly truncated: boolean;
}

export type SchemaSuggestionState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "proposal"; readonly proposal: SchemaSuggestionProposal }
  | {
      readonly status: "error";
      readonly code: SchemaSuggestionErrorCode;
      readonly message: string;
      /** False for states a retry can't fix on its own (no sample yet). */
      readonly retryable: boolean;
    };

export interface UseSchemaSuggestionArgs {
  readonly workflowId: string | null;
  readonly nodeId: string | null;
  readonly sampleSourceField: string | undefined;
}

export interface UseSchemaSuggestionResult {
  readonly state: SchemaSuggestionState;
  /** True when the button can be shown at all (declared source + known node). */
  readonly available: boolean;
  readonly request: () => void;
  readonly dismiss: () => void;
}

/** A retry only makes sense when the cause might change on its own. */
function isRetryable(code: SchemaSuggestionErrorCode): boolean {
  return code === "SUGGESTIONS_UNAVAILABLE" || code === "UNKNOWN";
}

export function useSchemaSuggestion(
  args: UseSchemaSuggestionArgs,
): UseSchemaSuggestionResult {
  const [state, setState] = useState<SchemaSuggestionState>({ status: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  const { workflowId, nodeId, sampleSourceField } = args;
  const available =
    typeof sampleSourceField === "string" &&
    sampleSourceField.length > 0 &&
    typeof workflowId === "string" &&
    workflowId.length > 0 &&
    typeof nodeId === "string" &&
    nodeId.length > 0;

  const request = useCallback(() => {
    if (!available || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: "loading" });

    void suggestSchema({
      workflowId: workflowId as string,
      nodeId: nodeId as string,
      sampleSourceField: sampleSourceField as string,
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.ok) {
          setState({
            status: "proposal",
            proposal: {
              fields: response.schema.fields,
              sourceName: response.sourceName,
              truncated: response.truncated,
            },
          });
          return;
        }
        setState({
          status: "error",
          code: response.code,
          message: response.message,
          retryable: isRetryable(response.code),
        });
      })
      .catch(() => {
        // Only an abort reaches here (the client normalizes everything else).
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            code: "UNKNOWN",
            message: "ChainReact couldn't suggest fields just now. Try again in a moment.",
            retryable: true,
          });
        }
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, [available, workflowId, nodeId, sampleSourceField]);

  const dismiss = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, available, request, dismiss };
}

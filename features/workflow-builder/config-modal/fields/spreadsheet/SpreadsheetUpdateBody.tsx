"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import { useGraphSlice } from "../../../state/graphSlice";
import { useConfigSlice } from "../../../state/configSlice";
import { useActiveNodeUpstreamVariables } from "../../../hooks/useActiveNodeUpstreamVariables";
import type { FieldRendererProps } from "../types";
import { SpreadsheetUpdateEditor } from "./SpreadsheetUpdateEditor";
import type { DetectedColumn } from "./_updateModel";

/**
 * Data half of the record-shaped UPDATE editor
 * (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * Mirrors `SpreadsheetRowsBody` exactly: it loads the REAL worksheet
 * columns through the shared resolver hook, renders the shared non-ready
 * states (loading, honest empty, and the recoverable failure states the
 * whole product uses), and hands a plain column list to a presentational
 * editor. Keeping the fetch here is what lets `SpreadsheetUpdateEditor`
 * stay pure enough to test the three-state rules without a network.
 *
 * A resolver failure NEVER erases a saved record — `columnsUnavailable`
 * carries that fact down so the editor refuses to draw empty controls over
 * keyed data.
 */
export function SpreadsheetUpdateBody({
  field,
  value,
  onChange,
  disabled,
  deps,
}: FieldRendererProps) {
  const workflowId = useGraphSlice((s) => s.workflowId) ?? undefined;
  const nodeId = useConfigSlice((s) => s.activeNodeId) ?? undefined;
  const { sources, latestValuesBySource } = useActiveNodeUpstreamVariables();

  const { state: columnsState, refetch } = useOptionsSource({
    source: field.optionsSource ?? null,
    ...(deps !== undefined && { deps }),
    ...(workflowId !== undefined && { workflowId }),
    ...(nodeId !== undefined && { nodeId }),
  });

  const columns: readonly DetectedColumn[] = React.useMemo(
    () =>
      columnsState.status === "ready"
        ? columnsState.items.map((item) => ({
            // Identity is the raw header the handler matches; the label is
            // only what the user reads.
            value: item.value,
            label: item.label,
            hint: item.description,
          }))
        : [],
    [columnsState],
  );

  const columnsLoading =
    columnsState.status === "loading" || columnsState.status === "idle";
  const columnsFailed =
    columnsState.status === "error" ||
    columnsState.status === "disconnected" ||
    columnsState.status === "needs-reconnect" ||
    columnsState.status === "owner-gated" ||
    columnsState.status === "owner-must-connect";

  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      data-testid={`spreadsheet-rows-${field.name}`}
    >
      {columnsLoading ? (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Reading your worksheet&rsquo;s columns…
        </p>
      ) : null}

      {columnsFailed ? (
        <div
          role="alert"
          data-testid={`spreadsheet-rows-${field.name}-columns-error`}
          className="flex min-w-0 flex-col gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
          <span className="min-w-0 break-words">
            {"message" in columnsState && columnsState.message
              ? columnsState.message
              : "Couldn't read the worksheet's columns."}
          </span>
          {columnsState.status === "error" ? (
            <span>
              <Button type="button" variant="outline" size="sm" onClick={refetch}>
                Try again
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}

      {columnsLoading ? null : (
        <SpreadsheetUpdateEditor
          fieldName={field.name}
          columns={columns}
          value={value}
          onChange={onChange}
          columnsUnavailable={columnsFailed}
          disabled={disabled}
          sources={sources}
          latestValuesBySource={latestValuesBySource}
        />
      )}
    </div>
  );
}

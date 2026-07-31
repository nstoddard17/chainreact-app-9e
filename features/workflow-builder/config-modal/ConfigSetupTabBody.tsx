"use client";

import type { FieldMeta } from "@/contracts/actionMeta";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { SchemaForm } from "./SchemaForm";
import { NodeConfigOverview } from "./NodeConfigOverview";
import { NodeConfigReadinessBanner } from "./NodeConfigReadinessBanner";
import type { ConfigReadiness } from "./readiness/computeConfigReadiness";
import { GuidedConfigLayout } from "./guided/GuidedConfigLayout";
import { getGuidedSpreadsheetAdapter } from "./guided/guidedSpreadsheetAdapters";

/**
 * The Setup tab's body, extracted verbatim from `ConfigModalShell`
 * (SHEETS-GUIDED-CONFIG-1). The shell was already past the file-size
 * cap, so the guided branch is added HERE rather than deepening it.
 *
 * The branch is the whole integration: an action with a registered
 * guided adapter draws `GuidedConfigLayout`; every other action draws
 * exactly the `SchemaForm section="setup"` it drew before. Both paths
 * receive the SAME `values` / `errors` / `onChange` draft and the same
 * field list, so:
 *
 *   - a guided node's configuration is ordinary configuration, readable
 *     by the generic form and by the React Agent's field controls;
 *   - removing an adapter registration restores the generic experience
 *     with no data change — the documented rollback;
 *   - readiness, the node-name input, the overview, the Advanced tab and
 *     the save/discard footer are untouched by either path.
 */

export interface ConfigSetupTabBodyProps {
  readonly readiness: ConfigReadiness | null;
  readonly metaKey: string | undefined;
  readonly displayName: string | undefined;
  readonly fields: readonly FieldMeta[] | undefined;
  readonly values: Readonly<Record<string, unknown>>;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly onChangeField: (name: string, value: unknown) => void;
  readonly nodeId: string;
  readonly nodeKind: "trigger" | "action";
  readonly nodeProvider: string;
  readonly nodeType: string | undefined;
  readonly nodeDisplayName: string | null | undefined;
  readonly onRename: (nodeId: string, next: string) => void;
  readonly isLoadingMeta: boolean;
  readonly metaError: string | null;
  readonly missingMetaLabel: string;
  readonly highlightFieldName?: string | undefined;
}

export function ConfigSetupTabBody({
  readiness,
  metaKey,
  displayName,
  fields,
  values,
  errors,
  onChangeField,
  nodeId,
  nodeKind,
  nodeProvider,
  nodeType,
  nodeDisplayName,
  onRename,
  isLoadingMeta,
  metaError,
  missingMetaLabel,
  highlightFieldName,
}: ConfigSetupTabBodyProps) {
  const guidedAdapter = getGuidedSpreadsheetAdapter(metaKey);

  return (
    <section aria-label="Setup fields" className="flex flex-col gap-3">
      {readiness ? <NodeConfigReadinessBanner readiness={readiness} /> : null}
      {/* CONFIG-UX-NODE-SUMMARY-1 — what this step will do on every run,
          in plain language with recognizable resource names. Read-only;
          renders nothing until something is configured. */}
      {fields && displayName ? (
        <NodeConfigOverview
          displayName={displayName}
          fields={fields}
          values={values}
        />
      ) : null}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="node-name-input"
          className="text-xs font-medium text-muted-foreground"
        >
          Node name
        </label>
        {/*
          Uncontrolled + keyed by node id: the browser owns the live value
          (so multi-word names with spaces type smoothly), while each keystroke
          writes through `renameNode`, which trims for storage and clears to
          the metadata default when blank. Remounts when the active node
          changes. This is a USER-only label — never identity.
        */}
        <input
          key={nodeId}
          id="node-name-input"
          data-testid="node-name-input"
          type="text"
          maxLength={120}
          defaultValue={nodeDisplayName ?? ""}
          placeholder={getNodeDisplayName(
            { kind: nodeKind, provider: nodeProvider, type: nodeType ?? "" },
            displayName ? { displayName } : null,
          )}
          onChange={(e) => onRename(nodeId, e.target.value)}
          className="rounded border border-input bg-background px-2 py-1 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          A friendly name shown on the canvas. Leave blank to use the default.
        </p>
      </div>
      {isLoadingMeta ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : metaError ? (
        <p role="alert" className="text-xs text-destructive">
          {metaError}
        </p>
      ) : !fields ? (
        <p role="alert" className="text-xs text-destructive">
          No metadata for {missingMetaLabel}{" "}
          <code>
            {nodeProvider}:{nodeType}
          </code>
          . The node may have been added before its metadata shipped.
        </p>
      ) : guidedAdapter ? (
        <GuidedConfigLayout
          adapter={guidedAdapter}
          fields={fields}
          values={values}
          errors={errors}
          onChange={onChangeField}
          {...(highlightFieldName ? { highlightFieldName } : {})}
        />
      ) : (
        <SchemaForm
          fields={fields}
          values={values}
          errors={errors}
          onChange={onChangeField}
          section="setup"
          {...(highlightFieldName ? { highlightFieldName } : {})}
        />
      )}
    </section>
  );
}

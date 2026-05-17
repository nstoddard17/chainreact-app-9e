"use client";

import { useMemo } from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { Button } from "@/components/ui/button";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import {
  findNativeActionByKey,
  useNativeActions,
} from "../hooks/useNativeActions";
import {
  findNativeTriggerByKey,
  useNativeTriggers,
} from "../hooks/useNativeTriggers";
import { SchemaForm } from "./SchemaForm";

/**
 * Config rail / modal shell for the currently-active node.
 *
 * Slice 3.2 scope:
 *   - Hosts SchemaForm for native action nodes. Provider-action nodes
 *     show a "coming in a later slice" placeholder.
 *   - Save writes the draft config back into graphSlice via
 *     `updateNodeConfig`, then marks the configSlice draft saved
 *     (keeping the rail open at the same node so authors can verify).
 *   - Cancel discards the draft (resetNode) and closes the rail.
 *
 * Slice 3.3 scope:
 *   - Extends meta lookup to native trigger nodes (manual, scheduled).
 *     Triggers reuse the exact same SchemaForm path — TriggerMeta and
 *     ActionMeta both expose `FieldMeta[]` and `displayName` /
 *     `description`, so a small shared shape lets the rest of the
 *     shell stay identical.
 *   - Provider trigger nodes get the same "coming in a later slice"
 *     placeholder as provider actions (deferred to Slice 3.4).
 *
 * Tabs (Setup / Advanced / Results / Data Inspector) are deferred —
 * Slice 3.2 ships Setup only. The shell layout reserves header room so
 * the tab strip slots in cleanly when Slice 3.7 / 3.8 fill the other
 * tabs.
 */

const ROUTER_KEY = "native:router";

/**
 * Common subset of ActionMeta + TriggerMeta needed by the rail. Avoids
 * having to thread the union type into every consumer below.
 */
interface ConfigurableMeta {
  key: string;
  displayName: string;
  description: string;
  fields: readonly FieldMeta[];
}

export function ConfigModalShell() {
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const drafts = useConfigSlice((s) => s.drafts);
  const updateField = useConfigSlice((s) => s.updateField);
  const resetNode = useConfigSlice((s) => s.resetNode);
  const markSaved = useConfigSlice((s) => s.markSaved);
  const closeNode = useConfigSlice((s) => s.closeNode);

  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const updateNodeConfig = useGraphSlice((s) => s.updateNodeConfig);

  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();

  const activeNode = useMemo(
    () => (activeNodeId ? pendingNodes.find((n) => n.id === activeNodeId) : undefined),
    [pendingNodes, activeNodeId],
  );

  const activeMeta: ConfigurableMeta | undefined = useMemo(() => {
    if (!activeNode) return undefined;
    if (activeNode.provider !== "native" || !activeNode.type) return undefined;
    const key = `${activeNode.provider}:${activeNode.type}`;
    if (activeNode.kind === "trigger") {
      return findNativeTriggerByKey(nativeTriggers.triggers, key);
    }
    return findNativeActionByKey(nativeActions.actions, key);
  }, [activeNode, nativeActions.actions, nativeTriggers.triggers]);

  // No active node → shell is hidden.
  if (!activeNodeId || !activeNode) return null;

  const draft = drafts[activeNodeId];
  const isDirty = draft?.isDirty ?? false;
  const values = draft?.values ?? activeNode.config;
  const errors = draft?.errors ?? {};

  function handleSave(): void {
    if (!draft) return;
    updateNodeConfig(activeNodeId!, draft.values as Record<string, unknown>);
    markSaved();
  }

  function handleCancel(): void {
    resetNode();
    closeNode();
  }

  const isNative = activeNode.provider === "native";
  // Pick the loading / error signal that matches the active node's kind
  // so a slow / failed actions fetch never blocks the trigger rail (and
  // vice versa).
  const sourceState =
    activeNode.kind === "trigger" ? nativeTriggers : nativeActions;
  const isLoadingMeta = isNative && sourceState.loading;
  const metaError = isNative ? sourceState.error : null;
  const isRouter = activeMeta?.key === ROUTER_KEY;
  const missingMetaLabel =
    activeNode.kind === "trigger" ? "trigger" : "action";
  const providerPlaceholder =
    activeNode.kind === "trigger"
      ? "Provider-trigger configuration arrives in Slice 3.4. For now, only native triggers can be configured through this rail."
      : "Provider-action configuration arrives in Slice 3.4. For now, only native actions can be configured through this rail.";

  return (
    <aside
      aria-label="Node configuration"
      className="flex w-full flex-col gap-4 rounded border border-input bg-card p-4 shadow-sm md:max-w-sm"
      data-config-modal=""
    >
      <header className="flex items-start justify-between gap-3 border-b pb-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {activeNode.kind} · {activeNode.provider}
          </span>
          <h2 className="text-base font-semibold leading-tight truncate">
            {activeMeta?.displayName ?? activeNode.type ?? "Unconfigured"}
          </h2>
          {activeMeta?.description ? (
            <p className="text-xs text-muted-foreground">
              {activeMeta.description}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          aria-label="Close configuration"
        >
          ×
        </Button>
      </header>

      <nav aria-label="Configuration sections" className="flex gap-1 border-b">
        <span
          className="border-b-2 border-primary px-3 py-1.5 text-xs font-medium"
          aria-current="page"
        >
          Setup
        </span>
        <span className="px-3 py-1.5 text-xs text-muted-foreground" title="Coming soon">
          Advanced
        </span>
        <span className="px-3 py-1.5 text-xs text-muted-foreground" title="Coming soon">
          Results
        </span>
        <span className="px-3 py-1.5 text-xs text-muted-foreground" title="Coming soon">
          Data Inspector
        </span>
      </nav>

      <section aria-label="Setup fields" className="flex flex-col gap-3">
        {isLoadingMeta ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : metaError ? (
          <p role="alert" className="text-xs text-destructive">
            {metaError}
          </p>
        ) : !isNative ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            {providerPlaceholder}
          </p>
        ) : !activeMeta ? (
          <p role="alert" className="text-xs text-destructive">
            No metadata for {missingMetaLabel}{" "}
            <code>
              {activeNode.provider}:{activeNode.type}
            </code>
            . The node may have been added before its metadata shipped.
          </p>
        ) : (
          <>
            {isRouter ? (
              <div
                role="status"
                className="rounded border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground"
              >
                Router routes need a dedicated editor (with per-route
                operator + value fields) that lands in Slice 3.6. The
                placeholder below renders the routes field as a generic
                key/value list — its saved shape will NOT match the
                runtime router schema. Use{" "}
                <code className="font-mono">defaultRoute</code> to wire a
                fall-through label that has its own outgoing edge.
              </div>
            ) : null}
            <SchemaForm
              fields={activeMeta.fields}
              values={values}
              errors={errors}
              onChange={(name, value) => updateField({ name, value })}
            />
          </>
        )}
      </section>

      <footer className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {isDirty ? "Unsaved changes" : "No changes"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || !activeMeta}
          >
            Save
          </Button>
        </div>
      </footer>
    </aside>
  );
}

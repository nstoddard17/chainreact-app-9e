"use client";

import { useMemo } from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { Button } from "@/components/ui/button";
import { CredentialOwnershipBadge } from "./CredentialOwnershipBadge";
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
import {
  findProviderActionByKey,
  useProviderActions,
} from "../hooks/useProviderActions";
import {
  findProviderTriggerByKey,
  useProviderTriggers,
} from "../hooks/useProviderTriggers";
import { SchemaForm } from "./SchemaForm";
import { validateRoutesValue } from "./fields/_routesValidator";

/**
 * Config rail / modal shell for the currently-active node.
 *
 * Slice 3.2 — native action nodes.
 * Slice 3.3 — native trigger nodes.
 * Slice 3.4 — provider action nodes via `useProviderActions(provider)`.
 * Slice 3.10 — provider trigger nodes via `useProviderTriggers(provider)`.
 *
 * Lookup branches by `(kind, provider)`:
 *   - action + native  → `useNativeActions` (cached cross-session)
 *   - trigger + native → `useNativeTriggers` (cached cross-session)
 *   - action + other   → `useProviderActions(provider)` (per-provider cache)
 *   - trigger + other  → `useProviderTriggers(provider)` (per-provider cache)
 *
 * The active source's loading / error signal drives the rail's
 * loading / error UI so a slow / failed fetch in one source never
 * blocks an unrelated node's rail.
 *
 * Save / cancel semantics are unchanged from Slice 3.2:
 *   - Save writes the draft into graphSlice via `updateNodeConfig`,
 *     then marks the configSlice draft saved (rail stays open).
 *   - Cancel discards the draft (resetNode) and closes the rail.
 *   - Modal Save does NOT call the workflow API — that's still the
 *     toolbar Save path's job. The boundary set in Slice 3.2 / 3.3
 *     stays intact through Slice 3.4.
 */

const ROUTER_KEY = "native:router";
const NATIVE_PROVIDER = "native";

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
  const renameNode = useGraphSlice((s) => s.renameNode);

  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();

  const activeNode = useMemo(
    () => (activeNodeId ? pendingNodes.find((n) => n.id === activeNodeId) : undefined),
    [pendingNodes, activeNodeId],
  );

  // Provider-action source: only loads when the active node is a non-
  // native action with a type. `null` means "no provider-action lookup
  // needed right now" — the hook short-circuits to an idle state, no
  // fetch is made, no cache entry created.
  const providerActionSourceProvider: string | null = useMemo(() => {
    if (!activeNode) return null;
    if (activeNode.kind !== "action") return null;
    if (activeNode.provider === NATIVE_PROVIDER) return null;
    if (!activeNode.type) return null;
    return activeNode.provider;
  }, [activeNode]);
  const providerActions = useProviderActions(providerActionSourceProvider);

  // Slice 3.10 — provider-trigger source mirrors providerActions. Only
  // loads when the active node is a non-native trigger with a type. A
  // trigger node added through the legacy bare-add path (no `type`)
  // short-circuits to null — the modal's "unknown meta" branch then
  // surfaces the missing-meta error.
  const providerTriggerSourceProvider: string | null = useMemo(() => {
    if (!activeNode) return null;
    if (activeNode.kind !== "trigger") return null;
    if (activeNode.provider === NATIVE_PROVIDER) return null;
    if (!activeNode.type) return null;
    return activeNode.provider;
  }, [activeNode]);
  const providerTriggers = useProviderTriggers(providerTriggerSourceProvider);

  const activeMeta: ConfigurableMeta | undefined = useMemo(() => {
    if (!activeNode || !activeNode.type) return undefined;
    const key = `${activeNode.provider}:${activeNode.type}`;
    if (activeNode.provider === NATIVE_PROVIDER) {
      return activeNode.kind === "trigger"
        ? findNativeTriggerByKey(nativeTriggers.triggers, key)
        : findNativeActionByKey(nativeActions.actions, key);
    }
    if (activeNode.kind === "action") {
      return findProviderActionByKey(providerActions.actions, key);
    }
    // Slice 3.10 — provider trigger lookup.
    return findProviderTriggerByKey(providerTriggers.triggers, key);
  }, [
    activeNode,
    nativeActions.actions,
    nativeTriggers.triggers,
    providerActions.actions,
    providerTriggers.triggers,
  ]);

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

  const isNative = activeNode.provider === NATIVE_PROVIDER;
  const isProviderAction =
    !isNative && activeNode.kind === "action";
  const isProviderTrigger =
    !isNative && activeNode.kind === "trigger";

  // Pick the loading / error signal that matches the active node's
  // lookup branch so a slow / failed fetch in one source never blocks
  // an unrelated node's rail.
  const sourceState: { loading: boolean; error: string | null } = (() => {
    if (isNative) {
      return activeNode.kind === "trigger" ? nativeTriggers : nativeActions;
    }
    if (isProviderAction) return providerActions;
    if (isProviderTrigger) return providerTriggers;
    return { loading: false, error: null };
  })();
  const isLoadingMeta = sourceState.loading;
  const metaError = sourceState.error;
  const missingMetaLabel =
    activeNode.kind === "trigger" ? "trigger" : "action";

  // Slice 3.6 — modal Save must not commit a malformed router-routes
  // value into graphSlice. The runtime schema isn't checked at save
  // time (config is opaque until handler dispatch), so the client-side
  // routes validator is the only pre-run guard.
  //
  // Field-level Save gating uses the same pattern Slice 3.2's Save
  // already does: a single boolean computed at render time. When more
  // field types need pre-save validation later, this becomes a
  // per-field-type validator map called against the draft values.
  const hasBlockingValidationError =
    activeMeta?.key === ROUTER_KEY
      ? validateRoutesValue(
          (values as Record<string, unknown>)["routes"],
        ).error !== null
      : false;

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
          {/* TW-3b: credential-ownership badge for Team workflows (renders null
              for personal accounts / non-team builds). */}
          <CredentialOwnershipBadge provider={activeNode.provider} />
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
            key={activeNodeId}
            id="node-name-input"
            data-testid="node-name-input"
            type="text"
            maxLength={120}
            defaultValue={activeNode.displayName ?? ""}
            placeholder={getNodeDisplayName(
              {
                kind: activeNode.kind,
                provider: activeNode.provider,
                type: activeNode.type,
              },
              activeMeta ? { displayName: activeMeta.displayName } : null,
            )}
            onChange={(e) => renameNode(activeNodeId, e.target.value)}
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
        ) : !activeMeta ? (
          <p role="alert" className="text-xs text-destructive">
            No metadata for {missingMetaLabel}{" "}
            <code>
              {activeNode.provider}:{activeNode.type}
            </code>
            . The node may have been added before its metadata shipped.
          </p>
        ) : (
          <SchemaForm
            fields={activeMeta.fields}
            values={values}
            errors={errors}
            onChange={(name, value) => updateField({ name, value })}
          />
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
            disabled={!isDirty || !activeMeta || hasBlockingValidationError}
          >
            Save
          </Button>
        </div>
      </footer>
    </aside>
  );
}

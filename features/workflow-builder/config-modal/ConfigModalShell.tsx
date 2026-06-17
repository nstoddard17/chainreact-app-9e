"use client";

import { useMemo, useState } from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { Button } from "@/components/ui/button";
import { NodeCredentialOwnerSection } from "./NodeCredentialOwnerSection";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import { commitNodeConfigDraft } from "../state/commitConfigDraft";
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
import {
  ConfigNodeTabBar,
  ConfigTabEmptyState,
  type ConfigNodeTab,
} from "./ConfigNodeTabs";
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
  const closeNode = useConfigSlice((s) => s.closeNode);
  // Slice 4.AI-REPAIR-2F — field to visually highlight (set by a "Go to field"
  // reveal). Passed through to SchemaForm; display/navigation only.
  const focusFieldKey = useConfigSlice((s) => s.focusFieldKey);

  // C — confirm-before-discard state for the close (`×` / Cancel) affordances.
  const [pendingClose, setPendingClose] = useState(false);

  // Slice 4.BUILDER-CONFIG-TABS-1 — the single selected-node tab model. Setup is
  // the default (the real config form); Test / Data show honest empty states
  // until their systems land. Advanced is omitted entirely until a node actually
  // has advanced options (no dead tab) — see `visibleTabs` below.
  const [activeTab, setActiveTab] = useState<ConfigNodeTab>("setup");

  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const renameNode = useGraphSlice((s) => s.renameNode);
  // CS-4b: the open workflow's id, for the per-node credential-owner section.
  const workflowId = useGraphSlice((s) => s.workflowId);

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
    // Shared local-commit path (also used by CS-10 chat-fill direct-fill): writes the
    // draft into the canvas-pending node + marks the draft saved. LOCAL only — the
    // workflow stays dirty until the toolbar Save persists it.
    commitNodeConfigDraft(activeNodeId!);
  }

  function handleCancel(): void {
    resetNode();
    closeNode();
  }

  // C (unsaved-edit footgun) — `×` / Cancel discard the in-progress draft via
  // resetNode. Without this guard, a user who filled fields (e.g. Method / URL)
  // and closed the panel silently loses those edits and never realizes the
  // node was never configured. When the draft is dirty, intercept the close
  // and ask first; a clean draft closes immediately.
  function requestClose(): void {
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    handleCancel();
  }

  function confirmDiscard(): void {
    setPendingClose(false);
    handleCancel();
  }

  function keepEditing(): void {
    setPendingClose(false);
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

  // BUILDER-CONFIG-TABS-1 — Advanced is shown ONLY when the node actually has
  // advanced options. There is no advanced-field concept in the metadata yet, so
  // it is omitted (never a dead tab); add it here once such options exist.
  const hasAdvancedOptions = false;
  const visibleTabs: ConfigNodeTab[] = hasAdvancedOptions
    ? ["setup", "test", "data", "advanced"]
    : ["setup", "test", "data"];
  // Guard: never strand the panel on a tab that isn't visible.
  const currentTab: ConfigNodeTab = visibleTabs.includes(activeTab) ? activeTab : "setup";

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
          {/* TW-3b + CS-4b: credential-ownership badge + per-node reassignment
              affordance for Team workflows (renders null badge for personal
              accounts / non-team builds). */}
          <NodeCredentialOwnerSection
            workflowId={workflowId}
            nodeId={activeNode.id}
            provider={activeNode.provider}
          />
        </div>
        {/*
          Slice 4.BUILDER-DATA-MAP-MVP-1 — the duplicate inner close (×) was
          removed. The single panel close lives in the drawer header
          (BuilderRightDrawer, "Close drawer"). The unsaved-edit discard guard
          this × used to trigger (requestClose) is still reachable via the
          footer Cancel button below, so no behavior is lost.
        */}
      </header>

      <ConfigNodeTabBar tabs={visibleTabs} activeTab={currentTab} onSelect={setActiveTab} />

      {currentTab === "test" ? (
        <ConfigTabEmptyState tab="test" />
      ) : currentTab === "data" ? (
        <ConfigTabEmptyState tab="data" />
      ) : (
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
            {...(focusFieldKey ? { highlightFieldName: focusFieldKey } : {})}
          />
        )}
      </section>
      )}

      {pendingClose ? (
        <div
          role="alertdialog"
          aria-label="Discard unsaved changes"
          data-testid="config-modal-discard-confirm"
          className="flex flex-col gap-2 rounded border border-input bg-muted/40 p-3"
        >
          <p className="text-sm font-medium">
            Discard unsaved changes to this node?
          </p>
          <p className="text-xs text-muted-foreground">
            Your edits haven&rsquo;t been added to the workflow yet. Use Save to
            keep them, or discard to lose them.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={keepEditing}
              data-testid="config-modal-discard-keep"
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDiscard}
              data-testid="config-modal-discard-confirm-button"
            >
              Discard changes
            </Button>
          </div>
        </div>
      ) : (
        <footer className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {isDirty ? "Unsaved changes" : "No changes"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || !activeMeta || hasBlockingValidationError}
              data-testid="config-modal-save-button"
            >
              Save
            </Button>
          </div>
        </footer>
      )}
    </aside>
  );
}

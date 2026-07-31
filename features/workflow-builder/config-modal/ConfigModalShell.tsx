"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { collectSchemaFieldsBlockingError } from "./fields/_schemaFieldsBlocking";
import {
  AI_PROVIDER_ID,
  isConnectionlessProvider,
} from "@/core/integrations/connectionlessProviders";
import { findAiActionByKey, useAiActions } from "../hooks/useAiActions";
import { collectJsonFieldBlockingError } from "./fields/_jsonFieldValue";
import { ConfigSetupTabBody } from "./ConfigSetupTabBody";
import { computeConfigReadiness } from "./readiness/computeConfigReadiness";
import { connectionInputForProvider } from "./readiness/connectionInput";
import { useConnectionReadiness } from "../hooks/useConnectionReadiness";
import type { WorkflowDefinition } from "@/contracts/workflow";

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

/**
 * Common subset of ActionMeta + TriggerMeta needed by the rail. Avoids
 * having to thread the union type into every consumer below.
 */
interface ConfigurableMeta {
  key: string;
  displayName: string;
  description: string;
  fields: readonly FieldMeta[];
  /**
   * CONNECTION-AWARE-READINESS-1 — separates provider-backed nodes (true:
   * readiness includes the app-connection check) from native/logic nodes
   * (false: field-only readiness, no connection fetch). Carried by both
   * ActionMeta and TriggerMeta.
   */
  requiresIntegration: boolean;
}

export function ConfigModalShell() {
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const drafts = useConfigSlice((s) => s.drafts);
  const updateField = useConfigSlice((s) => s.updateField);
  const resetNode = useConfigSlice((s) => s.resetNode);
  const closeNode = useConfigSlice((s) => s.closeNode);
  // Slice 4.AI-REPAIR-2F — field to visually highlight (set by a "Go to field"
  // reveal). Passed through to SchemaForm; display/navigation only.
  // DOC-CONFIG-SYNC-1 — also set by the Document's inline Guided Stop, so the
  // panel and the sentence show the same field at the same time. Scoped by node:
  // the highlight only paints when it was requested for the node this panel is
  // showing, so a `property` field on step 2 is never ringed because step 5's
  // `property` was opened. `null` node = legacy unscoped caller.
  const focusFieldKey = useConfigSlice((s) => s.focusFieldKey);
  const focusFieldNodeId = useConfigSlice((s) => s.focusFieldNodeId);

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

  // AI catalog loads only when the selected node is an AI node (mirrors the
  // provider-catalog hooks' null short-circuit — no fetch otherwise).
  const aiActions = useAiActions(activeNode?.provider === AI_PROVIDER_ID);

  // Provider-action source: only loads when the active node is a non-
  // native action with a type. `null` means "no provider-action lookup
  // needed right now" — the hook short-circuits to an idle state, no
  // fetch is made, no cache entry created.
  const providerActionSourceProvider: string | null = useMemo(() => {
    if (!activeNode) return null;
    if (activeNode.kind !== "action") return null;
    if (isConnectionlessProvider(activeNode.provider)) return null;
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
    if (isConnectionlessProvider(activeNode.provider)) return null;
    if (!activeNode.type) return null;
    return activeNode.provider;
  }, [activeNode]);
  const providerTriggers = useProviderTriggers(providerTriggerSourceProvider);

  const activeMeta: ConfigurableMeta | undefined = useMemo(() => {
    if (!activeNode || !activeNode.type) return undefined;
    const key = `${activeNode.provider}:${activeNode.type}`;
    if (activeNode.provider === AI_PROVIDER_ID) {
      return activeNode.kind === "action"
        ? findAiActionByKey(aiActions.actions, key)
        : undefined;
    }
    if (isConnectionlessProvider(activeNode.provider)) {
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

  // DOC-CONFIG-SYNC-1 — the field this panel should reveal + ring, resolved
  // against the CANONICAL identity (node id + FieldMeta.name). A highlight
  // requested for another node is ignored outright.
  const highlightFieldName: string | null =
    focusFieldKey !== null &&
    (focusFieldNodeId === null || focusFieldNodeId === activeNodeId)
      ? focusFieldKey
      : null;
  const highlightedField = useMemo(
    () =>
      highlightFieldName !== null && activeMeta
        ? activeMeta.fields.find((f) => f.name === highlightFieldName)
        : undefined,
    [highlightFieldName, activeMeta],
  );

  // DOC-CONFIG-SYNC-1 — a highlighted field that lives on another tab would be
  // "revealed" into a section the user can't see, so follow it. Keyed on the
  // (node, field) identity via a ref so this fires exactly once per new target:
  // a user who then switches tabs manually is never yanked back, and a re-render
  // is not a reason to move the panel (§"If the field is already visible, do not
  // unnecessarily move the panel").
  const followedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (highlightFieldName === null || activeNodeId === null) {
      followedFocusRef.current = null;
      return;
    }
    if (highlightedField === undefined) return; // metadata not loaded yet
    const identity = `${activeNodeId}::${highlightFieldName}`;
    if (followedFocusRef.current === identity) return;
    followedFocusRef.current = identity;
    setActiveTab(highlightedField.advanced === true ? "advanced" : "setup");
  }, [highlightFieldName, highlightedField, activeNodeId]);

  // CONNECTION-AWARE-READINESS-1 — server-resolved app-connection signal
  // for the pending graph (same hook + route the React Agent readiness
  // panel uses: account-scoped, credential-provenance-aware, 404 no-leak).
  // Only fetched for provider-backed nodes; native/logic nodes and
  // workflows without an id (local-only) skip the round-trip entirely.
  // Refetches only when the graph's provider usage changes, not per edit.
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const connectionDefinition = useMemo<WorkflowDefinition | null>(
    () => ({ nodes: [...pendingNodes], edges: [...pendingEdges] }),
    [pendingNodes, pendingEdges],
  );
  const nodeRequiresConnection =
    activeNode !== undefined &&
    !isConnectionlessProvider(activeNode.provider) &&
    activeMeta?.requiresIntegration === true;
  // Without a workflow id there is no account to resolve against — the
  // hook stays disabled and the mapper renders an honest "unknown"
  // (never "Ready to run") instead of skipping the requirement.
  const connectionCheckEnabled = nodeRequiresConnection && Boolean(workflowId);
  const { signal: connectionSignal } = useConnectionReadiness({
    workflowId: workflowId ?? "",
    definition: connectionCheckEnabled ? connectionDefinition : null,
    enabled: connectionCheckEnabled,
  });

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

  const isNative = isConnectionlessProvider(activeNode.provider);
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
  // CONFIG-UX-AUDIT-2 extends the same pattern to `json` fields (the
  // advanced developer escape hatch): invalid / shape-mismatched JSON
  // text lives in the draft as a raw string, JsonField shows the
  // friendly error inline, and Save stays blocked until it parses to
  // the schema-expected shape (or is a whole-value {{...}} variable, or
  // is cleared). Copy is product language only.
  const routerBlockingError =
    activeMeta?.key === ROUTER_KEY
      ? validateRoutesValue(
          (values as Record<string, unknown>)["routes"],
        ).error !== null
      : false;
  const jsonBlockingError = activeMeta
    ? collectJsonFieldBlockingError(activeMeta.fields, values)
    : null;
  // AI-PROVIDER-4 — a `schema-fields` editor with duplicate / unnamed /
  // invalid rows blocks Save the same way invalid router routes and
  // unparseable JSON do. Same shared validator the drawer uses.
  const schemaFieldsBlockingError = activeMeta
    ? collectSchemaFieldsBlockingError(activeMeta.fields, values)
    : null;
  const hasBlockingValidationError =
    routerBlockingError ||
    jsonBlockingError !== null ||
    schemaFieldsBlockingError !== null;

  // SPREADSHEET-CONFIG-REDESIGN-1 — readiness banner shown at the top of
  // the Setup tab for EVERY node. Pure derivation from the metadata's
  // required flags (+ optional per-action checklist adapters) and the
  // already-computed Save blockers — no new validation rules in the UI.
  // "Ready" describes config completeness; the footer keeps owning the
  // dirty/saved state.
  //
  // CONNECTION-AWARE-READINESS-1 — provider-backed nodes also fold in the
  // server-resolved app-connection state. Saving a draft stays possible
  // either way; the banner just never claims "Ready to run" while the
  // required connection is missing, unusable, or not yet verified.
  const readiness = activeMeta
    ? computeConfigReadiness({
        metaKey: activeMeta.key,
        nodeKind: activeNode.kind === "trigger" ? "trigger" : "action",
        fields: activeMeta.fields,
        values: values as Readonly<Record<string, unknown>>,
        errors,
        blockedFieldCount:
          (routerBlockingError ? 1 : 0) + (jsonBlockingError ? 1 : 0),
        connection: connectionInputForProvider({
          requiresConnection: nodeRequiresConnection,
          provider: activeNode.provider,
          signal: connectionSignal,
        }),
      })
    : null;

  // CONFIG-UX-SETUP-ADVANCED-1 — Advanced is shown ONLY when the node's
  // metadata actually declares advanced fields (`advanced: true`, excluding
  // composite-managed siblings) — never a dead tab. Both tabs render over
  // the SAME pending draft (values/errors/updateField), so switching tabs
  // never discards unsaved edits, and a Setup edit can never erase an
  // unrelated Advanced value (per-field writes only).
  const advancedFields = (activeMeta?.fields ?? []).filter(
    (f) =>
      f.advanced === true &&
      !(f.renderedBy !== undefined &&
        activeMeta!.fields.some((s) => s.name === f.renderedBy)),
  );
  const hasAdvancedOptions = advancedFields.length > 0;
  // Count of advanced settings currently holding a custom value — surfaces
  // as a chip on the Advanced tab so non-standard behavior is visible from
  // Setup. Values equal to the field's declared default are standard, not
  // custom.
  const advancedActiveCount = advancedFields.filter((f) => {
    const v = (values as Record<string, unknown>)[f.name];
    if (v === undefined || v === null || v === "") return false;
    if (f.defaultValue === undefined) return true;
    try {
      return JSON.stringify(v) !== JSON.stringify(f.defaultValue);
    } catch {
      return true;
    }
  }).length;
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

      <ConfigNodeTabBar
        tabs={visibleTabs}
        activeTab={currentTab}
        onSelect={setActiveTab}
        advancedActiveCount={advancedActiveCount}
      />

      {/* DOC-CONFIG-SYNC-1 — a11y: the ring is a VISUAL cue, so say in words which
          setting was revealed. The text changes only when the target field
          changes, so a re-render never re-announces, and the label itself stays
          visible in the form below (the highlight is never the only signal).
          Keyboard focus is deliberately NOT moved — the caret stays wherever the
          user is typing, inline editor included. */}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        data-testid="config-focus-announcement"
      >
        {highlightedField
          ? `${highlightedField.label} is highlighted in this step's settings.`
          : ""}
      </p>

      {currentTab === "test" ? (
        <ConfigTabEmptyState tab="test" />
      ) : currentTab === "data" ? (
        <ConfigTabEmptyState tab="data" />
      ) : currentTab === "advanced" && activeMeta ? (
        <section
          aria-label="Advanced settings"
          data-testid="config-advanced-tab"
          className="flex flex-col gap-3"
        >
          <p className="rounded bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            Settings for specialized workflows. Changing these can override or
            alter the behavior chosen in Setup. Use &ldquo;Reset to
            standard&rdquo; to return a setting to its default behavior.
          </p>
          <SchemaForm
            fields={activeMeta.fields}
            values={values}
            errors={errors}
            onChange={(name, value) => updateField({ name, value })}
            section="advanced"
            {...(highlightFieldName ? { highlightFieldName } : {})}
          />
        </section>
      ) : (
        <ConfigSetupTabBody
          readiness={readiness}
          metaKey={activeMeta?.key}
          displayName={activeMeta?.displayName}
          fields={activeMeta?.fields}
          values={values as Readonly<Record<string, unknown>>}
          errors={errors}
          onChangeField={(name, value) => updateField({ name, value })}
          nodeId={activeNodeId}
          nodeKind={activeNode.kind}
          nodeProvider={activeNode.provider}
          nodeType={activeNode.type}
          nodeDisplayName={activeNode.displayName}
          onRename={renameNode}
          isLoadingMeta={isLoadingMeta}
          metaError={metaError}
          missingMetaLabel={missingMetaLabel}
          {...(highlightFieldName ? { highlightFieldName } : {})}
        />
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
            {jsonBlockingError ? (
              <span
                role="status"
                data-testid="config-modal-json-blocking"
                className="text-destructive"
              >
                Fix &ldquo;{jsonBlockingError.fieldLabel}&rdquo; before saving.
              </span>
            ) : isDirty ? (
              "Unsaved changes"
            ) : (
              "No changes"
            )}
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

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowState } from "@/contracts/workflow";
import { useGraphSlice } from "../state/graphSlice";
import { useBuilderShortcuts } from "../hooks/useBuilderShortcuts";
import { LifecycleActions } from "../panels/LifecycleActions";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
} from "../validation/collectBuilderValidationIssues";
import {
  BuilderIconButton,
  ChevronLeftIcon,
  HistoryIcon,
  LayersIcon,
  RedoIcon,
  UndoIcon,
} from "./_BuilderHeaderIcons";
import {
  HeaderValidationPill,
  StatusPill,
  type SaveStatus,
} from "./_BuilderHeaderPills";
import { HeaderRunControls } from "./HeaderRunControls";
import { BuilderTemplatesModal } from "../panels/BuilderTemplatesModal";

interface Props {
  workflowName: string;
  /**
   * The workflow's database id — surfaced as a mono code chip in the
   * header center meta strip (4.BUILDER-DESIGN-PARITY-1). Optional so
   * existing focused tests (BuilderHeader rendered in isolation) keep
   * passing unchanged.
   */
  workflowId?: string;
  leftRail?: {
    isCollapsed: boolean;
    onToggle: () => void;
  };
  validation?: {
    onOpen: () => void;
  };
  lifecycle?: {
    workflowId: string;
    state: WorkflowState;
  };
}

/**
 * Builder header (Slice 4.BUILDER-UI-SHELL-1, extended through
 * 4.BUILDER-LEFT-AGENT-1 / VALIDATION-1, restyled in
 * 4.BUILDER-DESIGN-PARITY-1).
 *
 * Three-region 48px strip mirroring the Anthropic ChainV2 design:
 *
 *   [ left toggle · breadcrumb · name · state · dirty ]  [ center meta ]  [ btngroup · chip · Test · Save · Activate ]
 *
 * Behavior is unchanged from prior slices — same isDirty / isSaving
 * Zustand reads, same Cmd/Ctrl+S shortcut, same validation count
 * derivation, same `LifecycleActions` mount path. Only the visual
 * arrangement and chrome moved.
 *
 * Center meta strip surfaces what V2 actually knows (workflow id);
 * runs-per-24h / success-rate / tasks-per-run cells render as `—`
 * placeholders, marked as deferred in the slice doc. They're rendered
 * (rather than skipped) so the layout reads correctly on wide screens.
 */
export function BuilderHeader({
  workflowName,
  workflowId,
  leftRail,
  validation,
  lifecycle,
}: Props) {
  const isDirty = useGraphSlice((s) => s.isDirty);
  const isSaving = useGraphSlice((s) => s.isSaving);
  const saveError = useGraphSlice((s) => s.saveError);
  const save = useGraphSlice((s) => s.save);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const validationCounts = validation
    ? countBuilderValidationIssues(
        collectBuilderValidationIssues({ pendingNodes, pendingEdges }),
      )
    : null;

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;
    try {
      await save();
      setSavedAt(Date.now());
    } catch {
      // Error already captured into slice.saveError; no extra UI work here.
    }
  }, [isDirty, isSaving, save]);

  useBuilderShortcuts({ onSave: handleSave });

  const status = deriveStatus({ isDirty, isSaving, saveError, savedAt });

  return (
    <>
      <header
        aria-label="Workflow builder header"
        data-testid="builder-header"
        className="grid h-12 shrink-0 items-center gap-3 px-2"
        style={{
          gridTemplateColumns: "1fr auto 1fr",
          background: "var(--builder-panel)",
          borderBottom: "1px solid var(--builder-border)",
        }}
      >
        <HeaderLeft
          workflowName={workflowName}
          leftRail={leftRail}
          status={status}
          saveError={saveError}
        />
        <HeaderCenterMeta workflowId={workflowId} />
        <HeaderRight
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={handleSave}
          workflowId={workflowId}
          onOpenTemplates={() => setTemplatesOpen(true)}
          validation={validation}
          validationCounts={validationCounts}
          lifecycle={lifecycle}
        />
      </header>
      {templatesOpen && workflowId ? (
        <BuilderTemplatesModal
          workflowId={workflowId}
          isDirty={isDirty}
          onClose={() => setTemplatesOpen(false)}
        />
      ) : null}
    </>
  );
}

function HeaderLeft({
  workflowName,
  leftRail,
  status,
  saveError,
}: {
  workflowName: string;
  leftRail?: { isCollapsed: boolean; onToggle: () => void };
  status: SaveStatus;
  saveError: string | null;
}) {
  const router = useRouter();
  // Slice 4.WORKFLOWS-PAGE-1 follow-up — wire the header back arrow to the
  // workflows dashboard. No dirty-state confirmation here: the existing save
  // status pill + Cmd/Ctrl+S shortcut already surface unsaved changes; a
  // future slice can add a confirm-if-dirty step if Marcus wants one.
  const handleBack = useCallback(() => {
    router.push("/workflows");
  }, [router]);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <BuilderIconButton
        ariaLabel="Back to workflows"
        title="Back to workflows"
        onClick={handleBack}
        testId="builder-header-back-button"
      >
        <ChevronLeftIcon />
      </BuilderIconButton>
      {leftRail ? (
        <BuilderIconButton
          ariaLabel={
            leftRail.isCollapsed ? "Expand React Agent" : "Collapse React Agent"
          }
          title={
            leftRail.isCollapsed ? "Show assistant" : "Hide assistant"
          }
          onClick={leftRail.onToggle}
          testId="builder-header-left-rail-toggle"
          dataAttrs={{
            "data-collapsed": leftRail.isCollapsed ? "true" : "false",
            "aria-pressed": String(!leftRail.isCollapsed),
          }}
        >
          <LayersIcon />
        </BuilderIconButton>
      ) : null}
      <div className="ml-1 flex min-w-0 flex-col gap-0.5">
        <div
          className="builder-mono flex items-center gap-1.5 text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          <span>workflow</span>
          <span style={{ color: "var(--builder-muted-2)" }}>/</span>
          <span>draft</span>
          <span style={{ color: "var(--builder-muted-2)" }}>/</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <h2
            className="max-w-[340px] truncate text-[13px] font-semibold"
            title={workflowName}
            style={{ color: "var(--builder-text)" }}
          >
            {workflowName}
          </h2>
          <StatusPill status={status} saveError={saveError} />
        </div>
      </div>
    </div>
  );
}

function HeaderCenterMeta({ workflowId }: { workflowId?: string }) {
  if (!workflowId) return <div />;
  return (
    <div
      data-testid="builder-header-meta-strip"
      className="hidden items-center gap-3.5 rounded-md px-2.5 py-1 lg:flex"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
      }}
    >
      <MetaPair label="ID" value={workflowId} />
      <MetaPair label="runs/24h" value="—" deferred />
      <MetaPair label="success" value="—" deferred />
      <MetaPair label="tasks/run" value="—" deferred />
    </div>
  );
}

function MetaPair({
  label,
  value,
  deferred,
}: {
  label: string;
  value: string;
  deferred?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[10px] uppercase tracking-[0.05em]"
        style={{ color: "var(--builder-muted)" }}
      >
        {label}
      </span>
      <code
        className="builder-mono text-[11.5px]"
        style={{
          color: deferred ? "var(--builder-muted-2)" : "var(--builder-text-2)",
        }}
        title={deferred ? "Coming soon — not surfaced in V2 yet" : value}
      >
        {value}
      </code>
    </div>
  );
}

function HeaderRight({
  isDirty,
  isSaving,
  onSave,
  workflowId,
  onOpenTemplates,
  validation,
  validationCounts,
  lifecycle,
}: {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  workflowId?: string;
  onOpenTemplates: () => void;
  validation?: { onOpen: () => void };
  validationCounts: ReturnType<typeof countBuilderValidationIssues> | null;
  lifecycle?: { workflowId: string; state: WorkflowState };
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div
        className="flex items-center gap-0.5 rounded-md p-0.5"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
        }}
      >
        <BuilderIconButton ariaLabel="Undo" title="Undo (coming soon)" disabled size="sm">
          <UndoIcon />
        </BuilderIconButton>
        <BuilderIconButton ariaLabel="Redo" title="Redo (coming soon)" disabled size="sm">
          <RedoIcon />
        </BuilderIconButton>
        <BuilderIconButton ariaLabel="History" title="Run history (coming soon)" disabled size="sm">
          <HistoryIcon />
        </BuilderIconButton>
      </div>
      {/* In-builder template entry point — opens the create-new / replace-current modal. */}
      {workflowId ? (
        <button
          type="button"
          onClick={onOpenTemplates}
          data-testid="builder-header-templates-button"
          className="inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium"
          style={{
            background: "var(--builder-panel-2)",
            color: "var(--builder-text-2)",
            border: "1px solid var(--builder-border)",
          }}
          title="Browse templates"
        >
          Templates
        </button>
      ) : null}
      {validation && validationCounts ? (
        <HeaderValidationPill
          counts={validationCounts}
          onOpen={validation.onOpen}
        />
      ) : null}
      <HeaderRunControls />
      <button
        type="button"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className="inline-flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[12px] font-medium disabled:opacity-50"
        style={{
          background: "var(--builder-text)",
          color: "var(--builder-panel)",
          border: "1px solid var(--builder-text)",
        }}
        title="Save (⌘S)"
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
      <span
        aria-hidden
        className="mx-0.5 inline-block h-5 w-px"
        style={{ background: "var(--builder-border)" }}
      />
      {lifecycle ? (
        <LifecycleActions
          workflowId={lifecycle.workflowId}
          state={lifecycle.state}
        />
      ) : null}
    </div>
  );
}



function deriveStatus(input: {
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  savedAt: number | null;
}): SaveStatus {
  if (input.isSaving) return "saving";
  if (input.saveError) return "error";
  if (input.isDirty) return "unsaved";
  if (input.savedAt !== null) return "saved";
  return "idle";
}


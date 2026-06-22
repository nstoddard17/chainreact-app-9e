"use client";

import { useMemo } from "react";
import type { WorkflowDetail, WorkflowState } from "@/contracts/workflow";
import { formatTypeKey } from "@/core/workflows/nodeDisplayName";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { getTriggerKind } from "../state/triggerKind";
import {
  CopyIdButton,
  DangerZone,
  DescriptionField,
  formatLocalTime,
  formatUtcTime,
  NameEditor,
  NoteRow,
  SettingsRow,
  SettingsSection,
} from "./settingsParts";

/**
 * Slice 4.BUILDER-SETTINGS-2 — the workflow Settings tab as a workflow-LEVEL
 * control panel (not step config; app credentials live in Apps).
 *
 * Supported, safe actions reuse existing client helpers:
 *   - Name → `updateWorkflow(id, { name })` (PATCH name only; never mutates the
 *     draft graph, never activates / publishes / runs).
 *   - Delete → `deleteWorkflow(id)` (soft-delete → Trash), behind confirmation.
 *
 * Everything else reads from data already in the builder (the `WorkflowDetail`
 * subset threaded from WorkflowBuilder + the live `graphSlice` / `runSlice`).
 * Not-yet-supported settings (description, folder management, retry policy,
 * notifications) are shown HONESTLY — disabled / "not configured" / "managed
 * elsewhere" — never as dead "Coming later" action buttons.
 */

/** The `WorkflowDetail` subset the Settings tab needs. Threaded from WorkflowBuilder. */
export type WorkflowSettingsMeta = Pick<
  WorkflowDetail,
  "name" | "state" | "createdAt" | "updatedAt" | "activeRevisionId" | "unpublishedChanges"
>;

const STATE_LABEL: Record<WorkflowState, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  disabled: "Disabled",
  eligible_to_resume: "Ready to resume",
  deleted: "Deleted",
};

export function SettingsPanel({
  settings,
  providerLabels,
  onNameSaved,
}: {
  settings?: WorkflowSettingsMeta;
  providerLabels?: Readonly<Record<string, string>>;
  /** Called after a successful name save so the parent can sync the header. */
  onNameSaved?: (name: string) => void;
}) {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const isDirty = useGraphSlice((s) => s.isDirty);
  const isSaving = useGraphSlice((s) => s.isSaving);
  const runStatus = useRunSlice((s) => s.status);
  const runDetail = useRunSlice((s) => s.detail);

  const triggerNode = useMemo(
    () => pendingNodes.find((n) => n.kind === "trigger"),
    [pendingNodes],
  );
  const actionCount = useMemo(
    () => pendingNodes.filter((n) => n.kind === "action").length,
    [pendingNodes],
  );

  const triggerLabel = triggerNode
    ? triggerNode.type || formatTypeKey(triggerNode.provider) || triggerNode.provider
    : null;
  const triggerProviderLabel = triggerNode
    ? providerLabels?.[triggerNode.provider] ?? triggerNode.provider
    : null;

  const triggerKind = getTriggerKind(pendingNodes);
  const runExplanation = useMemo(() => {
    if (triggerKind === "manual") {
      return "Runs only when you click Run Manually or Run again.";
    }
    if (triggerKind === "none") {
      return "Add a trigger to define when this workflow runs.";
    }
    if (
      triggerNode?.provider === "native" &&
      typeof triggerNode.type === "string" &&
      triggerNode.type.startsWith("schedule")
    ) {
      const cron =
        typeof triggerNode.config?.cronExpression === "string"
          ? triggerNode.config.cronExpression
          : null;
      return cron
        ? `Runs on a schedule: ${cron} (read-only here).`
        : "Runs on a schedule.";
    }
    return "Runs automatically when its trigger event fires.";
  }, [triggerKind, triggerNode]);

  const published = settings ? settings.activeRevisionId !== null : false;
  const savedLabel = isSaving
    ? "Saving…"
    : isDirty
      ? "You have unsaved changes"
      : "All changes saved";

  const lastRunLabel = runDetail
    ? runDetail.status === "succeeded"
      ? "Succeeded"
      : "Failed"
    : runStatus === "pending"
      ? "Running…"
      : "Not run yet this session";

  return (
    <div
      data-testid="settings-panel"
      className="absolute inset-0 z-10 overflow-y-auto p-5"
    >
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--builder-text)" }}>
            Settings
          </h2>
          <p className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            Workflow-level settings and behavior. App connections live in Apps; a step&rsquo;s
            own fields live in that step&rsquo;s config panel.
          </p>
        </header>

        <SettingsSection title="General">
          <NameEditor
            workflowId={workflowId}
            initialName={settings?.name ?? ""}
            {...(onNameSaved ? { onSaved: onNameSaved } : {})}
          />
          <DescriptionField />
          <SettingsRow label="Folder">
            <span style={{ color: "var(--builder-muted)" }}>
              Manage folders from the{" "}
              {/* Plain hard-nav anchor (not next/link) on purpose: a one-off,
                  non-prefetched jump that doesn't depend on app-router context
                  where the builder canvas may render in isolation. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/workflows"
                data-testid="settings-folder-link"
                style={{ color: "var(--builder-text)", textDecoration: "underline" }}
              >
                workflows list
              </a>
              .
            </span>
          </SettingsRow>
          {workflowId ? (
            <SettingsRow label="Workflow ID">
              <CopyIdButton id={workflowId} />
            </SettingsRow>
          ) : null}
        </SettingsSection>

        <SettingsSection title="Status & publishing">
          <SettingsRow
            label="Status"
            value={settings ? STATE_LABEL[settings.state] : null}
          />
          <SettingsRow
            label="Publish state"
            value={settings ? (published ? "Published" : "Not published yet") : null}
          />
          {settings?.state === "active" && settings.unpublishedChanges ? (
            <SettingsRow
              label="Unpublished changes"
              value="Draft has changes not yet published"
            />
          ) : null}
          <SettingsRow label="Save status" value={savedLabel} />
          <SettingsRow label="Last run" value={lastRunLabel} />
          <SettingsRow label="Created">
            <TimeValue iso={settings?.createdAt} />
          </SettingsRow>
          <SettingsRow label="Last updated">
            <TimeValue iso={settings?.updatedAt} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Run behavior">
          <SettingsRow
            label="Trigger"
            value={
              triggerLabel
                ? triggerProviderLabel && triggerProviderLabel !== triggerLabel
                  ? `${triggerLabel} (${triggerProviderLabel})`
                  : triggerLabel
                : "No trigger yet"
            }
          />
          <SettingsRow
            label="Steps"
            value={`${actionCount} action${actionCount === 1 ? "" : "s"}`}
          />
          <SettingsRow
            label="Graph"
            value={`${pendingNodes.length} node${pendingNodes.length === 1 ? "" : "s"} · ${pendingEdges.length} edge${pendingEdges.length === 1 ? "" : "s"}`}
          />
          <p
            data-testid="settings-run-explanation"
            className="text-[12px]"
            style={{ color: "var(--builder-muted)" }}
          >
            {runExplanation}
          </p>
        </SettingsSection>

        <SettingsSection title="Error handling & notifications">
          <NoteRow
            label="Retry & error handling"
            note="Default: a run stops on the first failed step."
          />
          <NoteRow label="Failure notifications" note="Not configured." />
          <NoteRow
            label="Access & permissions"
            note="Managed by your account membership."
          />
        </SettingsSection>

        <DangerZone workflowId={workflowId} workflowName={settings?.name ?? "this workflow"} />
      </div>
    </div>
  );
}

/** Local readable time with the exact UTC instant as a hover title. */
function TimeValue({ iso }: { iso: string | null | undefined }) {
  const local = formatLocalTime(iso);
  const utc = formatUtcTime(iso);
  if (!local) return <span style={{ color: "var(--builder-muted)" }}>Not available</span>;
  return <span title={utc ?? undefined}>{local}</span>;
}

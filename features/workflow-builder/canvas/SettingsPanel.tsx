"use client";

import { useMemo, type ReactNode } from "react";
import type { WorkflowDetail, WorkflowState } from "@/contracts/workflow";
import { formatTypeKey } from "@/core/workflows/nodeDisplayName";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Slice 4.BUILDER-SETTINGS-MVP-1 — the top-level **Settings** tab.
 *
 * Frontend-only MVP. Replaces the placeholder card with real workflow-LEVEL
 * metadata + behavior, derived entirely from data already available in the
 * builder: the `WorkflowDetail` subset threaded from `WorkflowBuilder`
 * (`settings`) and the live `graphSlice` draft (counts, trigger, save status).
 *
 * Boundaries (asserted by tests):
 *   - This is workflow-LEVEL metadata only. Provider credentials live in Apps /
 *     Connections; node-level fields live in the right config panel. Neither is
 *     shown here.
 *   - Read-only this slice. Name/description editing is deferred — the v2 builder
 *     has no existing safe client name-edit path (`graphSlice.save()` persists
 *     only the draft definition), so wiring a name PATCH here would be net-new
 *     backend interaction that could race the draft save. Deferred edit path:
 *     PATCH `/api/workflows/[id]` `name`, ideally via a shared rename action.
 *   - No dead UI: not-yet-built behavior (description, folder, schedule, retry,
 *     notifications) renders an explicit "Coming later" row, never a blank space.
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
  eligible_to_resume: "Eligible to resume",
  deleted: "Deleted",
};

export function SettingsPanel({
  settings,
  providerLabels,
}: {
  settings?: WorkflowSettingsMeta;
  providerLabels?: Readonly<Record<string, string>>;
}) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const isDirty = useGraphSlice((s) => s.isDirty);
  const isSaving = useGraphSlice((s) => s.isSaving);

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

  const published = settings ? settings.activeRevisionId !== null : false;
  const savedLabel = isSaving
    ? "Saving…"
    : isDirty
      ? "You have unsaved changes"
      : "All changes saved";

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
          <SettingsRow label="Name" value={settings?.name ?? null} />
          <ComingLaterRow
            label="Description"
            note="A short description of what this workflow does — editable here later."
          />
          <ComingLaterRow
            label="Folder"
            note="Organize this workflow into a folder. Manage folders from the workflows list for now."
          />
          <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
            Renaming from Settings is coming soon. For now, the name is shown read-only.
          </p>
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
          <SettingsRow label="Created" value={formatTimestamp(settings?.createdAt)} />
          <SettingsRow label="Last updated" value={formatTimestamp(settings?.updatedAt)} />
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
          <SettingsRow label="Steps" value={`${actionCount} action${actionCount === 1 ? "" : "s"}`} />
          <SettingsRow
            label="Graph"
            value={`${pendingNodes.length} node${pendingNodes.length === 1 ? "" : "s"} · ${pendingEdges.length} edge${pendingEdges.length === 1 ? "" : "s"}`}
          />
          <ComingLaterRow
            label="Schedule & timezone"
            note="Cron schedule and the timezone runs are evaluated in will be configurable here."
          />
        </SettingsSection>

        <SettingsSection title="Error handling & notifications">
          <ComingLaterRow
            label="Retry & error handling"
            note="Choose how a failed run retries and what happens on repeated failure."
          />
          <ComingLaterRow
            label="Failure notifications"
            note="Get notified when a run fails. Channels and recipients will be set here."
          />
          <ComingLaterRow
            label="Access & permissions"
            note="Who can view, run, and edit this workflow — summarized here later."
          />
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      data-testid="settings-section"
      data-section={title}
      className="flex flex-col gap-2 rounded-[8px] p-4"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        boxShadow: "var(--builder-shadow-sm)",
      }}
    >
      <h3
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--builder-muted)" }}
      >
        {title}
      </h3>
      <dl className="flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function SettingsRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt style={{ color: "var(--builder-muted)" }}>{label}</dt>
      <dd className="text-right" style={{ color: "var(--builder-text)" }}>
        {value ?? <span style={{ color: "var(--builder-muted)" }}>Not available</span>}
      </dd>
    </div>
  );
}

function ComingLaterRow({ label, note }: { label: string; note: string }) {
  return (
    <div
      data-testid="settings-coming-later-row"
      className="flex items-baseline justify-between gap-3 text-[12.5px]"
    >
      <dt style={{ color: "var(--builder-muted)" }}>
        {label}
        <span className="block text-[11px]" style={{ color: "var(--builder-muted)" }}>
          {note}
        </span>
      </dt>
      <dd>
        <span
          className="whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[10.5px]"
          style={{
            background: "var(--builder-panel-2)",
            border: "1px solid var(--builder-border)",
            color: "var(--builder-muted)",
          }}
        >
          Coming later
        </span>
      </dd>
    </div>
  );
}

/**
 * Deterministic UTC timestamp formatter ("YYYY-MM-DD HH:MM UTC"). Locale- and
 * timezone-independent so the rendered value is stable across environments and
 * tests. Returns null for missing / unparseable input.
 */
function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const isoStr = d.toISOString();
  return `${isoStr.slice(0, 10)} ${isoStr.slice(11, 16)} UTC`;
}

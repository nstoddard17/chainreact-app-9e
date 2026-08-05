"use client";

import { useCallback, useState, type ReactNode } from "react";
import { updateWorkflow } from "@/lib/api/workflows";
import { deleteWorkflow } from "@/lib/api/trash";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Slice 4.BUILDER-SETTINGS-2 — presentational + stateful pieces for the workflow
 * Settings tab. Workflow-LEVEL controls only (no step config, no app credentials).
 *
 * Supported, safe actions reuse existing client helpers:
 *   - Name edit → `updateWorkflow(id, { name })` (PATCH; never touches the draft
 *     graph, never activates/publishes/runs).
 *   - Delete → `deleteWorkflow(id)` (SOFT-delete → Trash, recoverable), behind an
 *     explicit two-step confirmation.
 *
 * Settings without a real backend are shown honestly as read-only notes
 * ("managed elsewhere" / a factual statement of current behavior) or removed
 * outright — never as a fake control (even a disabled one) or a wall of
 * "Coming later" action buttons.
 */

export function SettingsSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section
      data-testid="settings-section"
      data-section={title}
      className="flex flex-col gap-2 rounded-[8px] p-4"
      style={{
        background: "var(--builder-panel)",
        border:
          tone === "danger"
            ? "1px solid rgb(220 38 38 / 0.4)"
            : "1px solid var(--builder-border)",
        boxShadow: "var(--builder-shadow-sm)",
      }}
    >
      <h3
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: tone === "danger" ? "rgb(220 38 38)" : "var(--builder-muted)" }}
      >
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span style={{ color: "var(--builder-muted)" }}>{label}</span>
      <span className="text-right" style={{ color: "var(--builder-text)" }}>
        {children ??
          value ??
          <span style={{ color: "var(--builder-muted)" }}>Not available</span>}
      </span>
    </div>
  );
}

/** An honest, read-only note row — replaces the old "Coming later" badge spam. */
export function NoteRow({ label, note }: { label: string; note: string }) {
  return (
    <div
      data-testid="settings-note-row"
      className="flex items-baseline justify-between gap-3 text-[12.5px]"
    >
      <span style={{ color: "var(--builder-muted)" }}>{label}</span>
      <span className="text-right" style={{ color: "var(--builder-muted)" }}>
        {note}
      </span>
    </div>
  );
}

// ─── Name editor ─────────────────────────────────────────────────────────────

const NAME_MAX = 120;

export function NameEditor({
  workflowId,
  initialName,
  onSaved,
}: {
  workflowId: string | null;
  initialName: string;
  onSaved?: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed !== savedName.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const canSave = workflowId !== null && dirty && valid && status !== "saving";

  const save = useCallback(async () => {
    if (workflowId === null) return;
    const next = name.trim();
    if (next.length < 1 || next.length > NAME_MAX || next === savedName.trim()) return;
    setStatus("saving");
    setError(null);
    try {
      // PATCH name only — never sends draftDefinition, so it can't race the graph
      // save and never activates / publishes / runs.
      const detail = await updateWorkflow(workflowId, { name: next });
      // WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — the rename bumped the
      // row's revision. Feed the response through the EXTERNAL hydrate path: if
      // the definition is unchanged (the normal case) the builder just adopts
      // the fresh token so the next graph save doesn't false-conflict; if the
      // definition really moved elsewhere, the shared conflict experience shows.
      if (detail?.draftDefinition && detail.updatedAt) {
        useGraphSlice
          .getState()
          .hydrate(workflowId, detail.draftDefinition, detail.updatedAt);
      }
      setSavedName(next);
      setStatus("saved");
      onSaved?.(next);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Couldn't save the name.");
    }
  }, [workflowId, name, savedName, onSaved]);

  return (
    <div className="flex flex-col gap-1">
      <label
        className="text-[12.5px]"
        style={{ color: "var(--builder-muted)" }}
        htmlFor="settings-name-input"
      >
        Name
      </label>
      <div className="flex items-center gap-2">
        <input
          id="settings-name-input"
          data-testid="settings-name-input"
          type="text"
          value={name}
          maxLength={NAME_MAX}
          disabled={workflowId === null}
          onChange={(e) => {
            setName(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) {
              e.preventDefault();
              void save();
            }
          }}
          className="flex-1 rounded-[6px] border px-2.5 py-1.5 text-[13px]"
          style={{
            background: "var(--builder-panel-2)",
            borderColor: "var(--builder-border)",
            color: "var(--builder-text)",
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          data-testid="settings-name-save"
          className="rounded-[6px] border px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{
            background: "var(--builder-panel)",
            borderColor: "var(--builder-border)",
            color: "var(--builder-text)",
          }}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      {trimmed.length === 0 ? (
        <span className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
          Name can&rsquo;t be empty.
        </span>
      ) : status === "saved" && !dirty ? (
        <span
          data-testid="settings-name-saved"
          className="text-[11px]"
          style={{ color: "var(--builder-text)" }}
        >
          Saved
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─── Copy-id button ──────────────────────────────────────────────────────────

export function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(id);
    setCopied(true);
  }, [id]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="settings-copy-id"
      title="Copy the workflow id (for support / debugging)"
      className="inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px]"
      style={{
        background: "var(--builder-panel-2)",
        borderColor: "var(--builder-border)",
        color: "var(--builder-muted)",
      }}
    >
      <code className="builder-mono" style={{ color: "var(--builder-text)" }}>
        {id.length > 12 ? `${id.slice(0, 8)}…` : id}
      </code>
      {copied ? <span data-testid="settings-id-copied">Copied</span> : <span aria-hidden>⧉</span>}
    </button>
  );
}

// ─── Danger zone ─────────────────────────────────────────────────────────────

export function DangerZone({
  workflowId,
  workflowName,
}: {
  workflowId: string | null;
  workflowName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const del = useCallback(async () => {
    if (workflowId === null) return;
    setStatus("deleting");
    setError(null);
    try {
      // Soft-delete → Trash (recoverable). Never a hard delete from here.
      await deleteWorkflow(workflowId);
      window.location.assign("/workflows");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Couldn't delete the workflow.");
    }
  }, [workflowId]);

  return (
    <SettingsSection title="Danger zone" tone="danger">
      <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
        Deleting moves this workflow to Trash. You can restore it from the
        workflows list before it&rsquo;s permanently removed.
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={workflowId === null}
          data-testid="settings-delete"
          className="self-start rounded-[6px] border px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{
            background: "var(--builder-panel)",
            borderColor: "rgb(220 38 38 / 0.5)",
            color: "rgb(220 38 38)",
          }}
        >
          Delete workflow
        </button>
      ) : (
        <div className="flex flex-col gap-2" data-testid="settings-delete-confirm-box">
          <span className="text-[12.5px]" style={{ color: "var(--builder-text)" }}>
            Move &ldquo;{workflowName}&rdquo; to Trash?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={status === "deleting"}
              data-testid="settings-delete-cancel"
              className="rounded-[6px] border px-3 py-1.5 text-[12px]"
              style={{
                background: "var(--builder-panel)",
                borderColor: "var(--builder-border)",
                color: "var(--builder-text)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void del()}
              disabled={status === "deleting"}
              data-testid="settings-delete-confirm"
              className="rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              style={{ background: "rgb(220 38 38)" }}
            >
              {status === "deleting" ? "Deleting…" : "Move to Trash"}
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}

// ─── Time formatting ─────────────────────────────────────────────────────────

/** Readable LOCAL time ("Jun 1, 2026, 9:00 AM"), or null for missing/bad input. */
export function formatLocalTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return formatUtcTime(iso);
  }
}

/** Deterministic UTC fallback ("YYYY-MM-DD HH:MM UTC"), used for the hover title. */
export function formatUtcTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorkflowFolder } from "@/contracts/folders";
import { FolderApiError } from "@/lib/api/folders";
import { eligibleMoveParents, folderPath, indexById } from "./folderTree";

/**
 * Move-folder (reparent) dialog (Slice 4.WORKFLOW-FOLDERS-6 / WF-5 nested-tree
 * pass).
 *
 * Lists the destinations `folder` can move into without creating a cycle or
 * exceeding the depth-3 cap (computed client-side via folderTree), plus a
 * "Top level" option when the folder isn't already at the root. The server
 * re-validates and may still reject (FOLDER_CYCLE / FOLDER_TOO_DEEP /
 * FOLDER_NAME_TAKEN) — those messages surface inline. Same lightweight modal
 * idiom as FolderFormDialog (no Shadcn Dialog primitive in V2).
 */
interface Props {
  folder: WorkflowFolder;
  folders: readonly WorkflowFolder[];
  onConfirm: (parentFolderId: string | null) => Promise<void>;
  onClose: () => void;
}

export function FolderMoveDialog({ folder, folders, onConfirm, onClose }: Props) {
  const byId = indexById(folders);
  const targets = eligibleMoveParents(folder.id, folders, byId);
  const atRoot = (folder.parentFolderId ?? null) === null;
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `selected === undefined` → nothing picked yet; `null` → Top level.
  const canSubmit = selected !== undefined && !pending;

  async function submit() {
    if (selected === undefined || pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      setError(
        err instanceof FolderApiError
          ? err.message
          : "Couldn't move the folder. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="folder-move-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Move folder ${folder.name}`}
        data-testid="folder-move-dialog"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Move “{folder.name}”
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose where this folder (and anything inside it) should live. Nesting
          is limited to 3 levels.
        </p>

        <div className="mt-3 flex flex-col gap-1 overflow-y-auto">
          {!atRoot && (
            <DestinationRow
              testId="folder-move-target-root"
              label="Top level"
              indent={0}
              selected={selected === null}
              onSelect={() => setSelected(null)}
            />
          )}
          {targets.map((t) => (
            <DestinationRow
              key={t.id}
              testId={`folder-move-target-${t.id}`}
              label={folderPath(t.id, byId)
                .map((p) => p.name)
                .join(" / ")}
              indent={folderPath(t.id, byId).length - 1}
              selected={selected === t.id}
              onSelect={() => setSelected(t.id)}
            />
          ))}
          {targets.length === 0 && atRoot && (
            <p
              data-testid="folder-move-empty"
              className="px-1 py-2 text-xs text-muted-foreground"
            >
              No other folders can hold this one without exceeding the 3-level
              nesting limit.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            data-testid="folder-move-error"
            className="mt-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void submit()}
            data-testid="folder-move-confirm"
          >
            {pending ? "Moving…" : "Move"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DestinationRow({
  testId,
  label,
  indent,
  selected,
  onSelect,
}: {
  testId: string;
  label: string;
  indent: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      style={{ paddingLeft: `${0.5 + indent * 0.85}rem` }}
      className={
        "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition " +
        (selected
          ? "bg-primary/15 text-primary"
          : "text-foreground hover:bg-muted")
      }
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="shrink-0 opacity-70">
        <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6v5A1.5 1.5 0 0 1 13 12.5H3A1.5 1.5 0 0 1 1.5 11z" />
      </svg>
      <span className="truncate">{label}</span>
    </button>
  );
}

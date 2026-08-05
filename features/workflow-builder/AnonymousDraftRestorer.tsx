"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  WorkflowApiError,
} from "@/lib/api/workflows";
import {
  clearAnonDraft,
  clearRestoreTarget,
  readAnonDraft,
  readRestoreTarget,
  setRestoredContext,
  setRestoreTarget,
  type AnonDraft,
  type AnonGateReason,
} from "@/lib/anonymousBuilder";

/**
 * ANON-BUILDER-2/3 — controlled, idempotent post-auth restore of an anonymous draft.
 *
 * Runs ONLY when authenticated (the `/start/continue` route gates that). It reads
 * the sanitized anonymous draft from localStorage and turns it into a REAL,
 * account-owned workflow using the existing authenticated typed client
 * (`createWorkflow` + `updateWorkflow`) — no new API, no service-role, no
 * RLS/auth bypass, no anonymous DB write.
 *
 * Idempotency (ANON-BUILDER-3 Scope A): the created workflow id is persisted as a
 * "restore target" BEFORE the skeleton PATCH. If the PATCH fails, both the draft
 * and the target are kept; a retry reuses the SAME workflow (no duplicate empty
 * workflows). If the stored target is gone/inaccessible (404/403), it's cleared
 * and a new one is created — but a transient error never spawns a duplicate.
 *
 * Saved as a DRAFT only: it never auto-activates or auto-runs, even if the user
 * clicked Activate/Run before signing up. On success the local draft + target are
 * cleared and the prompt + gate reason are parked for the real builder (composer
 * seed + next-action banner). On failure the draft + target are RETAINED and a
 * recoverable error + retry is shown.
 */

/** Derive a workflow name from the prompt's first line (schema max 120). */
function deriveWorkflowName(prompt: string): string {
  const firstLine = prompt.split("\n")[0]?.trim() ?? "";
  const name = firstLine.slice(0, 80).trim();
  return name.length > 0 ? name : "Untitled workflow";
}

/** Map the sanitized anon skeleton into a WorkflowDefinition (config/position defaulted). */
function toDefinition(draft: AnonDraft): WorkflowDefinition {
  return {
    nodes: draft.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
      config: n.config ?? {},
      position: n.position ?? { x: 0, y: 0 },
      ...(n.displayName ? { displayName: n.displayName } : {}),
    })),
    edges: draft.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(e.label ? { label: e.label } : {}),
    })),
  };
}

/** A stored restore target is "unusable" when the server confirms it's gone/forbidden. */
function isUnusableTargetError(err: unknown): boolean {
  return (
    err instanceof WorkflowApiError &&
    (err.code === "WORKFLOW_NOT_FOUND" ||
      err.status === 404 ||
      err.status === 403 ||
      err.status === 401)
  );
}

export function AnonymousDraftRestorer({ reason }: { reason?: AnonGateReason }) {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState<string>("");
  const runningRef = useRef(false);

  const restore = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus("working");
    const draft = readAnonDraft();
    if (!draft) {
      // Nothing to restore (typed URL, already-consumed draft) → go home.
      router.replace("/workflows");
      return;
    }
    try {
      // Reuse a pending restore target from a prior failed attempt when it's
      // still accessible; otherwise create a fresh workflow exactly once.
      let targetId = readRestoreTarget();
      // WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — definition saves
      // require the server revision the writer is based on. The just-created /
      // just-verified workflow's `updatedAt` IS that revision; a retry re-reads
      // it, so a stale token never sticks across attempts.
      let expectedRevision: string | null = null;
      if (targetId) {
        try {
          const existing = await getWorkflow(targetId); // accessible → reuse it
          expectedRevision = existing.updatedAt;
        } catch (verifyErr) {
          if (isUnusableTargetError(verifyErr)) {
            clearRestoreTarget(); // confirmed gone → safe to create a new one
            targetId = "";
          } else {
            throw verifyErr; // transient → bubble to retry; never duplicate
          }
        }
      }
      if (!targetId) {
        const created = await createWorkflow({ name: deriveWorkflowName(draft.prompt) });
        targetId = created.id;
        expectedRevision = created.updatedAt;
        // Persist BEFORE the PATCH so a failed import retries against this id.
        setRestoreTarget(targetId);
      }
      if (draft.nodes.length > 0 && expectedRevision !== null) {
        await updateWorkflow(targetId, {
          draftDefinition: toDefinition(draft),
          expectedRevision,
        });
      }
      // Park prompt + reason for the real builder (composer seed + next-action banner).
      setRestoredContext(targetId, { prompt: draft.prompt, ...(reason ? { reason } : {}) });
      // Clear ONLY after the workflow + skeleton are persisted.
      clearAnonDraft();
      clearRestoreTarget();
      router.refresh();
      // BUILDER-VIEW-DEFAULT-1 — the restored draft IS a newly created
      // workflow; the one-shot marker lets the builder offer the view chooser.
      router.replace(`/workflows/${targetId}?created=1`);
    } catch (err) {
      runningRef.current = false;
      setStatus("error");
      setMessage(
        err instanceof WorkflowApiError
          ? err.message
          : "We couldn't save your draft. Your work is still here — try again.",
      );
    }
  }, [router, reason]);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (status === "error") {
    return (
      <div
        data-testid="anonymous-restore-error"
        className="flex max-w-sm flex-col items-start gap-3 text-sm"
      >
        <p className="font-medium text-destructive">Couldn&apos;t save your draft</p>
        <p className="text-muted-foreground">
          {message} Your draft is still saved in this browser.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void restore()}
            data-testid="anonymous-restore-retry"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <Link
            href="/workflows"
            className="rounded border border-input px-3 py-1.5 text-sm"
          >
            Go to workflows
          </Link>
        </div>
      </div>
    );
  }

  return (
    <p data-testid="anonymous-restore-working" role="status" className="text-sm text-muted-foreground">
      Saving your draft to your account…
    </p>
  );
}

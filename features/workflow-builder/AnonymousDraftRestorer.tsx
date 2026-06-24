"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  createWorkflow,
  updateWorkflow,
  WorkflowApiError,
} from "@/lib/api/workflows";
import {
  clearAnonDraft,
  readAnonDraft,
  setRestoredPrompt,
  type AnonDraft,
} from "@/lib/anonymousBuilder";

/**
 * ANON-BUILDER-2 — controlled post-auth restore of an anonymous draft.
 *
 * Runs ONLY when authenticated (the `/start/continue` route gates that). It reads
 * the sanitized anonymous draft from localStorage and turns it into a REAL,
 * account-owned workflow using the existing authenticated typed client
 * (`createWorkflow` + `updateWorkflow`) — no new API, no service-role, no
 * RLS/auth bypass, no anonymous DB write.
 *
 * Saved as a DRAFT only: it never auto-activates or auto-runs, even if the user
 * clicked Activate/Run before signing up. On success the local draft is cleared
 * (no duplicate re-import) and the prompt is parked for the real builder's React
 * Agent composer. On failure the local draft is RETAINED and a recoverable error
 * + retry is shown.
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

export function AnonymousDraftRestorer() {
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
      const created = await createWorkflow({ name: deriveWorkflowName(draft.prompt) });
      if (draft.nodes.length > 0) {
        await updateWorkflow(created.id, { draftDefinition: toDefinition(draft) });
      }
      // Park the prompt so the real builder seeds its React Agent composer once.
      if (draft.prompt) setRestoredPrompt(created.id, draft.prompt);
      // Only clear AFTER the workflow + skeleton are persisted — so a failure
      // above leaves the draft intact for retry.
      clearAnonDraft();
      router.refresh();
      router.replace(`/workflows/${created.id}`);
    } catch (err) {
      runningRef.current = false;
      setStatus("error");
      setMessage(
        err instanceof WorkflowApiError
          ? err.message
          : "We couldn't save your draft. Your work is still here — try again.",
      );
    }
  }, [router]);

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

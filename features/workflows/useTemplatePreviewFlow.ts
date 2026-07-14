"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useTemplate as createWorkflowFromTemplateApi,
  TemplateApiError,
} from "@/lib/api/workflowTemplates";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

/**
 * Shared "preview → explicitly use" flow for React Agent official-template match cards
 * (REACT-AGENT-TEMPLATE-MATCH-3 / AI-TEMPLATE-APPLY-CURRENT). One hook so the dashboard single-shot
 * panel and the builder conversational rail behave consistently.
 *
 * - `openPreview(match)` opens the confirmation dialog. Opening creates/changes NOTHING.
 * - `confirmUse()` is the CREATE-NEW path: it calls the EXISTING account-scoped template-use route
 *   (`useTemplate` → `POST /api/workflow-templates/[id]/use`) exactly once, then navigates to the
 *   created workflow — the SAME behavior the marketplace dashboard uses. No fork/apply/activate/run.
 * - `confirmApplyToCurrent()` is the APPLY-IN-PLACE path, available ONLY when a builder context is
 *   supplied (`currentWorkflowId` + `onApplyToCurrent`). It delegates to the builder-provided handler
 *   (which overwrites the CURRENT workflow's draft via the existing replace-from-template path, with a
 *   pre-replace checkpoint + History entry), then closes the dialog. It never creates a workflow and
 *   never navigates.
 *
 * On error either path surfaces safe copy and creates/changes nothing (busy released so the user can
 * retry/cancel). A failed apply keeps the user in place — it never falls back to creating a workflow.
 *
 * On CREATE-NEW success it intentionally does NOT clear `busy` — the route push navigates away (mirrors
 * the dashboard's `handleUse`). On APPLY-IN-PLACE success the dialog closes (no navigation).
 */

export interface TemplatePreviewFlowOptions {
  /**
   * AI-TEMPLATE-APPLY-CURRENT — the workflow currently open in the builder. When present together with
   * `onApplyToCurrent`, the dialog offers "Apply to current workflow" as the primary choice. Absent (the
   * dashboard, which has no open workflow) → the dialog only offers create-new, byte-identical to before.
   */
  readonly currentWorkflowId?: string;
  /**
   * Builder-provided "apply this template to the CURRENT workflow" handler. It owns the whole in-place
   * apply: call the replace-from-template route (origin `react_agent`), re-hydrate the canvas, refresh
   * History, reflect lifecycle state, and surface a success message. It must THROW on failure so this
   * hook can keep the user in the dialog with a safe error (and never navigate / create a workflow).
   */
  readonly onApplyToCurrent?: (input: { templateId: string; templateName: string }) => Promise<void>;
}

export interface TemplatePreviewFlow {
  readonly previewMatch: GuidanceOfficialTemplateMatch | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** True when the dialog should offer the "Apply to current workflow" choice (builder context present). */
  readonly canApplyToCurrent: boolean;
  readonly openPreview: (match: GuidanceOfficialTemplateMatch) => void;
  readonly closePreview: () => void;
  /** CREATE-NEW: create a separate workflow from the template and navigate to it. */
  readonly confirmUse: () => void;
  /** APPLY-IN-PLACE: overwrite the current workflow's draft with the template (no navigation). */
  readonly confirmApplyToCurrent: () => void;
}

export function useTemplatePreviewFlow(
  accountId: string,
  options: TemplatePreviewFlowOptions = {},
): TemplatePreviewFlow {
  const router = useRouter();
  const [previewMatch, setPreviewMatch] = useState<GuidanceOfficialTemplateMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canApplyToCurrent =
    typeof options.currentWorkflowId === "string" &&
    options.currentWorkflowId.length > 0 &&
    typeof options.onApplyToCurrent === "function";

  function openPreview(match: GuidanceOfficialTemplateMatch): void {
    setError(null);
    setPreviewMatch(match);
  }

  function closePreview(): void {
    if (busy) return; // never abandon an in-flight create/apply
    setPreviewMatch(null);
    setError(null);
  }

  async function confirmUse(): Promise<void> {
    if (!previewMatch || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { workflowId } = await createWorkflowFromTemplateApi(previewMatch.templateId, {
        targetAccountId: accountId,
      });
      // Success → navigate to the created workflow (same as the marketplace dashboard). Keep `busy`.
      router.push(`/workflows/${workflowId}`);
    } catch (err) {
      setError(
        err instanceof TemplateApiError
          ? err.message
          : "Couldn't use that template. Please try again.",
      );
      setBusy(false);
    }
  }

  async function confirmApplyToCurrent(): Promise<void> {
    if (!previewMatch || busy || !options.onApplyToCurrent) return;
    setBusy(true);
    setError(null);
    try {
      await options.onApplyToCurrent({
        templateId: previewMatch.templateId,
        templateName: previewMatch.name,
      });
      // Success → the builder re-hydrated the canvas in place. Close the dialog; stay on this URL.
      setBusy(false);
      setPreviewMatch(null);
    } catch (err) {
      // Non-destructive failure: keep the user in the dialog with safe copy — no navigation, no
      // create-new fallback. The builder handler left the previous draft intact.
      setError(
        err instanceof TemplateApiError
          ? err.message
          : "Couldn't apply that template to your workflow. Please try again.",
      );
      setBusy(false);
    }
  }

  return {
    previewMatch,
    busy,
    error,
    canApplyToCurrent,
    openPreview,
    closePreview,
    confirmUse,
    confirmApplyToCurrent,
  };
}

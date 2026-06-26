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
 * (REACT-AGENT-TEMPLATE-MATCH-3). One hook so the dashboard single-shot panel and the builder
 * conversational rail behave identically.
 *
 * - `openPreview(match)` opens the confirmation dialog. Opening creates NOTHING.
 * - `confirmUse()` is the ONLY create path: it calls the EXISTING account-scoped template-use route
 *   (`useTemplate` → `POST /api/workflow-templates/[id]/use`) exactly once, then navigates to the
 *   created workflow — the SAME behavior the marketplace dashboard uses. No new creation route, no
 *   fork/apply/activate/run, no model call.
 * - On error it surfaces safe copy and creates nothing (busy released so the user can retry/cancel).
 *
 * On success it intentionally does NOT clear `busy` — the route push navigates away (mirrors the
 * dashboard's `handleUse`, which leaves the button busy through navigation).
 */

export interface TemplatePreviewFlow {
  readonly previewMatch: GuidanceOfficialTemplateMatch | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly openPreview: (match: GuidanceOfficialTemplateMatch) => void;
  readonly closePreview: () => void;
  readonly confirmUse: () => void;
}

export function useTemplatePreviewFlow(accountId: string): TemplatePreviewFlow {
  const router = useRouter();
  const [previewMatch, setPreviewMatch] = useState<GuidanceOfficialTemplateMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPreview(match: GuidanceOfficialTemplateMatch): void {
    setError(null);
    setPreviewMatch(match);
  }

  function closePreview(): void {
    if (busy) return; // never abandon an in-flight create
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

  return { previewMatch, busy, error, openPreview, closePreview, confirmUse };
}

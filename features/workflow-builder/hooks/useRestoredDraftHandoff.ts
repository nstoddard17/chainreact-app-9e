"use client";

import { useCallback, useEffect, useState } from "react";
import { consumeRestoredContext, type AnonGateReason } from "@/lib/anonymousBuilder";

/**
 * ANON-BUILDER-2/3 — consume the one-shot restored-draft handoff for the
 * authenticated builder.
 *
 * After an anonymous draft is restored into a real workflow, the prompt + gate
 * reason are parked in localStorage keyed by the new workflow id. On mount
 * (client-only → no SSR mismatch) we consume them ONCE:
 *   - `composerValue` seeds the React Agent composer,
 *   - `reason` drives the next-action banner (dismissible).
 *
 * Local-only (anonymous) builders never consume this. Authenticated builders that
 * weren't opened via restore simply get empty values (cheap no-op read).
 */
export function useRestoredDraftHandoff(
  workflowId: string,
  localOnly?: boolean,
): {
  composerValue: string;
  reason: AnonGateReason | null;
  dismissReason: () => void;
} {
  const [composerValue, setComposerValue] = useState("");
  const [reason, setReason] = useState<AnonGateReason | null>(null);

  useEffect(() => {
    if (localOnly) return;
    const ctx = consumeRestoredContext(workflowId);
    if (!ctx) return;
    if (ctx.prompt) setComposerValue(ctx.prompt);
    if (ctx.reason) setReason(ctx.reason);
  }, [localOnly, workflowId]);

  const dismissReason = useCallback(() => setReason(null), []);

  return { composerValue, reason, dismissReason };
}

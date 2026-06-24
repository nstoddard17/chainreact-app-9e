"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
  type GuidanceConversationTurn,
} from "@/contracts/aiGuidance";
import { requestAnonymousGuidance } from "@/lib/api/ai/anonymousGuidance";
import { anonSignupHref } from "./AnonymousLocalChrome";

/**
 * ANON-BUILDER / REACT-LIVE-SKELETON-3 — limited anonymous AI planning rail for `/start`.
 *
 * A logged-out visitor gets a small, capped amount of real model-backed planning (via the no-auth
 * `/api/ai/anonymous-workflow-guidance` route) to generate/refine a workflow skeleton BEFORE signup.
 * Valid plans auto-show on the canvas (the same overlay the authenticated rail uses). It is
 * PLANNING-ONLY: no save / connect / run / activate, no account/provider data — those still gate to
 * sign-up. When the anonymous attempt cap is reached, the composer locks and a sign-up CTA shows.
 *
 * Apply stays explicit + local-draft only (the canvas overlay's Apply). Refining keeps a bounded,
 * sanitized recent-conversation context so follow-ups read in context; the latest preview supersedes.
 */

interface Props {
  /** Carried-over prompt (homepage → /start, or a restored anon draft). Seeds + auto-plans once. */
  prompt?: string;
  /** Hand a validated {plan, preview} to the builder's canvas overlay (auto-show). */
  onShowPreview?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
  /** Report composer edits up so the anonymous draft persists the latest prompt. */
  onPromptChange?: (prompt: string) => void;
}

type Turn =
  | { readonly id: number; readonly role: "user"; readonly text: string }
  | { readonly id: number; readonly role: "assistant"; readonly text: string; readonly warnings?: readonly string[] };

function toRecentTurns(turns: readonly Turn[]): GuidanceConversationTurn[] {
  return turns
    .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_GUIDANCE_CONVERSATION_TURN_TEXT) }))
    .filter((t) => t.text.trim().length > 0)
    .slice(-MAX_GUIDANCE_CONVERSATION_TURNS);
}

export function AnonymousAgentRail({ prompt, onShowPreview, onPromptChange }: Props) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);
  const nextId = useRef(0);
  const seededRef = useRef(false);

  const plan = useCallback(
    async (goalText: string) => {
      const goal = goalText.trim();
      if (goal.length === 0 || loading || limitReached) return;
      const recentTurns = toRecentTurns(turns);
      const id = nextId.current++;
      setTurns((prev) => [...prev, { id, role: "user", text: goal }]);
      setLoading(true);
      const result = await requestAnonymousGuidance({ goalText: goal, ...(recentTurns.length ? { recentTurns } : {}) });
      setLoading(false);
      if (!result) {
        setTurns((prev) => [
          ...prev,
          { id: nextId.current++, role: "assistant", text: "Workflow planning isn't available right now. Please try again." },
        ]);
        return;
      }
      setRemaining(result.remainingAnonymousAttempts);
      setLimitReached(result.limitReached);
      setUnavailable(result.unavailable);
      if (result.limitReached && !result.workflowPlan) {
        setTurns((prev) => [...prev, { id: nextId.current++, role: "assistant", text: result.guidanceText }]);
        return;
      }
      if (result.workflowPlan && result.previewDraft) {
        // Auto-show on the canvas — no extra click. A newer plan supersedes the prior one.
        onShowPreview?.({ plan: result.workflowPlan, preview: result.previewDraft });
      }
      setTurns((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "assistant",
          text: result.guidanceText,
          ...(result.warnings && result.warnings.length ? { warnings: result.warnings } : {}),
        },
      ]);
    },
    [turns, loading, limitReached, onShowPreview],
  );

  // Auto-plan the carried-over prompt once it arrives (homepage / restored draft). The seed becomes
  // the first transcript turn; the composer stays empty + ready for a refinement (no append-to-seed).
  useEffect(() => {
    if (seededRef.current) return;
    const seed = (prompt ?? "").trim();
    if (seed.length === 0) return;
    seededRef.current = true;
    void plan(seed);
  }, [prompt, plan]);

  /** The visitor's current idea: what they've typed, else their latest sent turn (for Copy). */
  const currentIdea = (): string => {
    const typed = input.trim();
    if (typed) return typed;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i]!.role === "user") return turns[i]!.text;
    }
    return "";
  };

  const handleChange = (value: string) => {
    setInput(value);
    onPromptChange?.(value);
  };

  const handleSubmit = () => {
    if (!input.trim() || loading || limitReached) return;
    void plan(input);
    setInput("");
  };

  async function copyPrompt() {
    const trimmed = currentIdea();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — non-fatal.
    }
  }

  const canSubmit = input.trim().length > 0 && !loading && !limitReached;

  return (
    <section
      aria-label="AI assistant"
      data-testid="anonymous-agent-rail"
      className="flex h-full min-h-0 flex-col gap-3 p-2"
      style={{ color: "var(--builder-text)" }}
    >
      <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
        Describe what you want to automate. React will plan a workflow skeleton on the canvas — free to
        preview, no account needed yet. Nothing is saved, connected, or run.
      </p>

      {turns.length > 0 && (
        <div data-testid="anonymous-agent-rail-messages" className="flex max-h-48 flex-col gap-2 overflow-y-auto text-[13px]">
          {turns.map((t) =>
            t.role === "user" ? (
              <div key={t.id} data-testid="anonymous-agent-rail-user">
                <span className="font-medium">You: </span>
                <span style={{ color: "var(--builder-text-2)" }}>{t.text}</span>
              </div>
            ) : (
              <div key={t.id} data-testid="anonymous-agent-rail-assistant">
                <span className="font-medium">React: </span>
                <span style={{ color: "var(--builder-text-2)" }} className="whitespace-pre-wrap">{t.text}</span>
                {t.warnings && t.warnings.length > 0 && (
                  <ul data-testid="anonymous-agent-rail-warnings" className="mt-1 space-y-0.5 text-[12px]" style={{ color: "var(--builder-muted)" }}>
                    {t.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {!limitReached && (
        <>
          <textarea
            data-testid="anonymous-agent-rail-prompt"
            rows={3}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="e.g. When a new lead comes in, add them to Mailchimp and ping #sales."
            aria-label="Describe what you want to automate"
            maxLength={2000}
            disabled={loading}
            className="w-full resize-none rounded-md p-2.5 text-[13px] leading-relaxed"
            style={{ background: "var(--builder-panel-2)", border: "1px solid var(--builder-border)", color: "var(--builder-text)" }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              data-testid="anonymous-agent-rail-preview"
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
              style={{ background: "var(--builder-text)", color: "var(--builder-panel)", border: "1px solid var(--builder-text)" }}
            >
              {loading ? "Planning…" : "Plan on canvas"}
            </button>
            <button
              type="button"
              onClick={copyPrompt}
              disabled={currentIdea().length === 0}
              data-testid="anonymous-agent-rail-copy"
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
              style={{ background: "var(--builder-panel-2)", color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
            >
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
          {remaining !== null && remaining > 0 && (
            <p data-testid="anonymous-agent-rail-remaining" className="text-[11px]" style={{ color: "var(--builder-muted-2)" }}>
              {remaining} free preview{remaining === 1 ? "" : "s"} left before sign-up.
            </p>
          )}
        </>
      )}

      {limitReached && (
        <div data-testid="anonymous-agent-rail-limit" className="flex flex-col gap-2">
          {unavailable ? (
            <p data-testid="anonymous-agent-rail-unavailable" className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
              Free anonymous previews aren&apos;t available right now. Create a free account to start
              building with React Agent.
            </p>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
              You&apos;ve used the free workflow previews. Create a free account to keep building with
              React Agent — your draft is kept.
            </p>
          )}
        </div>
      )}

      <Link
        href={anonSignupHref("ai")}
        data-testid="anonymous-agent-rail-signup"
        className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium"
        style={
          limitReached
            ? { background: "var(--builder-text)", color: "var(--builder-panel)", border: "1px solid var(--builder-text)" }
            : { background: "var(--builder-panel-2)", color: "var(--builder-text)", border: "1px solid var(--builder-border)" }
        }
      >
        {limitReached ? "Create a free account to keep building" : "Create a free account to save & connect apps"} <span aria-hidden>→</span>
      </Link>

      <p className="text-[11px]" style={{ color: "var(--builder-muted-2)" }}>
        Building locally — Save, Connect apps, and Run need an account.
      </p>
    </section>
  );
}

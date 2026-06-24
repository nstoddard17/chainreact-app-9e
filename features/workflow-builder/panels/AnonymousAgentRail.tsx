"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { requestAnonSkeleton } from "@/lib/api/ai/anonSkeleton";
import { anonSignupHref } from "./AnonymousLocalChrome";

/**
 * ANON-BUILDER / REACT-LIVE-SKELETON-2 — left-rail copilot for the LOCAL-ONLY builder
 * (`/start`, logged-out visitors).
 *
 * It does NOT mount the live, account-scoped, credit-billed guidance panel. Instead it offers a FREE,
 * deterministic skeleton: the visitor's idea is sent to the no-auth `/api/ai/anon-skeleton` endpoint
 * (pure catalog-backed inference — NO paid AI, NO provider calls, NO DB). When an obvious shape is
 * recognized, the skeleton is auto-shown on the canvas via `onShowPreview` (the same overlay the
 * authenticated rail uses); the visitor reviews it and clicks Apply (local-draft only). When the shape
 * isn't deterministically inferable, it keeps them in the builder and points to sign-up for the deeper
 * React Agent planner.
 *
 * Editable + refinable: the composer is seeded from the carried-over prompt and auto-previews once;
 * editing + Preview re-infers and the newer skeleton supersedes the prior one. Apply is always
 * explicit; nothing is saved/activated/run/connected here.
 */

interface Props {
  /** Carried-over prompt (homepage → /start, or a restored anon draft). Seeds the composer once. */
  prompt?: string;
  /** Hand a deterministic {plan, preview} to the builder's canvas overlay (auto-show). */
  onShowPreview?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
  /** Report composer edits up so the anonymous draft persists the latest prompt. */
  onPromptChange?: (prompt: string) => void;
}

type Status = "idle" | "loading" | "ready" | "no-shape";

export function AnonymousAgentRail({ prompt, onShowPreview, onPromptChange }: Props) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [copied, setCopied] = useState(false);
  // Seed the composer + auto-preview ONCE, when the carried-over prompt first arrives non-empty.
  const seededRef = useRef(false);

  const infer = useCallback(
    async (goalText: string) => {
      const goal = goalText.trim();
      if (goal.length === 0) {
        setStatus("idle");
        setWarnings([]);
        return;
      }
      setStatus("loading");
      const result = await requestAnonSkeleton({ goalText: goal });
      if (result?.plan && result.preview) {
        // Auto-show on the canvas — no extra click. A newer skeleton supersedes the prior one.
        onShowPreview?.({ plan: result.plan, preview: result.preview });
        setWarnings([]);
        setStatus("ready");
      } else {
        setWarnings(result?.warnings ?? []);
        setStatus("no-shape");
      }
    },
    [onShowPreview],
  );

  // Seed + auto-preview from the carried-over prompt once it arrives (homepage / restored draft).
  useEffect(() => {
    if (seededRef.current) return;
    const seed = (prompt ?? "").trim();
    if (seed.length === 0) return;
    seededRef.current = true;
    setInput(seed);
    void infer(seed);
  }, [prompt, infer]);

  const handleChange = (value: string) => {
    setInput(value);
    onPromptChange?.(value);
  };

  const handleSubmit = () => {
    if (status === "loading") return;
    void infer(input);
  };

  async function copyPrompt() {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — non-fatal; the visible composer is the fallback.
    }
  }

  const canSubmit = input.trim().length > 0 && status !== "loading";

  return (
    <section
      aria-label="AI assistant"
      data-testid="anonymous-agent-rail"
      className="flex h-full min-h-0 flex-col gap-3 p-2"
      style={{ color: "var(--builder-text)" }}
    >
      <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
        Describe what you want to automate. I&apos;ll sketch a free starter skeleton on the canvas — no
        account needed to build it.
      </p>

      <textarea
        data-testid="anonymous-agent-rail-prompt"
        rows={4}
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="e.g. When I run this manually, send a Slack message to a channel."
        aria-label="Describe what you want to automate"
        maxLength={2000}
        className="w-full resize-none rounded-md p-2.5 text-[13px] leading-relaxed"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-text)",
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="anonymous-agent-rail-preview"
          className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{
            background: "var(--builder-text)",
            color: "var(--builder-panel)",
            border: "1px solid var(--builder-text)",
          }}
        >
          {status === "loading" ? "Sketching…" : "Preview on canvas"}
        </button>
        <button
          type="button"
          onClick={copyPrompt}
          disabled={input.trim().length === 0}
          data-testid="anonymous-agent-rail-copy"
          className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{
            background: "var(--builder-panel-2)",
            color: "var(--builder-text-2)",
            border: "1px solid var(--builder-border)",
          }}
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>

      {status === "ready" && (
        <p data-testid="anonymous-agent-rail-ready" className="text-[12px]" style={{ color: "var(--builder-text-2)" }}>
          Here&apos;s a starter skeleton on the canvas. Review it, then Apply to add it to your draft —
          free, no account needed. Edit your idea above and preview again to refine it.
        </p>
      )}

      {status === "no-shape" && (
        <div data-testid="anonymous-agent-rail-no-shape" className="flex flex-col gap-2">
          {warnings.length > 0 && (
            <ul data-testid="anonymous-agent-rail-warnings" className="space-y-1 text-[12px]" style={{ color: "var(--builder-muted)" }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
            I can&apos;t sketch that one for free yet. Create an account to use React Agent for more
            complex workflow planning.
          </p>
        </div>
      )}

      <Link
        href={anonSignupHref("ai")}
        data-testid="anonymous-agent-rail-signup"
        className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium"
        style={{
          background: "var(--builder-panel-2)",
          color: "var(--builder-text)",
          border: "1px solid var(--builder-border)",
        }}
      >
        Create a free account for the full React Agent <span aria-hidden>→</span>
      </Link>

      <p className="text-[11px]" style={{ color: "var(--builder-muted-2)" }}>
        Building locally — Save, Connect apps, and Run need an account.
      </p>
    </section>
  );
}

"use client";

import { useState } from "react";

/**
 * Document Builder — persistent Ask React bar (5.DUAL-BUILDER-1 / CS-6).
 *
 * Once a workflow has content, this unobtrusive bar lets the user ask the ONE
 * existing React Agent to add/change/explain/fix. Submitting it seeds + expands
 * the existing left agent rail (`onAskReact`) — it does NOT open a second
 * conversation, keep separate history, or send on its own; the rail's composer
 * owns submit. Presentational only.
 */
export function DocumentAskReactBar({
  onAskReact,
}: {
  onAskReact: (prompt: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onAskReact(trimmed);
    setValue("");
  };

  return (
    <div
      data-testid="document-ask-react-bar"
      className="sticky bottom-3 z-10 mx-auto mt-4 flex w-full max-w-[860px] items-center gap-2 rounded-full px-2 py-1.5"
      style={{
        background: "var(--builder-panel)",
        border: "1.5px solid var(--builder-border)",
        boxShadow: "0 12px 30px -18px rgba(0,0,0,.35)",
      }}
    >
      <span aria-hidden className="pl-2 text-[13px]" style={{ color: "var(--builder-muted)" }}>
        ✳
      </span>
      <input
        type="text"
        data-testid="document-ask-react-input"
        aria-label="Ask React"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask React to add, change, explain, or fix something…"
        className="min-w-0 flex-1 bg-transparent px-1 py-1 text-[13px] outline-none"
        style={{ color: "var(--builder-text)" }}
      />
      <button
        type="button"
        data-testid="document-ask-react-submit"
        onClick={submit}
        disabled={value.trim().length === 0}
        className="inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold disabled:opacity-40"
        style={{ background: "var(--builder-text)", color: "var(--builder-panel)" }}
      >
        Ask React
      </button>
    </div>
  );
}

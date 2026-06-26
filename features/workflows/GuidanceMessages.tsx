"use client";

import type { ReactNode } from "react";

/**
 * Presentational chat-message primitives for the conversational React Agent rail
 * (HERMES-AGENT-RAIL-CHAT-POLISH). Pure render — no state, no network, no logic. The transcript reads
 * like a chat: the user speaks in a right-offset bubble, React speaks as left-aligned text, and the
 * first thing React "says" is the intro/help copy (a normal scrollable message, not a sticky header).
 *
 * Colors use the builder theme tokens (ChainReact sky-blue accent), so light/dark mode and contrast are
 * inherited from `app/globals.css` — no hardcoded hex.
 */

/** Intro/help copy React opens with — rendered as the first scrollable assistant message. */
export const GUIDANCE_INTRO_TEXT =
  "Describe what you want to automate. I can suggest steps, show a preview on the canvas, and add them to your draft when you choose Apply. You stay in control before saving or activating.";

/** "React:" speaker label in the ChainReact accent — the assistant speaker styling. */
export function ReactSpeakerLabel() {
  return <span className="text-sm font-semibold text-[var(--builder-accent-strong)]">React:{" "}</span>;
}

/**
 * A right-offset, rounded user bubble (ChatGPT-like). The bubble itself — not just a label color — is
 * what distinguishes the user from React (requirement: bubble required). Long/multiline text wraps
 * cleanly and stays readable at narrow rail widths.
 */
export function UserMessageBubble({ text }: { text: string }) {
  return (
    <div data-testid="workflow-guidance-message-user" className="flex flex-col items-end">
      <span className="mb-0.5 pr-1 text-[11px] font-semibold text-[var(--builder-accent)]">You</span>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[var(--builder-accent-soft)] px-3 py-2 text-sm text-[var(--builder-text)]">
        {text}
      </div>
    </div>
  );
}

/** Left-aligned assistant text block: accent "React:" label + readable body. Used for plain React turns. */
export function AssistantMessage({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div {...(testId ? { "data-testid": testId } : {})}>
      <ReactSpeakerLabel />
      <span className="whitespace-pre-wrap text-sm text-[var(--builder-text-2)]">{children}</span>
    </div>
  );
}

/**
 * The first message in a fresh conversational rail: the intro/help copy, styled as a normal React
 * message. It lives INSIDE the transcript scroll container, so it scrolls away with the conversation
 * rather than staying pinned. Distinct testid (not `workflow-guidance-result`) so it never collides
 * with real assistant turns in queries.
 */
export function IntroAssistantMessage() {
  return (
    <div data-testid="workflow-guidance-intro">
      <AssistantMessage>{GUIDANCE_INTRO_TEXT}</AssistantMessage>
    </div>
  );
}

import type { ChatFillTarget } from "./useChatFillTarget";

/**
 * Slice 4.AI-CONFIG-ASSIST-3B — composer→chat-fill routing decision.
 *
 * Chat-fill is a normal product feature (NOT behind a flag). The AI composer
 * routes a typed value to chat-fill when a config field is currently highlighted
 * (the 2F "Open field" reveal set `configSlice.focusFieldKey`) AND we're not mid
 * plan-follow-up (a plan awaiting required-input details keeps the composer).
 * Otherwise the composer plans as before. Eligibility + value validation + the
 * Confirm step are applied downstream by `useChatFill`/CS-1/CS-2.
 *
 * Pure + deterministic; lives in its own module so it's unit-testable without
 * importing the whole panel tree.
 */
export function shouldRouteChatFill(
  target: ChatFillTarget | null,
  followUpMode: boolean,
): boolean {
  return target !== null && !followUpMode;
}

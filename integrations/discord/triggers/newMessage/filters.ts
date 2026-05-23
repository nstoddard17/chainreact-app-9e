import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";
import type { DiscordNewMessageConfig } from "./schema";

/**
 * Per-message filter for the Discord `new_message` trigger — Slice 3.DISCORD-7.
 *
 * Two optional filters compose with AND semantics:
 *   - `contentFilter` — non-empty array → message passes only if its
 *     `content` (lowercased) contains AT LEAST ONE of the listed
 *     keywords (lowercased). Empty array → no content constraint.
 *     Mirrors V1's keyword-list contains-OR semantics for the new_message
 *     trigger. The action handler's `fetch_messages.filterContent` is a
 *     single-keyword case-controlled match; the trigger uses the OR-array
 *     shape that matches V1's gateway trigger.
 *   - `authorFilter` — set → message passes only if `author.id` matches.
 *     Empty/undefined → no author constraint.
 *
 * Caveat called out in the meta description: Discord may strip
 * `content` to empty if the bot's `MESSAGE_CONTENT` privileged intent
 * isn't enabled in the Developer Portal. The filter still matches
 * (empty content never contains a non-empty keyword) — workflow
 * authors get the same "no matches" outcome as with the gateway, just
 * for a different reason. Operator documentation in
 * `missing-providers-status.md` surfaces the intent requirement.
 */
export function matchesNewMessageFilters(
  message: DiscordMessage,
  config: DiscordNewMessageConfig,
): boolean {
  // Author filter — single-value check first (cheaper).
  if (typeof config.authorFilter === "string" && config.authorFilter.length > 0) {
    if (message.author?.id !== config.authorFilter) return false;
  }

  // Content filter — OR-match across the keyword list. Empty array
  // means "no constraint".
  if (config.contentFilter.length > 0) {
    const haystack = (message.content ?? "").toLowerCase();
    let anyMatch = false;
    for (const needle of config.contentFilter) {
      if (haystack.includes(needle.toLowerCase())) {
        anyMatch = true;
        break;
      }
    }
    if (!anyMatch) return false;
  }

  return true;
}

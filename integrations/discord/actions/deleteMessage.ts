import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { DiscordApiError } from "../../_shared/discord/errors";
import {
  type DiscordMessage,
  messageDelete,
  messagesBulkDelete,
  messagesList,
} from "../../_shared/discord/api/messages";
import {
  DeleteMessageConfigSchema,
  type DeleteMessageKeywordMatchType,
} from "./deleteMessage.schema";

/**
 * Discord `delete_message` action handler — destructive, supports bulk.
 *
 * **Destructive bulk operation.** Discord retains no per-channel undelete;
 * once a message is deleted it is gone. This is the highest-impact
 * destructive action in the V1-port Discord surface — Slice 3.DISCORD-1
 * §4 classifies it HIGH + isDestructive + requiresConfirmation in the
 * future ActionMeta layer.
 *
 * **Filter routing (mirrors V1 lib/workflows/actions/discord.ts:980-1213):**
 *
 *   1. If `messageIds[]` is provided and non-empty: use those IDs
 *      directly. The per-channel message fetch is skipped.
 *
 *   2. Else if `userIds[]` or `keywords[]` is provided: fetch the most
 *      recent 100 messages in the channel and filter:
 *        - userId match: `author.id ∈ userIds`.
 *        - keyword match per `keywordMatchType` (partial / whole / exact).
 *      The two filters AND when both are present.
 *
 *   3. Else (no filters supplied): return `{ deletedCount: 0, ... }`
 *      WITHOUT calling Discord — refusing to delete an unbounded set is
 *      the safe default for a destructive bulk action.
 *
 * **Delete routing:**
 *   - 1 message: single DELETE `/channels/{id}/messages/{messageId}`.
 *   - 2-100 messages: POST `/channels/{id}/messages/bulk-delete`. All
 *     messages must be < 14 days old; older messages cause a 400 from
 *     Discord, which the handler catches and falls back to single
 *     DELETEs per id (mirroring V1's fallback).
 *   - >100 messages: chunk into 100-at-a-time bulk-deletes.
 *
 * Output shape:
 *   { deletedCount, failedCount, totalProcessed, messageIds, channelId, errors? }
 *
 * `errors[]` is only included when at least one single-message delete
 * failed (mirrors V1 line 1145). Bulk-delete success is all-or-nothing
 * per Discord's contract — partial success only happens on the
 * single-delete fallback path.
 */

const BULK_DELETE_MAX = 100;
const FILTER_FETCH_LIMIT = 100;

function keywordMatch(
  haystack: string,
  needle: string,
  mode: DeleteMessageKeywordMatchType,
): boolean {
  if (needle.length === 0) return false;
  if (mode === "exact") {
    return haystack.includes(needle);
  }
  if (mode === "whole") {
    const hay = haystack.toLowerCase();
    const escaped = needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(hay);
  }
  // "partial" (default)
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function filterMessages(
  messages: readonly DiscordMessage[],
  userIds: readonly string[],
  keywords: readonly string[],
  keywordMatchType: DeleteMessageKeywordMatchType,
): readonly string[] {
  const userFilter = userIds.length > 0 ? new Set(userIds) : null;
  const out: string[] = [];
  for (const msg of messages) {
    if (userFilter && !userFilter.has(msg.author?.id ?? "")) continue;
    if (keywords.length > 0) {
      const content = msg.content ?? "";
      const ok = keywords.some((k) => keywordMatch(content, k, keywordMatchType));
      if (!ok) continue;
    }
    out.push(msg.id);
  }
  return out;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export const deleteMessage: ActionHandler = async (input) => {
  const config = DeleteMessageConfigSchema.parse(input.config);

  const integration = await getActiveForExecution(input.accountId, "discord", null);
  if (!integration) {
    throw new Error("No active Discord integration found for this user.");
  }

  // Step 1: resolve the target message ID list.
  let targetIds: readonly string[];
  const explicitIds = config.messageIds ?? [];
  if (explicitIds.length > 0) {
    targetIds = explicitIds;
  } else {
    const userIds = config.userIds ?? [];
    const keywords = config.keywords ?? [];
    if (userIds.length === 0 && keywords.length === 0) {
      // Empty-filter guard: refuse to delete an unbounded set.
      return {
        output: {
          deletedCount: 0,
          failedCount: 0,
          totalProcessed: 0,
          messageIds: [],
          channelId: config.channelId,
        },
      };
    }
    const recent = await messagesList({
      channelId: config.channelId,
      limit: FILTER_FETCH_LIMIT,
    });
    targetIds = filterMessages(recent, userIds, keywords, config.keywordMatchType);
  }

  if (targetIds.length === 0) {
    return {
      output: {
        deletedCount: 0,
        failedCount: 0,
        totalProcessed: 0,
        messageIds: [],
        channelId: config.channelId,
      },
    };
  }

  // Step 2: route to single vs bulk.
  if (targetIds.length === 1) {
    const onlyId = targetIds[0]!;
    await messageDelete({
      channelId: config.channelId,
      messageId: onlyId,
    });
    return {
      output: {
        deletedCount: 1,
        failedCount: 0,
        totalProcessed: 1,
        messageIds: [onlyId],
        channelId: config.channelId,
      },
    };
  }

  // Bulk path: chunk into <=100 batches.
  const batches = chunk(targetIds, BULK_DELETE_MAX);
  let deletedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  const deletedIds: string[] = [];

  for (const batch of batches) {
    try {
      await messagesBulkDelete({
        channelId: config.channelId,
        messageIds: batch,
      });
      deletedCount += batch.length;
      deletedIds.push(...batch);
    } catch (err) {
      // Discord rejects bulk-delete for messages >14 days old (400) or
      // for any other batch-level constraint failure. Fall back to
      // per-message DELETE — mirrors V1 fallback at
      // lib/workflows/actions/discord.ts:1100-1145.
      if (err instanceof DiscordApiError && (err.status === 400 || err.status === 403)) {
        for (const id of batch) {
          try {
            await messageDelete({ channelId: config.channelId, messageId: id });
            deletedCount += 1;
            deletedIds.push(id);
          } catch (singleErr) {
            failedCount += 1;
            errors.push(
              `${id}: ${singleErr instanceof Error ? singleErr.message : "unknown"}`,
            );
          }
        }
      } else {
        throw err;
      }
    }
  }

  return {
    output: {
      deletedCount,
      failedCount,
      totalProcessed: targetIds.length,
      messageIds: deletedIds,
      channelId: config.channelId,
      ...(errors.length > 0 ? { errors } : {}),
    },
  };
};

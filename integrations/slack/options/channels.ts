import { decryptToken } from "@/core/encryption/tokens";
import { conversationsList } from "../api/conversationsList";
import { SlackApiError } from "../api/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";

/**
 * `slack:channels` options resolver — Slice 3.32.
 *
 * First real provider-backed resolver shipped on top of the Slice 3.30
 * options API + Slice 3.31 hook. Drives the combobox picker on
 * `slack:upload_file.channel`. Plan reference:
 * docs/slices/phase-3/options-source-plan.md §8.
 *
 * Behavior:
 *   - `requiresIntegration: true` — the route loads an active Slack
 *     integration row via `repositories/integrations.getActiveForExecution`
 *     before invocation. The resolver decrypts the bot token using the
 *     same `decryptToken` path as the Slack runtime handlers
 *     (`integrations/slack/actions/files/uploadFile.ts`) — never touches
 *     the raw encrypted blob.
 *   - No `requiredDeps` — channels are workspace-scoped; the picker
 *     opens against the connected workspace.
 *   - Calls `conversationsList` with
 *     `types: "public_channel,private_channel"`, `excludeArchived: true`,
 *     `limit: 200`. Slack's `conversations.list` does NOT accept a
 *     server-side query parameter, so search filtering happens
 *     client-side over the returned single page (case-insensitive
 *     substring match against the rendered label).
 *   - Maps each channel to an `OptionItem`:
 *     - `value`: Slack channel id (`C…` / `G…` / `D…`).
 *     - `label`: `#<name>` when Slack returns a name; falls back to the
 *       raw id (Slack DMs / shared channels can omit `name`).
 *     - `description`: optional `purpose.value` when present + non-
 *       empty. Trimmed defensively. Slack's `purpose` is workspace-
 *       admin-controlled metadata — safe to surface as picker context.
 *   - Drops records lacking an `id` (defensive; Slack guarantees it on
 *     success but the SDK type is `Record<string, unknown>`).
 *   - `hasMore` passes through from the wrapper (true when Slack
 *     returns a non-empty `next_cursor`). v1 does NOT plumb cursor
 *     pagination through the route / hook / renderer; the renderer
 *     surfaces a "refine search to narrow" hint instead.
 *
 * Error sanitization:
 *   - `SlackApiError` (logical Slack failure with an error code like
 *     `invalid_auth` / `missing_scope`) → re-thrown as
 *     `OptionsResolverError("PROVIDER_ERROR", …)` with a caller-friendly
 *     message. The raw Slack error code is dropped from the user-
 *     visible string (`invalid_auth` would tell an attacker the
 *     workspace exists; the picker just says "couldn't load").
 *   - Anything else thrown by the wrapper (network, decode, etc.)
 *     propagates so the route's catch-all maps to `SERVER_ERROR`.
 *   - Never logs the bot token, never echoes raw Slack response bodies.
 */

interface SlackChannelShape {
  id?: unknown;
  name?: unknown;
  purpose?: { value?: unknown };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractDescription(channel: SlackChannelShape): string | undefined {
  if (!channel.purpose || typeof channel.purpose !== "object") return undefined;
  const purposeValue = (channel.purpose as { value?: unknown }).value;
  if (typeof purposeValue !== "string") return undefined;
  const trimmed = purposeValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const slackChannelsResolver: OptionsResolver = {
  source: "slack:channels",
  provider: "slack",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      // The route guards against this — `requiresIntegration: true`
      // resolvers receive a non-null integration record OR the route
      // short-circuits with INTEGRATION_DISCONNECTED before dispatch.
      // Defensive throw classified the same way the route would.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Slack integration. Connect Slack first.",
      );
    }
    const botToken = decryptToken(ctx.integration.accessTokenEncrypted);

    let page;
    try {
      page = await conversationsList({
        botToken,
        types: "public_channel,private_channel",
        excludeArchived: true,
        limit: 200,
      });
    } catch (err) {
      if (err instanceof SlackApiError) {
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load Slack channels. Try again.",
        );
      }
      // Non-Slack error — surface to the route's catch-all so the
      // user sees SERVER_ERROR rather than a sanitized PROVIDER_ERROR.
      throw err;
    }

    const items = page.channels
      .map((raw) => {
        const channel = raw as SlackChannelShape;
        const id = asString(channel.id);
        if (!id) return null;
        const name = asString(channel.name);
        const label = name ? `#${name}` : id;
        const description = extractDescription(channel);
        return description !== undefined
          ? { value: id, label, description }
          : { value: id, label };
      })
      .filter((item): item is { value: string; label: string; description?: string } =>
        item !== null,
      );

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: page.hasMore,
    };
  },
};

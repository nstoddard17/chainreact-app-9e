import { discordBotRequest } from "./_request";

/**
 * Discord REST API v10 `users` resource wrappers — Slice 3.DISCORD-3
 * (options resolver layer).
 *
 * Endpoints covered:
 *   - GET /users/@me  (currentBotUser)
 *
 * Authenticated as the global bot via `Authorization: Bot <token>`, so
 * `GET /users/@me` returns the **bot's** identity (not the workflow
 * author's). The bot id is the only field consumers care about — it's
 * the value `discord:bot_messages` filters message authors against.
 *
 * Why not just read DISCORD_BOT_USER_ID from env? V1 supports an env
 * fallback for the bot id, but it's optional and frequently absent in
 * fresh deploys. Hitting `/users/@me` is one cheap HTTP call against
 * Discord's identity endpoint — no rate-limit class concerns, no
 * per-guild scope — and removes a config footgun. The resolver layer
 * uses this directly; a future caching layer could memoize the result
 * since the bot identity is stable for the lifetime of the deploy.
 */

export interface DiscordCurrentUser {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
}

export async function currentBotUser(): Promise<DiscordCurrentUser> {
  return discordBotRequest<DiscordCurrentUser>({
    method: "GET",
    path: "/users/@me",
    resourceForNotFound: "current bot user",
  });
}

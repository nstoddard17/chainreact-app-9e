import type { IntegrationRecord } from "@/repositories/integrations";
import type { OptionsResolverContext } from "@/services/options/types";

/**
 * Shared fixtures for Discord options resolver tests — Slice 3.DISCORD-3.
 */

export const baseIntegration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "discord",
  providerAccountId: "discord-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "ENC-R",
  accessTokenExpiresAt: null,
  scopes: ["identify", "email", "bot", "guilds"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

export function makeCtx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration: baseIntegration,
    q: "",
    deps: {},
    ...overrides,
  };
}

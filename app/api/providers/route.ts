import { NextResponse } from "next/server";
import { listProviders } from "@/integrations/_registry";
import { listProvidersWithMetadata } from "@/services/discovery/_registry";
import { requireUser } from "./_shared";

/**
 * GET /api/providers — list providers the builder can surface.
 *
 * Shape (stable; route tests pin):
 *   {
 *     providers: Array<{
 *       id: string;
 *       displayName: string;
 *       capabilities: { oauth, webhookTrigger, pollingTrigger, actions };
 *       isEnabled: boolean;
 *       isExperimental: boolean;
 *       hasMetadata: boolean;
 *     }>
 *   }
 *
 * `hasMetadata: true` indicates at least one action OR trigger meta is
 * registered for this provider — i.e. the builder can currently render
 * its config UI. Providers with `hasMetadata: false` still appear in
 * the list so the UI can render them as "coming soon" rather than
 * silently hiding them.
 *
 * Native is exposed as a synthetic provider (`id: "native"`) for
 * uniform consumption. Even though native lacks a ProviderManifest (no
 * OAuth / scopes / health checks), it has metadata; the UI library
 * panel surfaces it alongside OAuth providers.
 *
 * Read-only. No write surface. Returns 200 + stable shape; no
 * provider-specific error paths.
 */

interface ProviderListEntry {
  id: string;
  displayName: string;
  capabilities: {
    oauth: boolean;
    webhookTrigger: boolean;
    pollingTrigger: boolean;
    actions: boolean;
  };
  isEnabled: boolean;
  isExperimental: boolean;
  hasMetadata: boolean;
}

const NATIVE_PROVIDER_ID = "native";

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const providersWithMeta = new Set(listProvidersWithMetadata());

  const oauthProviderEntries: ProviderListEntry[] = listProviders().map(
    (m) => ({
      id: m.id,
      displayName: m.displayName,
      capabilities: { ...m.capabilities },
      isEnabled: m.isEnabled,
      isExperimental: m.isExperimental,
      hasMetadata: providersWithMeta.has(m.id),
    }),
  );

  const entries: ProviderListEntry[] = [...oauthProviderEntries];
  if (providersWithMeta.has(NATIVE_PROVIDER_ID)) {
    entries.push({
      id: NATIVE_PROVIDER_ID,
      displayName: "Native",
      capabilities: {
        oauth: false,
        webhookTrigger: false,
        pollingTrigger: false,
        actions: true,
      },
      isEnabled: true,
      isExperimental: false,
      hasMetadata: true,
    });
  }

  // Sort by displayName for stability — route tests assert this.
  entries.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ providers: entries });
}

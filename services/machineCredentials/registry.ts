import type { ProviderMachineAuth } from "./types";
import { adpMachineAuth } from "@/integrations/adp/auth";

/**
 * Registry of providers that use the machine (client_credentials + mTLS) auth
 * flow. Parallel to the OAuth dispatcher's `OAUTH_BY_PROVIDER` and
 * `TOKEN_INGEST_BY_PROVIDER` — hand-maintained so explicit imports surface in PRs.
 *
 * Empty until the ADP provider lands + is enabled (ADP registers itself here in
 * its own slice). A provider whose manifest declares
 * `authFlow: 'machine_credentials'` but is absent here fails connect with a clear
 * "not registered" error rather than silently.
 */
const MACHINE_AUTH_BY_PROVIDER: Readonly<Record<string, ProviderMachineAuth>> =
  Object.freeze({
    // ADP config is present so connect is READY when Marcus enables the manifest;
    // the manifest's `isEnabled: false` is what blocks connect until owner setup.
    adp: adpMachineAuth,
  });

export function getMachineAuth(provider: string): ProviderMachineAuth | undefined {
  return MACHINE_AUTH_BY_PROVIDER[provider];
}

export function isMachineAuthProvider(provider: string): boolean {
  return provider in MACHINE_AUTH_BY_PROVIDER;
}

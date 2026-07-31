import type { LiveTriggerCaptureAdapter } from "./types";

/**
 * Live-trigger capture adapter registry (WORKFLOW-LIVE-TEST-3 §6).
 *
 * Explicit-registration map keyed `${providerId}:${eventType}`, following the provider-registry
 * convention (imports surface in PRs; nothing auto-discovers). PRODUCTION REGISTRATIONS: none in
 * this batch — the Gmail adapter arrives in the next slice and registers here. Until a provider
 * registers, `getLiveTriggerCaptureAdapter` returns undefined and the prepare service answers
 * with a typed `trigger_capture_unsupported` — an unsupported trigger is a visible, typed
 * refusal, never a pretend capability.
 *
 * Tests register synthetic adapters through the same function and MUST clean up via the returned
 * unregister handle (or `resetLiveTriggerCaptureRegistryForTests`). No user-visible fake
 * provider ever ships through this seam: registration happens at module scope in server code,
 * which a browser cannot reach.
 */

const adapters = new Map<string, LiveTriggerCaptureAdapter>();

const keyOf = (providerId: string, eventType: string) => `${providerId}:${eventType}`;

/** Register an adapter. Throws on duplicate — two adapters for one trigger is a wiring bug. */
export function registerLiveTriggerCaptureAdapter(
  adapter: LiveTriggerCaptureAdapter,
): () => void {
  const key = keyOf(adapter.providerId, adapter.eventType);
  if (adapters.has(key)) {
    throw new Error(`Duplicate live-capture adapter registered for ${key}.`);
  }
  adapters.set(key, adapter);
  return () => {
    // Handle-scoped unregister: only removes THIS registration.
    if (adapters.get(key) === adapter) adapters.delete(key);
  };
}

export function getLiveTriggerCaptureAdapter(
  providerId: string,
  eventType: string,
): LiveTriggerCaptureAdapter | undefined {
  return adapters.get(keyOf(providerId, eventType));
}

/** Whether live capture is supported for a trigger — the prepare service's capability check. */
export function isLiveCaptureSupported(providerId: string, eventType: string): boolean {
  return adapters.has(keyOf(providerId, eventType));
}

/** TEST-ONLY: wipe all registrations between suites. */
export function resetLiveTriggerCaptureRegistryForTests(): void {
  adapters.clear();
}

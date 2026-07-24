/**
 * The two apps that participate in the Motive⇄Fleetio vehicle-links "bridge"
 * (APPS-VL-DESIGN-1). Used to decide which connected cards show the inline
 * "Vehicle links" chip. Client-safe (no server imports).
 */
export const BRIDGE_PROVIDER_IDS: ReadonlySet<string> = new Set(["motive", "fleetio"]);

export function isBridgeProvider(providerId: string): boolean {
  return BRIDGE_PROVIDER_IDS.has(providerId);
}

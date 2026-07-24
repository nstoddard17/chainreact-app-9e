/** @jest-environment node */
import {
  AI_PROVIDER_DISPLAY_NAME,
  AI_PROVIDER_ID,
  CONNECTIONLESS_PROVIDERS,
  NATIVE_PROVIDER_ID,
  isConnectionlessProvider,
} from "@/core/integrations/connectionlessProviders";

describe("connectionless providers", () => {
  it("native and ai are connectionless", () => {
    expect(isConnectionlessProvider("native")).toBe(true);
    expect(isConnectionlessProvider("ai")).toBe(true);
    expect(CONNECTIONLESS_PROVIDERS).toEqual(["native", "ai"]);
  });

  it("connection-backed integration providers are NOT connectionless", () => {
    for (const provider of [
      "slack",
      "gmail",
      "notion",
      "hubspot",
      "stripe",
      "microsoft-excel",
      "fleetio",
    ]) {
      expect(isConnectionlessProvider(provider)).toBe(false);
    }
  });

  it("fails safe for unknown / empty / nullish providers", () => {
    expect(isConnectionlessProvider("totally-unknown")).toBe(false);
    expect(isConnectionlessProvider("")).toBe(false);
    expect(isConnectionlessProvider(undefined)).toBe(false);
    expect(isConnectionlessProvider(null)).toBe(false);
    // Prototype names must not resolve through the backing Set.
    expect(isConnectionlessProvider("toString")).toBe(false);
    expect(isConnectionlessProvider("constructor")).toBe(false);
  });

  it("exposes stable ids and the user-facing AI name", () => {
    expect(NATIVE_PROVIDER_ID).toBe("native");
    expect(AI_PROVIDER_ID).toBe("ai");
    expect(AI_PROVIDER_DISPLAY_NAME).toBe("ChainReact AI");
  });
});

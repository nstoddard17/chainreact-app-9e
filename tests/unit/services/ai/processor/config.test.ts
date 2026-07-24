/** @jest-environment node */
import {
  AI_PROCESSOR_ENV,
  describeAiProcessorConfigStatus,
  getAiProcessorConfig,
  isAiProcessorEnabled,
} from "@/services/ai/processor/config";

const ENV_KEYS = Object.values(AI_PROCESSOR_ENV);

describe("services/ai/processor/config", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function enableWithGateway() {
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[AI_PROCESSOR_ENV.gatewayToken] = "secret-token-value";
  }

  it("defaults OFF: disabled → null config, not enabled", () => {
    expect(isAiProcessorEnabled()).toBe(false);
    expect(getAiProcessorConfig()).toBeNull();
  });

  it("enabled but missing gateway credentials → null (NOT_CONFIGURED)", () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    expect(getAiProcessorConfig()).toBeNull();
    const status = describeAiProcessorConfigStatus();
    expect(status.enabled).toBe(true);
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      AI_PROCESSOR_ENV.gatewayUrl,
      AI_PROCESSOR_ENV.gatewayToken,
    ]);
  });

  it("well-configured gateway provider parses with defaults", () => {
    enableWithGateway();
    const config = getAiProcessorConfig();
    expect(config).toEqual({
      provider: "gateway",
      timeoutMs: 60_000,
      maxInputChars: 150_000,
      gateway: { url: "https://gw.example.com", token: "secret-token-value" },
    });
  });

  it("an unrecognized provider value fails CLOSED (null), never coerced", () => {
    enableWithGateway();
    process.env[AI_PROCESSOR_ENV.provider] = "gemini-direct";
    expect(getAiProcessorConfig()).toBeNull();
    expect(describeAiProcessorConfigStatus().missing).toContain(
      AI_PROCESSOR_ENV.provider,
    );
  });

  it("first_party provider needs no gateway credentials", () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.provider] = "first_party";
    const config = getAiProcessorConfig();
    expect(config?.provider).toBe("first_party");
    expect(config?.gateway).toBeUndefined();
  });

  it("timeout and input-chars clamp to the safe ranges", () => {
    enableWithGateway();
    process.env[AI_PROCESSOR_ENV.timeoutMs] = "1";
    process.env[AI_PROCESSOR_ENV.maxInputChars] = "999999999";
    let config = getAiProcessorConfig();
    expect(config?.timeoutMs).toBe(5_000);
    expect(config?.maxInputChars).toBe(500_000);

    process.env[AI_PROCESSOR_ENV.timeoutMs] = "not-a-number";
    process.env[AI_PROCESSOR_ENV.maxInputChars] = "-5";
    config = getAiProcessorConfig();
    expect(config?.timeoutMs).toBe(60_000);
    expect(config?.maxInputChars).toBe(1_000);
  });

  it("status never contains the token value", () => {
    enableWithGateway();
    const status = describeAiProcessorConfigStatus();
    expect(JSON.stringify(status)).not.toContain("secret-token-value");
  });
});

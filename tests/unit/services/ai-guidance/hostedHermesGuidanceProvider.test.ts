/**
 * @jest-environment node
 *
 * Hosted Hermes adapter gating (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 * Proves the adapter is OFF by default, reads no config / makes no call when disabled,
 * needs all HERMES_* env when enabled, and — in this foundation slice — can make NO live
 * call because no transport is wired. A transport is only invoked when flag+config+transport
 * all align (and even then it's an INJECTED fake — no real network).
 */

import {
  createHostedHermesGuidanceProvider,
  hostedHermesGuidanceProvider,
} from "@/services/ai-guidance/hostedHermesGuidanceProvider";
import { HOSTED_HERMES_GUIDANCE_FLAG } from "@/services/ai-guidance/flags";
import { HERMES_ENV } from "@/services/ai-guidance/hermesConfig";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1, guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

const ENV_KEYS = [HOSTED_HERMES_GUIDANCE_FLAG, HERMES_ENV.baseUrl, HERMES_ENV.apiKey, HERMES_ENV.model, HERMES_ENV.timeoutMs, HERMES_ENV.providerFormat];
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function configure() {
  process.env[HERMES_ENV.baseUrl] = "https://hermes.example/v1";
  process.env[HERMES_ENV.apiKey] = "test-key-not-real";
  process.env[HERMES_ENV.model] = "Hermes-Test";
}

describe("hosted Hermes adapter — gating", () => {
  it("flag OFF (default) → PROVIDER_DISABLED; transport never consulted", async () => {
    const transport = jest.fn();
    const provider = createHostedHermesGuidanceProvider({ transport });
    const res = await provider.getWorkflowGuidance(REQUEST);
    expect(res).toEqual({ ok: false, code: "PROVIDER_DISABLED" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("flag ON but HERMES_* missing → PROVIDER_NOT_CONFIGURED; transport never called", async () => {
    process.env[HOSTED_HERMES_GUIDANCE_FLAG] = "true";
    const transport = jest.fn();
    const res = await createHostedHermesGuidanceProvider({ transport }).getWorkflowGuidance(REQUEST);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(transport).not.toHaveBeenCalled();
  });

  it("flag ON + configured but NO transport (this slice) → PROVIDER_NOT_CONFIGURED; no live call possible", async () => {
    process.env[HOSTED_HERMES_GUIDANCE_FLAG] = "true";
    configure();
    const res = await hostedHermesGuidanceProvider.getWorkflowGuidance(REQUEST); // default instance: no transport
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("flag ON + configured + INJECTED transport → delegates (only then); receives resolved config", async () => {
    process.env[HOSTED_HERMES_GUIDANCE_FLAG] = "true";
    process.env[HERMES_ENV.timeoutMs] = "5000";
    configure();
    const transport = jest.fn().mockResolvedValue({
      ok: true,
      response: { schemaVersion: 1, guidanceKind: "workflow_design", providerId: "hermes", suggestions: [] },
    });
    const res = await createHostedHermesGuidanceProvider({ transport }).getWorkflowGuidance(REQUEST);
    expect(res.ok).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    const [reqArg, cfgArg] = transport.mock.calls[0]!;
    expect(reqArg).toBe(REQUEST);
    expect(cfgArg).toMatchObject({ baseUrl: "https://hermes.example/v1", model: "Hermes-Test", timeoutMs: 5000 });
  });

  it("the default exported adapter NEVER calls out even when fully configured (no transport bundled)", async () => {
    process.env[HOSTED_HERMES_GUIDANCE_FLAG] = "true";
    configure();
    // The default instance carries no transport — proves the foundation ships nothing live.
    const res = await hostedHermesGuidanceProvider.getWorkflowGuidance(REQUEST);
    expect(res).toEqual({ ok: false, code: "PROVIDER_NOT_CONFIGURED", reason: "transport not wired (foundation slice)" });
  });
});

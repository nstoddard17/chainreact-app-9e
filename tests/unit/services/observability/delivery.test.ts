/** @jest-environment node */
/**
 * Tests for services/observability/delivery.
 *
 * Business rule: the structured log ALWAYS fires (guaranteed channel); the
 * outbound webhook is optional and ISOLATED — a missing URL, a non-2xx, or a
 * throw must never propagate (the alert is already recorded by the evaluator).
 * The delivered payload carries only safe fields.
 */
import { jest } from "@jest/globals";
import { deliverOpsAlert } from "@/services/observability/delivery";
import type { OpsAlertCandidate } from "@/contracts/opsAlert";

function candidate(): OpsAlertCandidate {
  return {
    category: "provider_failure_rate",
    severity: "critical",
    dedupeKey: "provider_failure_rate:slack",
    windowLabel: "15m",
    count: 49,
    context: { provider: "slack", attempts: 50, failures: 49 },
    recommendedAction: "check provider status",
  };
}

describe("deliverOpsAlert", () => {
  let infoSpy: jest.SpiedFunction<typeof console.info>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("always logs and reports no webhook when none is configured", async () => {
    const result = await deliverOpsAlert(candidate(), {});
    expect(result).toEqual({ logged: true, webhookDelivered: null });
    const logged = infoSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("ops.alert.fired");
    // safe fields only — no token/payload shapes
    expect(logged).not.toMatch(/xox[bap]-|whsec_|Bearer\s|@/);
  });

  it("POSTs to the configured webhook and reports success on 2xx", async () => {
    const fetchMock = jest.fn(async (_url: string, _init: { body?: string }) => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await deliverOpsAlert(candidate(), { OPS_ALERT_WEBHOOK_URL: "https://hook.example/x" });
    expect(result).toEqual({ logged: true, webhookDelivered: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.text).toContain("provider_failure_rate");
    expect(body.content).toContain("provider_failure_rate"); // Slack + Discord shapes
  });

  it("reports webhook failure (not throw) on a non-2xx response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const result = await deliverOpsAlert(candidate(), { OPS_ALERT_WEBHOOK_URL: "https://hook.example/x" });
    expect(result).toEqual({ logged: true, webhookDelivered: false });
  });

  it("isolates a fetch throw and never propagates it", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await deliverOpsAlert(candidate(), { OPS_ALERT_WEBHOOK_URL: "https://hook.example/x" });
    expect(result).toEqual({ logged: true, webhookDelivered: false });
    expect(errorSpy).toHaveBeenCalled();
  });
});

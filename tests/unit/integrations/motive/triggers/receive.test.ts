/**
 * @jest-environment node
 *
 * MOTIVE-1 — webhook receive: HMAC-SHA1 verification (valid/invalid/missing),
 * strict-direct row resolution, unverifiable secretless row, and normalized
 * event shape (companyId-scoped, id-based dedup key).
 */
import { createHmac } from "node:crypto";

const mockFindByWorkflowAndNode = jest.fn();
jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...a: unknown[]) => mockFindByWorkflowAndNode(...a),
}));

import { encryptToken } from "@/core/encryption/tokens";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveMotiveWebhook } from "@/integrations/motive/triggers/_shared/receive";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17) % 256;
  return bytes.toString("base64");
})();

const SECRET = "0123456789abcdef0123"; // 20 chars

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

function sign(body: string): string {
  return createHmac("sha1", SECRET).update(body, "utf8").digest("hex");
}

function armedRow(eventType: string) {
  return {
    id: "tr-1",
    provider: "motive",
    eventType,
    providerAccountId: "8801",
    config: { hookSecretEncrypted: encryptToken(SECRET), companyId: "8801" },
  };
}

function req(body: string, headers: Record<string, string> = {}) {
  return {
    request: {
      url: "https://app.example.test/api/webhooks/motive?workflowId=wf-1&nodeId=node-1",
      headers: new Headers(headers),
    } as unknown as Request,
    rawBody: body,
  };
}

describe("receiveMotiveWebhook", () => {
  it("verifies a valid signature and normalizes a company-scoped event", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(armedRow("new_inspection_report"));
    const body = JSON.stringify({
      action: "inspection_report_upserted",
      inspection_report: { id: 555, vehicle_id: 12, driver_id: 5, status: "certified" },
    });
    const result = await receiveMotiveWebhook(req(body, { "x-kt-webhook-signature": sign(body) }));
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const ev = result.events[0]!;
    expect(ev.provider).toBe("motive");
    expect(ev.eventType).toBe("new_inspection_report");
    expect(ev.providerAccountId).toBe("8801");
    expect(ev.eventId).toBe("new_inspection_report:8801:555");
    expect(ev.payload).toMatchObject({ inspectionReportId: "555", vehicleId: "12", status: "certified" });
  });

  it("rejects a tampered signature with InvalidSignatureError", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(armedRow("new_fault_code"));
    const body = JSON.stringify({ action: "fault_code_opened", fault_code: { id: 1 } });
    await expect(
      receiveMotiveWebhook(req(body, { "x-kt-webhook-signature": "deadbeef".repeat(5) })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("rejects a missing signature header", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(armedRow("new_fault_code"));
    const body = JSON.stringify({ action: "fault_code_opened", fault_code: { id: 1 } });
    await expect(receiveMotiveWebhook(req(body))).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("quiet-acks an unknown workflow (no matching row)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const body = JSON.stringify({ action: "fault_code_opened" });
    const result = await receiveMotiveWebhook(req(body, { "x-kt-webhook-signature": sign(body) }));
    expect(result.kind).toBe("unknown_workflow");
  });

  it("treats a secretless row as unverifiable (never dispatches)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      id: "tr-1",
      provider: "motive",
      eventType: "new_fault_code",
      providerAccountId: "8801",
      config: { companyId: "8801" },
    });
    const body = JSON.stringify({ action: "fault_code_opened" });
    const result = await receiveMotiveWebhook(req(body, { "x-kt-webhook-signature": sign(body) }));
    expect(result.kind).toBe("unverifiable");
  });

  it("keys new_vehicle dedup on the entity id alone (first-seen upsert)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(armedRow("new_vehicle"));
    const body = JSON.stringify({ action: "vehicle_upserted", vehicle: { id: 12, number: "Truck 12" } });
    const result = await receiveMotiveWebhook(req(body, { "x-kt-webhook-signature": sign(body) }));
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.eventId).toBe("new_vehicle:8801:12");
  });
});

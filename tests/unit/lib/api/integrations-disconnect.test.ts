/**
 * @jest-environment node
 *
 * Tests for the CD-3 client API (lib/api/integrations): getIntegrationWorkflowImpact
 * + disconnectIntegration. Proves correct method + path, that success returns the
 * parsed DTO, and that failures throw IntegrationApiError carrying ONLY a safe
 * message (the route's typed `error`, or a generic fallback) — never a raw body.
 */
import {
  getIntegrationWorkflowImpact,
  disconnectIntegration,
  IntegrationApiError,
} from "@/lib/api/integrations";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("getIntegrationWorkflowImpact", () => {
  it("GETs the workflow-impact path and returns the parsed impact", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ affectedWorkflowCount: 2, workflows: [{ id: "w1", name: "A" }] }),
    );
    const res = await getIntegrationWorkflowImpact("acc 1", "int/1");
    expect(res.affectedWorkflowCount).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/accounts/acc%201/integrations/int%2F1/workflow-impact");
    expect(init).toEqual({ method: "GET" });
  });

  it("throws IntegrationApiError with the route's safe message on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Integration not found.", code: "INTEGRATION_NOT_FOUND" }, false, 404),
    );
    await expect(getIntegrationWorkflowImpact("acc-1", "int-1")).rejects.toMatchObject({
      name: "IntegrationApiError",
      message: "Integration not found.",
    });
  });
});

describe("disconnectIntegration", () => {
  it("DELETEs the integration path and returns the sanitized result", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ disconnected: true, alreadyDisconnected: false, providerRevoked: true, workflowsDisabled: 2 }),
    );
    const res = await disconnectIntegration("acc-1", "int-1");
    expect(res).toEqual({ disconnected: true, alreadyDisconnected: false, providerRevoked: true, workflowsDisabled: 2 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/accounts/acc-1/integrations/int-1");
    expect(init).toEqual({ method: "DELETE" });
  });

  it("throws a generic safe IntegrationApiError when the error body is absent (no raw leak)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    const err = await disconnectIntegration("acc-1", "int-1").catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationApiError);
    expect(err.message).toBe("Couldn't disconnect this app. Please try again.");
    // The thrown message is the fixed fallback — no status code / body detail.
    expect(err.message).not.toMatch(/500|not json/);
  });
});

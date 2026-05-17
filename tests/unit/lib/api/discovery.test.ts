/**
 * @jest-environment node
 *
 * Tests for lib/api/discovery.ts. Mocks global fetch.
 *
 * Mirrors the convention of lib/api/workflows.test.ts: each operation
 * asserts URL + method + body and verifies DiscoveryApiError mapping for
 * non-2xx responses.
 */
import {
  DiscoveryApiError,
  listNativeActions,
  listNativeTriggers,
  listProviderActions,
  listProviderTriggers,
  listProviders,
} from "@/lib/api/discovery";

const SAMPLE_PROVIDER: import("@/lib/api/discovery").ProviderSummary = {
  id: "native",
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
};

const SAMPLE_ACTION = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Make an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
};

const SAMPLE_TRIGGER = {
  key: "native:schedule.fired",
  provider: "native",
  type: "schedule.fired",
  displayName: "Scheduled Trigger",
  description: "Fires on a cron schedule.",
  category: "scheduling",
  activation: "scheduled",
  requiresIntegration: false,
  fields: [],
  payloadShape: [],
  displayOrder: 20,
};

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("listProviders", () => {
  it("GETs /api/providers and returns providers array", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ providers: [SAMPLE_PROVIDER] }),
        { status: 200 },
      ),
    );
    const result = await listProviders();
    expect(result).toEqual([SAMPLE_PROVIDER]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/providers");
  });

  it("propagates a 401 as DiscoveryApiError code UNAUTHENTICATED", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }),
    );
    await expect(listProviders()).rejects.toMatchObject({
      name: "DiscoveryApiError",
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("falls back to a generic message on non-JSON server response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("oops", { status: 500 }),
    );
    await expect(listProviders()).rejects.toMatchObject({
      code: "SERVER_ERROR",
      message: expect.stringMatching(/HTTP 500/),
    });
  });
});

describe("listProviderActions", () => {
  it("GETs /api/providers/<id>/actions and returns actions array", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ provider: "native", actions: [SAMPLE_ACTION] }),
        { status: 200 },
      ),
    );
    const result = await listProviderActions("native");
    expect(result).toEqual([SAMPLE_ACTION]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/providers/native/actions");
  });

  it("surfaces server-supplied PROVIDER_NOT_FOUND on 404", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "not found", code: "PROVIDER_NOT_FOUND" }),
        { status: 404 },
      ),
    );
    await expect(listProviderActions("ghost")).rejects.toMatchObject({
      code: "PROVIDER_NOT_FOUND",
      status: 404,
    });
  });

  it("URL-encodes the provider id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ provider: "x", actions: [] }), { status: 200 }),
    );
    await listProviderActions("with/slash");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "/api/providers/with%2Fslash/actions",
    );
  });
});

describe("listProviderTriggers", () => {
  it("GETs /api/providers/<id>/triggers and returns triggers array", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ provider: "native", triggers: [SAMPLE_TRIGGER] }),
        { status: 200 },
      ),
    );
    const result = await listProviderTriggers("native");
    expect(result).toEqual([SAMPLE_TRIGGER]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/providers/native/triggers");
  });

  it("propagates a 404 with no server-code as PROVIDER_NOT_FOUND", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    await expect(listProviderTriggers("ghost")).rejects.toMatchObject({
      code: "PROVIDER_NOT_FOUND",
    });
  });
});

describe("listNativeActions / listNativeTriggers", () => {
  it("listNativeActions GETs /api/native/actions", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ provider: "native", actions: [SAMPLE_ACTION] }),
        { status: 200 },
      ),
    );
    const result = await listNativeActions();
    expect(result).toEqual([SAMPLE_ACTION]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/native/actions");
  });

  it("listNativeTriggers GETs /api/native/triggers", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ provider: "native", triggers: [SAMPLE_TRIGGER] }),
        { status: 200 },
      ),
    );
    const result = await listNativeTriggers();
    expect(result).toEqual([SAMPLE_TRIGGER]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/native/triggers");
  });
});

describe("DiscoveryApiError code mapping", () => {
  it("unknown server code resolves to UNKNOWN", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "x", code: "WHO_KNOWS" }), { status: 418 }),
    );
    await expect(listProviders()).rejects.toBeInstanceOf(DiscoveryApiError);
    await expect(listProviders()).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});

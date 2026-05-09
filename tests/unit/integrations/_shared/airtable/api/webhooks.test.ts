/**
 * @jest-environment node
 *
 * Tests for the Airtable webhook API wrappers — webhooksCreate /
 * webhooksDelete / webhooksRefresh / webhooksListPayloads.
 */
import {
  webhooksCreate,
  webhooksDelete,
  webhooksListPayloads,
  webhooksRefresh,
} from "@/integrations/_shared/airtable/api/webhooks";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(json: unknown, status = 200) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(json), { status }));
}

const BASE = "appBASE";
const WEBHOOK = "achWEBHOOK";

// ─── webhooksCreate ─────────────────────────────────────────────────────────

describe("webhooksCreate", () => {
  it("POSTs to /v0/bases/{baseId}/webhooks with notificationUrl + tableData filter", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "achNEW",
          macSecretBase64: "secret",
          expirationTime: "2026-05-16T00:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const result = await webhooksCreate({
      accessToken: "tok",
      baseId: BASE,
      notificationUrl: "https://app.example.test/api/webhooks/airtable?workflowId=wf&nodeId=n",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/bases/${BASE}/webhooks`,
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/airtable?workflowId=wf&nodeId=n",
    );
    expect(body.specification.options.filters.dataTypes).toEqual(["tableData"]);
    expect(body.specification.options.filters.recordChangeScope).toBeUndefined();
    expect(result.id).toBe("achNEW");
    expect(result.macSecretBase64).toBe("secret");
    expect(result.expirationTime).toBe("2026-05-16T00:00:00.000Z");
  });

  it("threads recordChangeScope into the spec filters when supplied", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "achNEW",
          macSecretBase64: "s",
          expirationTime: "x",
        }),
        { status: 200 },
      ),
    );
    await webhooksCreate({
      accessToken: "tok",
      baseId: BASE,
      notificationUrl: "https://x/api/webhooks/airtable",
      specification: {
        dataTypes: ["tableData"],
        recordChangeScope: "tblTASKS",
      },
    });
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.specification.options.filters.recordChangeScope).toBe("tblTASKS");
  });
});

// ─── webhooksDelete ─────────────────────────────────────────────────────────

describe("webhooksDelete", () => {
  it("DELETEs /v0/bases/{baseId}/webhooks/{webhookId}", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await webhooksDelete({
      accessToken: "tok",
      baseId: BASE,
      webhookId: WEBHOOK,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/bases/${BASE}/webhooks/${WEBHOOK}`,
    );
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("DELETE");
  });
});

// ─── webhooksRefresh ────────────────────────────────────────────────────────

describe("webhooksRefresh", () => {
  it("POSTs to /v0/bases/{baseId}/webhooks/{webhookId}/refresh and returns expirationTime", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ expirationTime: "2026-05-23T00:00:00.000Z" }),
        { status: 200 },
      ),
    );
    const result = await webhooksRefresh({
      accessToken: "tok",
      baseId: BASE,
      webhookId: WEBHOOK,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/bases/${BASE}/webhooks/${WEBHOOK}/refresh`,
    );
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("POST");
    expect(result.expirationTime).toBe("2026-05-23T00:00:00.000Z");
  });
});

// ─── webhooksListPayloads ──────────────────────────────────────────────────

describe("webhooksListPayloads", () => {
  it("GETs /v0/bases/{baseId}/webhooks/{webhookId}/payloads with cursor query param", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payloads: [],
          cursor: 5,
          mightHaveMore: false,
        }),
        { status: 200 },
      ),
    );
    await webhooksListPayloads({
      accessToken: "tok",
      baseId: BASE,
      webhookId: WEBHOOK,
      cursor: 4,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(`/v0/bases/${BASE}/webhooks/${WEBHOOK}/payloads`);
    expect(url).toContain("cursor=4");
    expect(fetchSpy.mock.calls[0]![1]!.method).toBe("GET");
  });

  it("OMITs the cursor query param when undefined (first call)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ payloads: [], cursor: 1, mightHaveMore: false }),
        { status: 200 },
      ),
    );
    await webhooksListPayloads({
      accessToken: "tok",
      baseId: BASE,
      webhookId: WEBHOOK,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).not.toContain("cursor=");
  });

  it("returns the response shape { payloads, cursor, mightHaveMore }", async () => {
    mockFetchOnce({
      payloads: [
        { timestamp: "2026-05-09T00:00:00Z", baseTransactionNumber: 1 },
      ],
      cursor: 2,
      mightHaveMore: true,
    });
    const result = await webhooksListPayloads({
      accessToken: "tok",
      baseId: BASE,
      webhookId: WEBHOOK,
      cursor: 1,
    });
    expect(result.payloads).toHaveLength(1);
    expect(result.cursor).toBe(2);
    expect(result.mightHaveMore).toBe(true);
  });
});

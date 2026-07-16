/**
 * @jest-environment node
 *
 * Wrapper-level tests for the multipart import upload — required per the
 * provider spec because the wrapper hand-rolls fetch (multipart body).
 * Asserts URL/query correctness, that the multipart body carries the
 * exact bytes under part name "file" with filename = datasetDisplayName,
 * 401 → Unauthorized401Error mapping, 404 → NotFoundError, and error
 * sanitization (envelope message only — never the raw body / token).
 */
import { importPost } from "@/integrations/microsoft-powerbi/api/imports/importPost";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  status: number;
  json?: unknown;
  bodyText?: string;
}) {
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status: opts.status }));
}

const BYTES = new Uint8Array([0x50, 0x42, 0x49, 0x58, 0x00, 0xff, 0x10]);

function baseInput() {
  return {
    accessToken: "tok-secret",
    groupId: "ws-1",
    datasetDisplayName: "Report.pbix",
    nameConflict: "Abort" as const,
    fileBytes: BYTES,
  };
}

describe("importPost wrapper (multipart)", () => {
  it("POSTs multipart to the imports endpoint with datasetDisplayName + nameConflict query", async () => {
    const fetchSpy = mockFetchOnce({ status: 200, json: { id: "imp-1" } });

    const result = await importPost(baseInput());

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/myorg/groups/ws-1/imports?");
    const query = new URL(url).searchParams;
    expect(query.get("datasetDisplayName")).toBe("Report.pbix");
    expect(query.get("nameConflict")).toBe("Abort");
    expect(query.has("skipReport")).toBe(false);

    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    // Content-Type must come from FormData (boundary) — never hand-set.
    expect(
      (init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();

    expect(result).toEqual({ importId: "imp-1", importState: null });
  });

  it("carries the exact file bytes as part 'file' with filename = datasetDisplayName", async () => {
    const fetchSpy = mockFetchOnce({ status: 202, json: { id: "imp-2" } });

    await importPost(baseInput());

    const init = fetchSpy.mock.calls[0]![1]!;
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const part = form.get("file") as File;
    expect(part).not.toBeNull();
    expect(part.name).toBe("Report.pbix");
    const sent = new Uint8Array(await part.arrayBuffer());
    expect(sent).toEqual(BYTES);
  });

  it("emits skipReport=true only when set (provider accepts only true)", async () => {
    const fetchSpy = mockFetchOnce({ status: 200, json: { id: "imp-3" } });

    await importPost({ ...baseInput(), skipReport: true });

    const query = new URL(fetchSpy.mock.calls[0]![0] as string).searchParams;
    expect(query.get("skipReport")).toBe("true");
  });

  it("surfaces importState when the provider includes it", async () => {
    mockFetchOnce({
      status: 200,
      json: { id: "imp-4", importState: "Publishing" },
    });

    const result = await importPost(baseInput());
    expect(result).toEqual({ importId: "imp-4", importState: "Publishing" });
  });

  it("throws when the 2xx response is missing the import id", async () => {
    mockFetchOnce({ status: 200, json: {} });

    await expect(importPost(baseInput())).rejects.toThrow(
      /missing the import id/,
    );
  });

  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({ status: 401, bodyText: "" });

    await expect(importPost(baseInput())).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("throws NotFoundError on HTTP 404 (workspace gone)", async () => {
    mockFetchOnce({
      status: 404,
      bodyText: '{"error":{"code":"PowerBIEntityNotFound"}}',
    });

    await expect(importPost(baseInput())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("sanitizes non-2xx errors — envelope message only, never raw body or bearer", async () => {
    mockFetchOnce({
      status: 400,
      bodyText:
        '{"error":{"code":"BadRequest","message":"Invalid file"},"debug":"raw-secret-leak Bearer xyz"}',
    });

    try {
      await importPost(baseInput());
      throw new Error("expected throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("Invalid file");
      expect(msg).not.toContain("raw-secret-leak");
      expect(msg).not.toContain("Bearer");
      expect(msg).not.toContain("tok-secret");
    }
  });
});

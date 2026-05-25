/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-4 — Monday multipart file-upload wrapper.
 *
 * Coverage: multipart body shape, GraphQL-injection guards on the
 * inlined item_id / column_id, error mapping (401/429/4xx/errors[]),
 * and no-leak of token / bytes in errors.
 */
import { addFileToColumn } from "@/integrations/_shared/monday/api/addFileToColumn";
import {
  MondayApiError,
  NotFoundError,
  RateLimitError,
} from "@/integrations/_shared/monday/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const SECRET_TOKEN = "secret-monday-token-DO-NOT-LEAK";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MONDAY_API_BASE;
});

function mockOnce(body: string, status = 200) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

const baseInput = {
  accessToken: SECRET_TOKEN,
  itemId: "12345",
  columnId: "files",
  bytes: new Uint8Array([1, 2, 3]),
  fileName: "report.pdf",
  mimeType: "application/pdf",
};

describe("addFileToColumn — injection guards", () => {
  it("rejects a non-numeric itemId before any network call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(
      addFileToColumn({ ...baseInput, itemId: '1) { x } #' }),
    ).rejects.toBeInstanceOf(MondayApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a columnId with unsafe characters before any network call", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(
      addFileToColumn({ ...baseInput, columnId: 'a" injected' }),
    ).rejects.toBeInstanceOf(MondayApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("addFileToColumn — request shape", () => {
  it("POSTs multipart/form-data to /v2/file with the bearer + API-Version", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { add_file_to_column: { id: "a-1", name: "report.pdf", url: "u" } },
          }),
          { status: 200 },
        ),
      );
    await addFileToColumn(baseInput);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.monday.com/v2/file");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET_TOKEN}`);
    expect(headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(headers["API-Version"]).toBe("2024-01");
    expect(init!.method).toBe("POST");
  });

  it("inlines item_id + column_id into the query part of the body", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { add_file_to_column: { id: "a-1", name: "x", url: null } },
          }),
          { status: 200 },
        ),
      );
    await addFileToColumn(baseInput);
    const body = fetchSpy.mock.calls[0]![1]!.body as Buffer;
    const text = body.toString("utf8");
    expect(text).toContain('name="query"');
    expect(text).toContain("item_id: 12345");
    expect(text).toContain('column_id: "files"');
    expect(text).toContain('name="variables[file]"; filename="report.pdf"');
    expect(text).toContain("Content-Type: application/pdf");
  });

  it("returns the created asset", async () => {
    mockOnce(
      JSON.stringify({
        data: { add_file_to_column: { id: "a-9", name: "report.pdf", url: "https://x" } },
      }),
    );
    const result = await addFileToColumn(baseInput);
    expect(result).toEqual({ id: "a-9", name: "report.pdf", url: "https://x" });
  });

  it("honors MONDAY_API_BASE override", async () => {
    process.env.MONDAY_API_BASE = "https://mock.monday.local";
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { add_file_to_column: { id: "a", name: "x", url: null } },
          }),
          { status: 200 },
        ),
      );
    await addFileToColumn(baseInput);
    expect(fetchSpy.mock.calls[0]![0]).toBe("https://mock.monday.local/v2/file");
  });
});

describe("addFileToColumn — error mapping", () => {
  it("HTTP 401 → Unauthorized401Error", async () => {
    mockOnce("{}", 401);
    await expect(addFileToColumn(baseInput)).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("HTTP 429 → RateLimitError", async () => {
    mockOnce("{}", 429);
    await expect(addFileToColumn(baseInput)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("HTTP 5xx → MondayApiError", async () => {
    mockOnce("{}", 500);
    await expect(addFileToColumn(baseInput)).rejects.toBeInstanceOf(
      MondayApiError,
    );
  });

  it("200 with not-found errors[] → NotFoundError", async () => {
    mockOnce(
      JSON.stringify({
        errors: [
          {
            message: "Item not found",
            extensions: { code: "ResourceNotFoundException" },
          },
        ],
      }),
    );
    await expect(addFileToColumn(baseInput)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("200 with other errors[] → MondayApiError", async () => {
    mockOnce(
      JSON.stringify({
        errors: [{ message: "bad", extensions: { code: "ValidationException" } }],
      }),
    );
    await expect(addFileToColumn(baseInput)).rejects.toBeInstanceOf(
      MondayApiError,
    );
  });

  it("never leaks the access token in thrown errors", async () => {
    mockOnce(JSON.stringify({ errors: [{ message: "bad" }] }));
    let caught: unknown;
    try {
      await addFileToColumn(baseInput);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).not.toContain(SECRET_TOKEN);
  });
});

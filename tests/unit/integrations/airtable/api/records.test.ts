/**
 * @jest-environment node
 */
import {
  recordsBatchCreate,
  recordsCreate,
  recordsDelete,
  recordsGet,
  recordsList,
  recordsUpdate,
} from "@/integrations/airtable/api/records";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(json: unknown, status = 200) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(json), { status }));
}

const BASE = "appBASE";
const TABLE = "tblTABLE";

describe("recordsList", () => {
  it("GETs /v0/{baseId}/{tableIdOrName}", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsList({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/${BASE}/${TABLE}`,
    );
  });

  it("URL-encodes table names with spaces", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsList({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: "My Table",
    });
    expect(fetchSpy.mock.calls[0]![0]).toContain("/My%20Table");
  });

  it("builds query params for filterByFormula / pageSize / maxRecords / offset / view", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsList({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      filterByFormula: "{Name}='Alice'",
      pageSize: 50,
      maxRecords: 200,
      offset: "OFFSETKEY",
      view: "Grid view",
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("filterByFormula=");
    expect(url).toContain("pageSize=50");
    expect(url).toContain("maxRecords=200");
    expect(url).toContain("offset=OFFSETKEY");
    expect(url).toContain("view=Grid+view");
  });

  it("passes fields as repeated fields[]= entries", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsList({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      fields: ["Name", "Score"],
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    // URLSearchParams encodes [] as %5B%5D.
    expect(url).toContain("fields%5B%5D=Name");
    expect(url).toContain("fields%5B%5D=Score");
  });

  it("passes sort as sort[i][field] / sort[i][direction]", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsList({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      sort: [
        { field: "Name", direction: "asc" },
        { field: "Score", direction: "desc" },
      ],
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("sort%5B0%5D%5Bfield%5D=Name");
    expect(url).toContain("sort%5B0%5D%5Bdirection%5D=asc");
    expect(url).toContain("sort%5B1%5D%5Bfield%5D=Score");
    expect(url).toContain("sort%5B1%5D%5Bdirection%5D=desc");
  });

  it("returns the records + offset shape", async () => {
    mockFetchOnce({
      records: [{ id: "rec1", fields: { Name: "Alice" } }],
      offset: "PAGE2",
    });
    const result = await recordsList({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.id).toBe("rec1");
    expect(result.offset).toBe("PAGE2");
  });
});

describe("recordsGet", () => {
  it("GETs /v0/{base}/{table}/{recordId}", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "rec1", fields: {} }), {
          status: 200,
        }),
      );
    await recordsGet({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      recordId: "rec1",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/${BASE}/${TABLE}/rec1`,
    );
    expect((fetchSpy.mock.calls[0]![1]!).method).toBe("GET");
  });
});

describe("recordsCreate", () => {
  it("POSTs to the table endpoint with { fields, typecast } body", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "recNEW", fields: { Name: "Alice" } }),
          { status: 200 },
        ),
      );
    const result = await recordsCreate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      fields: { Name: "Alice" },
      typecast: false,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/${BASE}/${TABLE}`,
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      fields: { Name: "Alice" },
      typecast: false,
    });
    expect(result.id).toBe("recNEW");
  });

  it("threads typecast: true through to the body", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "rec", fields: {} }), { status: 200 }),
      );
    await recordsCreate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      fields: {},
      typecast: true,
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.typecast).toBe(true);
  });
});

describe("recordsUpdate", () => {
  it("PATCHes /v0/{base}/{table}/{recordId} with { fields, typecast }", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "rec1", fields: { Name: "Bob" } }), {
          status: 200,
        }),
      );
    await recordsUpdate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      recordId: "rec1",
      fields: { Name: "Bob" },
      typecast: false,
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/${BASE}/${TABLE}/rec1`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      fields: { Name: "Bob" },
      typecast: false,
    });
  });
});

describe("recordsBatchCreate (Airtable 2.1 Commit 3)", () => {
  it("POSTs to the table endpoint with { records: [{fields}], typecast } body", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            records: [
              { id: "rec1", fields: { Name: "Alice" }, createdTime: "t" },
              { id: "rec2", fields: { Name: "Bob" }, createdTime: "t" },
            ],
          }),
          { status: 200 },
        ),
      );
    const result = await recordsBatchCreate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      records: [
        { fields: { Name: "Alice" } },
        { fields: { Name: "Bob" } },
      ],
      typecast: false,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/${BASE}/${TABLE}`,
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      records: [
        { fields: { Name: "Alice" } },
        { fields: { Name: "Bob" } },
      ],
      typecast: false,
    });
    expect(result.records).toHaveLength(2);
    expect(result.records[0]!.id).toBe("rec1");
    expect(result.records[1]!.id).toBe("rec2");
  });

  it("threads typecast: true through to the body", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsBatchCreate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      records: [{ fields: { Name: "Alice" } }],
      typecast: true,
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.typecast).toBe(true);
  });

  it("sends each record's fields as the only key inside the records[] entry (no extras)", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    // Pass an object that includes other keys to make sure they don't
    // smuggle through to the wire (wrapper picks `fields` only).
    await recordsBatchCreate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      records: [
        {
          fields: { Name: "Alice" },
          // @ts-expect-error — wrapper-level defensive selection guard.
          extra: "smuggled",
        },
      ],
      typecast: false,
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.records).toEqual([{ fields: { Name: "Alice" } }]);
    expect(body.records[0]).not.toHaveProperty("extra");
  });

  it("propagates Airtable 422 errors via airtableRequest", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              type: "INVALID_VALUE_FOR_COLUMN",
              message: "Invalid value for field 'Tags'",
            },
          }),
          { status: 422 },
        ),
      );
    await expect(
      recordsBatchCreate({
        accessToken: "tok",
        baseId: BASE,
        tableIdOrName: TABLE,
        records: [{ fields: { Name: "Alice" } }],
        typecast: false,
      }),
    ).rejects.toThrow();
  });

  it("URL-encodes the table segment", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
      );
    await recordsBatchCreate({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: "My Table",
      records: [{ fields: { Name: "Alice" } }],
      typecast: false,
    });
    expect(fetchSpy.mock.calls[0]![0]).toContain("/My%20Table");
  });
});

describe("recordsDelete", () => {
  it("DELETEs /v0/{base}/{table}/{recordId} and returns { id, deleted: true }", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "rec1", deleted: true }), {
          status: 200,
        }),
      );
    const result = await recordsDelete({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: TABLE,
      recordId: "rec1",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    expect(result.deleted).toBe(true);
    expect(result.id).toBe("rec1");
  });
});

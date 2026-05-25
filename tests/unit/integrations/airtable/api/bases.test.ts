/**
 * @jest-environment node
 */
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { tablesGet } from "@/integrations/airtable/api/tables";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(json: unknown, status = 200) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(json), { status }));
}

const BASE = "appBASE";

const SCHEMA = {
  tables: [
    {
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [
        { id: "fld1", name: "Name", type: "singleLineText" },
        { id: "fld2", name: "Done", type: "checkbox" },
      ],
      views: [{ id: "vw1", name: "Grid", type: "grid" }],
    },
    {
      id: "tbl2",
      name: "Users",
      primaryFieldId: "fld3",
      fields: [{ id: "fld3", name: "Email", type: "email" }],
      views: [{ id: "vw2", name: "Grid", type: "grid" }],
    },
  ],
};

// ─── basesGetSchema ─────────────────────────────────────────────────────────

describe("basesGetSchema", () => {
  it("GETs /v0/meta/bases/{baseId}/tables", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SCHEMA), { status: 200 }),
      );
    await basesGetSchema({
      accessToken: "tok",
      baseId: BASE,
      includeViews: true,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://api.airtable.com/v0/meta/bases/${BASE}/tables`,
    );
  });

  it("returns views when includeViews=true", async () => {
    mockFetchOnce(SCHEMA);
    const result = await basesGetSchema({
      accessToken: "tok",
      baseId: BASE,
      includeViews: true,
    });
    expect(result.tables[0]!.views).toBeDefined();
    expect(result.tables[0]!.views).toHaveLength(1);
  });

  it("strips views when includeViews=false (action-layer filter)", async () => {
    mockFetchOnce(SCHEMA);
    const result = await basesGetSchema({
      accessToken: "tok",
      baseId: BASE,
      includeViews: false,
    });
    for (const t of result.tables) {
      expect(t.views).toBeUndefined();
    }
    // Still returns name + fields.
    expect(result.tables[0]!.name).toBe("Tasks");
    expect(result.tables[0]!.fields).toHaveLength(2);
  });

  it("propagates 404 as NotFoundError(base <id>)", async () => {
    mockFetchOnce({ error: { type: "NOT_FOUND", message: "no base" } }, 404);
    let captured: unknown;
    try {
      await basesGetSchema({
        accessToken: "tok",
        baseId: BASE,
        includeViews: false,
      });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe(`base ${BASE}`);
  });
});

// ─── tablesGet ─────────────────────────────────────────────────────────────

describe("tablesGet", () => {
  it("returns the matching table by id", async () => {
    mockFetchOnce(SCHEMA);
    const result = await tablesGet({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: "tbl1",
      includeViews: true,
    });
    expect(result.id).toBe("tbl1");
    expect(result.name).toBe("Tasks");
  });

  it("returns the matching table by name", async () => {
    mockFetchOnce(SCHEMA);
    const result = await tablesGet({
      accessToken: "tok",
      baseId: BASE,
      tableIdOrName: "Users",
      includeViews: false,
    });
    expect(result.id).toBe("tbl2");
    expect(result.views).toBeUndefined();
  });

  it("throws NotFoundError when no table matches id or name", async () => {
    mockFetchOnce(SCHEMA);
    let captured: unknown;
    try {
      await tablesGet({
        accessToken: "tok",
        baseId: BASE,
        tableIdOrName: "Mystery",
        includeViews: false,
      });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(NotFoundError);
    expect((captured as NotFoundError).resource).toBe(`table ${BASE}/Mystery`);
    expect((captured as NotFoundError).message).toContain(
      "no table with id or name 'Mystery'",
    );
  });
});

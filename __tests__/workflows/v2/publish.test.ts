import { publishRevision, getLatestPublishedRevision } from "@/src/lib/workflows/builder/publish"

const tables: Record<string, any[]> = {
  flow_v2_revisions: [],
  flow_v2_published_revisions: [],
}

type Chain = {
  update: (values: any) => { eq: (column: string, value: any) => Promise<{ error: null }> }
  insert: (values: any) => Promise<{ error: null }>
  select: (columns: string) => Chain & { order: (col: string, opts: any) => Chain; limit: (n: number) => Chain; eq: (column: string, value: any) => Chain; maybeSingle: () => Promise<{ data: any; error: null }> }
  order: (column: string, opts: any) => Chain
  limit: (n: number) => Chain
  eq: (column: string, value: any) => Chain
  maybeSingle: () => Promise<{ data: any; error: null }>
}

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseServiceClient: jest.fn(async () => ({
    from: (table: string): Chain => {
      if (table === "flow_v2_revisions") {
        return {
          update(values: any) {
            return {
              eq: async (column: string, value: any) => {
                tables.flow_v2_revisions = tables.flow_v2_revisions.map((row) =>
                  row[column] === value ? { ...row, ...values } : row
                )
                return { error: null }
              },
            }
          },
          insert: async (values: any) => {
            tables[table].push(values)
            return { error: null }
          },
          select: () => ({
            order: function () {
              return this as any
            },
            limit: function () {
              return this as any
            },
            eq(column: string, value: any) {
              const data = tables.flow_v2_revisions.filter((row) => row[column] === value)
              return {
                order: this.order,
                limit: this.limit,
                eq: this.eq.bind({ ...this, eq: undefined }),
                maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
              } as any
            },
            maybeSingle: async () => ({ data: tables.flow_v2_revisions[0] ?? null, error: null }),
          }) as any,
          order: () => ({ limit: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tables.flow_v2_revisions[0] ?? null, error: null }) }) }) }) as any,
          limit: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tables.flow_v2_revisions[0] ?? null, error: null }) }) }) as any,
          eq: () => ({ maybeSingle: async () => ({ data: tables.flow_v2_revisions[0] ?? null, error: null }) }) as any,
          maybeSingle: async () => ({ data: tables.flow_v2_revisions[0] ?? null, error: null }),
        } as any
      }
      if (table === "flow_v2_published_revisions") {
        return {
          update: () => ({ eq: async () => ({ error: null }) }),
          insert: async (values: any) => {
            tables.flow_v2_published_revisions.push(values)
            return { error: null }
          },
          select: () => ({
            order: function () {
              tables.flow_v2_published_revisions.sort((a, b) =>
                new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
              )
              return this as any
            },
            limit: function () {
              return this as any
            },
            eq: function (column: string, value: any) {
              const filtered = tables.flow_v2_published_revisions.filter((row) => row[column] === value)
              return {
                order: this.order,
                limit: this.limit,
                eq: this.eq,
                maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
              } as any
            },
            maybeSingle: async () => ({ data: tables.flow_v2_published_revisions[0] ?? null, error: null }),
          }) as any,
          order: () => ({ limit: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tables.flow_v2_published_revisions[0] ?? null, error: null }) }) }) }) as any,
          limit: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tables.flow_v2_published_revisions[0] ?? null, error: null }) }) }) as any,
          eq: () => ({ maybeSingle: async () => ({ data: tables.flow_v2_published_revisions[0] ?? null, error: null }) }) as any,
          maybeSingle: async () => ({ data: tables.flow_v2_published_revisions[0] ?? null, error: null }),
        } as any
      }
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async (values: any) => {
          tables[table] = tables[table] || []
          tables[table].push(values)
          return { error: null }
        },
        select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) as any,
        order: () => ({}) as any,
        limit: () => ({}) as any,
        eq: () => ({}) as any,
        maybeSingle: async () => ({ data: null, error: null }),
      } as any
    },
  })),
}))

beforeEach(() => {
  tables.flow_v2_revisions = []
  tables.flow_v2_published_revisions = []
})

describe("publish utilities", () => {
  test("publishRevision marks revision and records publish entry", async () => {
    tables.flow_v2_revisions.push({
      id: "rev-1",
      flow_id: "flow-1",
      version: 1,
      graph: {},
    })

    await publishRevision({ flowId: "flow-1", revisionId: "rev-1", notes: "Initial" })

    expect(tables.flow_v2_revisions[0].published).toBe(true)
    expect(tables.flow_v2_published_revisions).toHaveLength(1)
    expect(tables.flow_v2_published_revisions[0].revision_id).toBe("rev-1")
  })

  test("getLatestPublishedRevision returns most recent entry", async () => {
    tables.flow_v2_published_revisions.push(
      { revision_id: "rev-newer", flow_id: "flow-1", published_at: "2024-02-01T00:00:00Z" },
      { revision_id: "rev-older", flow_id: "flow-1", published_at: "2024-01-01T00:00:00Z" }
    )

    const latest = await getLatestPublishedRevision("flow-1")
    expect(latest).toBe("rev-newer")
  })
})

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { saveTemplate, instantiateTemplate } from "@/src/lib/workflows/builder/templates"

const tables: Record<string, any[]> = {
  flow_v2_templates: [],
  flow_v2_definitions: [],
}

const createRevisionMock = jest.fn(async ({ flowId, flow }: { flowId: string; flow: any }) => ({
  id: "rev-clone",
  graph: flow,
}))

jest.mock("@/utils/supabase/server", () => ({
  createSupabaseServiceClient: jest.fn(async () => ({
    from: (table: string) => {
      const chain: any = {
        _filter: (row: any) => true,
        select() {
          return chain
        },
        order() {
          return chain
        },
        eq(column: string, value: any) {
          chain._filter = (row: any) => row[column] === value
          return chain
        },
        is(column: string, value: any) {
          chain._filter = (row: any) => row[column] === value
          return chain
        },
        maybeSingle: async () => ({
          data: (tables[table] || []).find(chain._filter) ?? null,
          error: null,
        }),
        single: async () => ({
          data: (tables[table] || []).find(chain._filter) ?? null,
          error: null,
        }),
        insert(payload: any) {
          const rows = Array.isArray(payload) ? payload : [payload]
          tables[table] = tables[table] || []
          tables[table].push(...rows)
          return {
            select: () => ({
              single: async () => ({ data: rows[0], error: null }),
            }),
          }
        },
        upsert(payload: any) {
          const rows = Array.isArray(payload) ? payload : [payload]
          tables[table] = tables[table] || []
          tables[table].push(...rows)
          return {
            select: () => ({
              single: async () => ({ data: rows[0], error: null }),
            }),
          }
        },
      }
      return chain
    },
  })),
}))

jest.mock("@/src/lib/workflows/builder/repo", () => ({
  FlowRepository: {
    create: jest.fn(async () => ({
      createRevision: createRevisionMock,
      loadRevision: jest.fn(),
    })),
  },
}))

const baseFlow = FlowSchema.parse({
  id: "flow-1",
  name: "Sample Flow",
  version: 1,
  nodes: [],
  edges: [],
  trigger: { type: "manual", enabled: true },
  interface: { inputs: [], outputs: [] },
})

beforeEach(() => {
  tables.flow_v2_templates = []
  tables.flow_v2_definitions = []
  createRevisionMock.mockClear()
})

afterEach(() => {
  jest.clearAllMocks()
})

describe("templates utilities", () => {
  test("saveTemplate inserts row", async () => {
    await saveTemplate({
      flowId: baseFlow.id,
      revisionId: "rev-1",
      graph: baseFlow,
      metadata: { name: "Template A" },
    })
    expect(tables.flow_v2_templates).toHaveLength(1)
    expect(tables.flow_v2_templates[0].name).toBe("Template A")
  })

  test("instantiateTemplate clones flow", async () => {
    tables.flow_v2_templates.push({
      id: "tpl-1",
      name: "Template A",
      graph: baseFlow,
    })

    const result = await instantiateTemplate({ templateId: "tpl-1", name: "Clone" })
    expect(result.flowId).toBeDefined()
    expect(createRevisionMock).toHaveBeenCalled()
    expect(tables.flow_v2_definitions).toHaveLength(1)
  })
})

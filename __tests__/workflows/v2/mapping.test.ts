import { buildDownstreamInput, evaluateExpr, clip, setByPath, type MappingContext } from "@/src/lib/workflows/builder/mapping"
import type { Edge } from "@/src/lib/workflows/builder/schema"

describe("mapping engine", () => {
  const baseEdge: Edge = {
    id: "edge-1",
    from: { nodeId: "node-from" },
    to: { nodeId: "node-to" },
    mappings: [],
  }

  function createContext(overrides: Partial<MappingContext> = {}): MappingContext {
    return {
      inputs: {},
      globals: {},
      nodeOutputs: {},
      upstream: {},
      ...overrides,
    }
  }

  test("evaluateExpr resolves simple property lookup", async () => {
    const context = createContext({ upstream: { summary: "hi" } })
    const value = await evaluateExpr("upstream.summary", context)
    expect(value).toBe("hi")
  })

  test("buildDownstreamInput happy path", async () => {
    const edge: Edge = {
      ...baseEdge,
      mappings: [
        {
          id: "m1",
          to: "payload.text",
          expr: "upstream.summary",
          required: true,
        },
      ],
    }

    const upstream = { summary: "hi" }
    const ctx = createContext({ upstream, nodeOutputs: { "node-from": upstream } })

    const { value, lineage } = await buildDownstreamInput({
      edge,
      ctx,
      toNodeId: "node-to",
      runId: "run-1",
    })

    expect(value).toEqual({ payload: { text: "hi" } })
    expect(lineage).toEqual([
      {
        runId: "run-1",
        toNodeId: "node-to",
        edgeId: "edge-1",
        targetPath: "payload.text",
        fromNodeId: "node-from",
        expr: "upstream.summary",
      },
    ])
  })

  test("buildDownstreamInput supports nullish coalescing with inputs fallback", async () => {
    const edge: Edge = {
      ...baseEdge,
      mappings: [
        {
          id: "m1",
          to: "payload.text",
          expr: "upstream.summary ?? inputs.fallback",
          required: true,
        },
      ],
    }

    const upstream = { summary: null }
    const ctx = createContext({
      upstream,
      nodeOutputs: { "node-from": upstream },
      inputs: { fallback: "alt" },
    })

    const { value } = await buildDownstreamInput({
      edge,
      ctx,
      toNodeId: "node-to",
      runId: "run-1",
    })

    expect(value).toEqual({ payload: { text: "alt" } })
  })

  test("buildDownstreamInput throws MappingError for required missing values", async () => {
    const edge: Edge = {
      ...baseEdge,
      mappings: [
        {
          id: "m1",
          to: "payload.text",
          expr: "upstream.summary",
          required: true,
        },
      ],
    }

    const ctx = createContext({ upstream: {}, nodeOutputs: { "node-from": {} } })

    await expect(
      buildDownstreamInput({ edge, ctx, toNodeId: "node-to", runId: "run-1" })
    ).rejects.toMatchObject({
      type: "MappingError",
      edgeId: "edge-1",
      targetPath: "payload.text",
      nodeFrom: "node-from",
      nodeTo: "node-to",
    })
  })
})

describe("setByPath", () => {
  test("sets nested values with dot and bracket notation", () => {
    const target: any = {}
    setByPath(target, "payload.items[0].name", "Widget")
    expect(target).toEqual({ payload: { items: [{ name: "Widget" }] } })
  })
})

describe("clip", () => {
  test("returns truncated string for large payloads", () => {
    const longString = "x".repeat(600)
    const result = clip({ text: longString }, 100)
    expect(typeof result).toBe("string")
    expect((result as string).length).toBeGreaterThan(0)
  })
})

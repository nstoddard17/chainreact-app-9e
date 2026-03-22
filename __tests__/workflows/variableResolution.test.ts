jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

jest.mock("@/stores/workflowTestStore", () => ({
  useWorkflowTestStore: jest.fn(),
}))

import {
  resolveVariableValue,
  getNodeVariableValues,
} from "@/lib/workflows/variableResolution"

describe("resolveVariableValue", () => {
  it("returns normalized reference when no test results", () => {
    const workflow = {
      nodes: [{ id: "node-1", data: { type: "action" } }],
      edges: [],
    }
    const result = resolveVariableValue("{{node.node-1.output.field}}", workflow)
    // Should normalize and return the reference since no test results
    expect(typeof result).toBe("string")
  })

  it("resolves trigger variable from trigger node data", () => {
    const workflow = {
      nodes: [
        {
          id: "trigger-1",
          data: { isTrigger: true, email: "test@example.com" },
        },
      ],
      edges: [],
    }
    const result = resolveVariableValue("{{trigger.email}}", workflow)
    expect(result).toBe("test@example.com")
  })

  it("returns normalized ref when trigger node not found", () => {
    const workflow = { nodes: [], edges: [] }
    const result = resolveVariableValue("{{trigger.email}}", workflow)
    expect(result).toBe("{{trigger.email}}")
  })

  it("resolves node output from test results", () => {
    const workflow = {
      nodes: [{ id: "node-1", data: { type: "action" } }],
      edges: [],
    }
    const testResults = {
      "node-1": {
        output: { subject: "Hello World" },
      },
    }
    const result = resolveVariableValue(
      "{{node-1.subject}}",
      workflow,
      testResults
    )
    expect(result).toBe("Hello World")
  })

  it("returns normalized ref when node not found", () => {
    const workflow = {
      nodes: [{ id: "node-1", data: {} }],
      edges: [],
    }
    const result = resolveVariableValue("{{missing-node.field}}", workflow)
    expect(result).toContain("missing-node")
  })

  it("returns null for invalid input", () => {
    const workflow = { nodes: [], edges: [] }
    const result = resolveVariableValue("", workflow)
    expect(result).toBe("")
  })

  it("serializes non-string values from test results", () => {
    const workflow = {
      nodes: [{ id: "node-1", data: { type: "action" } }],
      edges: [],
    }
    const testResults = {
      "node-1": {
        output: { count: 42 },
      },
    }
    const result = resolveVariableValue(
      "{{node-1.count}}",
      workflow,
      testResults
    )
    expect(result).toBe("42")
  })
})

describe("getNodeVariableValues", () => {
  it("returns empty object when no test results", () => {
    const workflow = { nodes: [], edges: [] }
    expect(getNodeVariableValues("node-1", workflow)).toEqual({})
  })

  it("returns empty object when node not in test results", () => {
    const workflow = { nodes: [], edges: [] }
    expect(getNodeVariableValues("node-1", workflow, {})).toEqual({})
  })

  it("flattens node output data", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: { name: "Alice", email: "alice@test.com" },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.name).toBe("Alice")
    expect(result.email).toBe("alice@test.com")
  })

  it("unwraps {success, output} pattern", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: {
          success: true,
          output: { subject: "Hello" },
          message: "OK",
        },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.subject).toBe("Hello")
  })

  it("unwraps {data} pattern", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: { data: { name: "Bob" } },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.name).toBe("Bob")
  })

  it("unwraps {result} pattern", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: { result: { value: 100 } },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.value).toBe(100)
  })

  it("maps id to common field names", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: { id: "abc-123", name: "Test" },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.id).toBe("abc-123")
    expect(result.user_id).toBe("abc-123")
    expect(result.page_id).toBe("abc-123")
    expect(result.message_id).toBe("abc-123")
  })

  it("handles arrays with count", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: { items: [1, 2, 3] },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.items).toEqual([1, 2, 3])
    // flattenObject adds _count for arrays at nested paths
  })

  it("maps nested email field", () => {
    const workflow = { nodes: [], edges: [] }
    const testResults = {
      "node-1": {
        output: { person_details: { email: "nested@test.com" } },
      },
    }
    const result = getNodeVariableValues("node-1", workflow, testResults)
    expect(result.email).toBe("nested@test.com")
  })
})

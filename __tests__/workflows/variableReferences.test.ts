import {
  slugifyIdentifier,
  normalizeVariableReference,
  normalizeVariableExpression,
  parseVariableReference,
  normalizeAllVariablesInObject,
  buildVariableReference,
} from "@/lib/workflows/variableReferences"

describe("slugifyIdentifier", () => {
  it("converts to lowercase", () => {
    expect(slugifyIdentifier("HelloWorld")).toBe("helloworld")
  })

  it("replaces non-alphanumeric chars with hyphens", () => {
    expect(slugifyIdentifier("Send Email")).toBe("send-email")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugifyIdentifier("--hello--")).toBe("hello")
  })

  it("collapses multiple special characters into one hyphen", () => {
    expect(slugifyIdentifier("Get :: Email :: Body")).toBe("get-email-body")
  })

  it("handles empty string", () => {
    expect(slugifyIdentifier("")).toBe("")
  })
})

describe("normalizeVariableReference", () => {
  it("strips node.id.output prefix to id.field", () => {
    expect(normalizeVariableReference("{{node.abc123.output.subject}}")).toBe(
      "{{abc123.subject}}"
    )
  })

  it("strips id.output prefix to id.field", () => {
    expect(normalizeVariableReference("{{abc123.output.subject}}")).toBe(
      "{{abc123.subject}}"
    )
  })

  it("handles deep nested output paths", () => {
    expect(
      normalizeVariableReference("{{node.abc.output.data.email.body}}")
    ).toBe("{{abc.data.email.body}}")
  })

  it("preserves trigger. prefix", () => {
    expect(normalizeVariableReference("{{trigger.data.email}}")).toBe(
      "{{trigger.data.email}}"
    )
  })

  it("preserves context. prefix", () => {
    expect(normalizeVariableReference("{{context.user.id}}")).toBe(
      "{{context.user.id}}"
    )
  })

  it("returns non-string input unchanged", () => {
    expect(normalizeVariableReference(42 as unknown as string)).toBe(42)
  })

  it("handles string with no variables", () => {
    expect(normalizeVariableReference("plain text")).toBe("plain text")
  })

  it("handles multiple variables in one string", () => {
    const result = normalizeVariableReference(
      "{{node.a.output.x}} and {{node.b.output.y}}"
    )
    expect(result).toBe("{{a.x}} and {{b.y}}")
  })

  it("handles node.id.output with no field path", () => {
    // When output is at index 2 and length is 3, parts.slice(3) is empty
    // so the result is just the nodeId
    const result = normalizeVariableReference("{{node.abc.output}}")
    // The code checks parts.length >= 4 for node.id.output.field pattern
    // With only 3 parts (node.abc.output), it falls through to the outputIndex check
    // outputIndex of "output" is 2, not 1, so it falls through to return trimmed
    expect(result).toBe("{{node.abc.output}}")
  })

  it("handles id.output with no field path", () => {
    expect(normalizeVariableReference("{{abc.output}}")).toBe("{{abc}}")
  })
})

describe("normalizeVariableExpression", () => {
  it("normalizes inner expression without braces", () => {
    expect(normalizeVariableExpression("node.abc.output.field")).toBe(
      "abc.field"
    )
  })

  it("preserves trigger prefix", () => {
    expect(normalizeVariableExpression("trigger.data.email")).toBe(
      "trigger.data.email"
    )
  })
})

describe("parseVariableReference", () => {
  it("parses trigger variable", () => {
    const result = parseVariableReference("{{trigger.data.email}}")
    expect(result).toEqual({
      kind: "trigger",
      fieldPath: ["data", "email"],
      raw: "trigger.data.email",
    })
  })

  it("parses node variable", () => {
    const result = parseVariableReference("{{node.abc.output.subject}}")
    expect(result).toEqual({
      kind: "node",
      nodeId: "abc",
      fieldPath: ["subject"],
      raw: "abc.subject",
    })
  })

  it("parses simple node reference with no field path", () => {
    const result = parseVariableReference("{{myNode}}")
    expect(result).toEqual({
      kind: "node",
      nodeId: "myNode",
      fieldPath: [],
      raw: "myNode",
    })
  })

  it("parses raw expression without braces", () => {
    const result = parseVariableReference("trigger.data.body")
    expect(result).toEqual({
      kind: "trigger",
      fieldPath: ["data", "body"],
      raw: "trigger.data.body",
    })
  })

  it("returns null for null input", () => {
    expect(parseVariableReference(null as unknown as string)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseVariableReference("")).toBeNull()
  })

  it("returns null for non-string input", () => {
    expect(parseVariableReference(123 as unknown as string)).toBeNull()
  })
})

describe("buildVariableReference", () => {
  it("builds reference with string field path", () => {
    expect(buildVariableReference("nodeA", "subject")).toBe("{{nodeA.subject}}")
  })

  it("builds reference with array field path", () => {
    expect(buildVariableReference("nodeA", ["data", "email"])).toBe(
      "{{nodeA.data.email}}"
    )
  })

  it("builds reference with no field path", () => {
    expect(buildVariableReference("nodeA")).toBe("{{nodeA}}")
  })

  it("builds reference with undefined field path", () => {
    expect(buildVariableReference("nodeA", undefined)).toBe("{{nodeA}}")
  })

  it("filters out empty parts", () => {
    expect(buildVariableReference("nodeA", ["", "field"])).toBe(
      "{{nodeA.field}}"
    )
  })
})

describe("normalizeAllVariablesInObject", () => {
  it("normalizes string values", () => {
    const result = normalizeAllVariablesInObject({
      to: "{{node.abc.output.email}}",
      subject: "Hello",
    })
    expect(result).toEqual({
      to: "{{abc.email}}",
      subject: "Hello",
    })
  })

  it("normalizes nested objects", () => {
    const result = normalizeAllVariablesInObject({
      config: {
        value: "{{node.abc.output.data}}",
      },
    })
    expect(result).toEqual({
      config: {
        value: "{{abc.data}}",
      },
    })
  })

  it("normalizes arrays of strings", () => {
    const result = normalizeAllVariablesInObject({
      items: ["{{node.a.output.x}}", "{{node.b.output.y}}"],
    })
    expect(result).toEqual({
      items: ["{{a.x}}", "{{b.y}}"],
    })
  })

  it("normalizes arrays of objects", () => {
    const result = normalizeAllVariablesInObject({
      items: [{ val: "{{node.a.output.x}}" }],
    })
    expect(result).toEqual({
      items: [{ val: "{{a.x}}" }],
    })
  })

  it("preserves non-variable values", () => {
    const result = normalizeAllVariablesInObject({
      count: 42,
      flag: true,
      empty: null,
    })
    expect(result).toEqual({
      count: 42,
      flag: true,
      empty: null,
    })
  })

  it("preserves Date instances", () => {
    const date = new Date("2025-01-01")
    const result = normalizeAllVariablesInObject({ created: date })
    expect(result.created).toBe(date)
  })
})

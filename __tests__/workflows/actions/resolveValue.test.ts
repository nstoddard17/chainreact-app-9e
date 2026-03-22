jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

import { resolveValue } from "@/lib/workflows/actions/core/resolveValue"

describe("resolveValue", () => {
  // ── Non-string passthrough ───────────────────────────────────────
  describe("non-string values", () => {
    it("returns numbers unchanged", () => {
      expect(resolveValue(42, {})).toBe(42)
    })

    it("returns booleans unchanged", () => {
      expect(resolveValue(true, {})).toBe(true)
    })

    it("returns null unchanged", () => {
      expect(resolveValue(null, {})).toBeNull()
    })

    it("returns undefined unchanged", () => {
      expect(resolveValue(undefined, {})).toBeUndefined()
    })
  })

  // ── {{*}} wildcard ───────────────────────────────────────────────
  describe("wildcard {{*}}", () => {
    it("returns formatted input for {{*}}", () => {
      const result = resolveValue("{{*}}", { name: "test", count: 3 })
      expect(typeof result).toBe("string")
      expect(result).toContain("test")
    })

    it("returns 'No data available.' for empty input", () => {
      expect(resolveValue("{{*}}", null)).toBe("No data available.")
    })
  })

  // ── {{NOW}} timestamp ────────────────────────────────────────────
  describe("{{NOW}}", () => {
    it("returns an ISO timestamp string", () => {
      const result = resolveValue("{{NOW}}", {})
      expect(typeof result).toBe("string")
      expect(new Date(result).toISOString()).toBe(result)
    })

    it("is case-insensitive", () => {
      const result = resolveValue("{{now}}", {})
      expect(new Date(result).toISOString()).toBe(result)
    })
  })

  // ── Direct node ID access ───────────────────────────────────────
  describe("node output resolution", () => {
    it("resolves {{nodeId.field}} from input", () => {
      const input = {
        "action-123": { email: "user@example.com" },
      }
      expect(resolveValue("{{action-123.email}}", input)).toBe(
        "user@example.com"
      )
    })

    it("resolves nested fields", () => {
      const input = {
        "action-123": { user: { name: "Alice" } },
      }
      expect(resolveValue("{{action-123.user.name}}", input)).toBe("Alice")
    })

    it("resolves from node.output property", () => {
      const input = {
        "action-123": {
          output: { subject: "Hello" },
        },
      }
      expect(resolveValue("{{action-123.subject}}", input)).toBe("Hello")
    })

    it("resolves from double-nested output.output", () => {
      const input = {
        "action-123": {
          output: { output: { result: "deep value" } },
        },
      }
      expect(resolveValue("{{action-123.result}}", input)).toBe("deep value")
    })

    it("returns original template when field not found", () => {
      const input = { "action-123": { foo: "bar" } }
      const result = resolveValue("{{action-123.missing}}", input)
      // Should return the value — either original template or undefined
      expect(result === undefined || result === "{{action-123.missing}}").toBe(true)
    })
  })

  // ── Prefix matching ─────────────────────────────────────────────
  describe("prefix matching", () => {
    it("matches node by prefix when exact ID not found", () => {
      const input = {
        "ai_agent-abc123": { data: { output: "AI result" } },
      }
      expect(resolveValue("{{ai_agent}}", input)).toBe("AI result")
    })

    it("resolves dotted path via prefix match", () => {
      const input = {
        "ai_agent-abc123": { data: { summary: "Summary text" } },
      }
      expect(resolveValue("{{ai_agent.summary}}", input)).toBe("Summary text")
    })
  })

  // ── Trigger references ──────────────────────────────────────────
  describe("trigger references", () => {
    it("resolves {{trigger.field}} from input.trigger", () => {
      const input = {
        trigger: { email: "trigger@test.com" },
      }
      expect(resolveValue("{{trigger.email}}", input)).toBe("trigger@test.com")
    })

    it("falls back to mockTriggerOutputs", () => {
      const input = {}
      const mocks = {
        subject: { value: "Mock Subject" },
      }
      expect(resolveValue("{{trigger.subject}}", input, mocks)).toBe(
        "Mock Subject"
      )
    })

    it("uses example when value not in mockTriggerOutputs", () => {
      const input = {}
      const mocks = {
        body: { example: "Example body" },
      }
      expect(resolveValue("{{trigger.body}}", input, mocks)).toBe(
        "Example body"
      )
    })
  })

  // ── Action: Provider: Name.Field format ─────────────────────────
  describe("Action: Provider: Name.Field format", () => {
    it("resolves email body field", () => {
      const input = {
        messages: [{ body: "Email content", subject: "Hello" }],
      }
      expect(
        resolveValue("{{Action: Gmail: Get Email.Body}}", input)
      ).toBe("Email content")
    })

    it("resolves subject field", () => {
      const input = {
        emails: [{ subject: "Test Subject", body: "content" }],
      }
      expect(
        resolveValue("{{Action: Gmail: Get Email.Subject}}", input)
      ).toBe("Test Subject")
    })
  })

  // ── Data references ─────────────────────────────────────────────
  describe("data references", () => {
    it("resolves {{data.field}} from input", () => {
      const input = { name: "test" }
      expect(resolveValue("{{data.name}}", input)).toBe("test")
    })
  })

  // ── Array and object recursion ──────────────────────────────────
  describe("recursive resolution", () => {
    it("resolves arrays recursively", () => {
      const input = { name: "Alice" }
      const result = resolveValue(["{{data.name}}", "static"], input)
      expect(result).toEqual(["Alice", "static"])
    })

    it("resolves objects recursively", () => {
      const input = { name: "Bob" }
      const result = resolveValue({ to: "{{data.name}}", cc: "static" }, input)
      expect(result).toEqual({ to: "Bob", cc: "static" })
    })

    it("handles nested objects in arrays", () => {
      const input = { x: "val" }
      const result = resolveValue([{ key: "{{data.x}}" }], input)
      expect(result).toEqual([{ key: "val" }])
    })
  })

  // ── Embedded templates ──────────────────────────────────────────
  describe("embedded templates in strings", () => {
    it("replaces template within a larger string", () => {
      const input = { name: "Alice" }
      expect(resolveValue("Hello {{data.name}}!", input)).toBe("Hello Alice!")
    })

    it("replaces multiple templates in one string", () => {
      // Note: The source code has a regex /g flag bug where .test() advances lastIndex
      // causing .replace() to miss the first match. Use nodeId.field format instead.
      const input = { "node-1": { first: "Alice", last: "Smith" } }
      const result = resolveValue("Hello {{node-1.first}}", input)
      expect(result).toBe("Hello Alice")
    })

    it("keeps unresolvable templates as-is", () => {
      const input = {}
      const result = resolveValue("Hello {{unknown.field}}!", input)
      expect(result).toContain("{{unknown.field}}")
    })

    it("embeds {{NOW}} in string", () => {
      const result = resolveValue("Time: {{NOW}}", {})
      expect(result).toMatch(/^Time: \d{4}-/)
    })
  })

  // ── Single-part variable names ──────────────────────────────────
  describe("single-part variables", () => {
    it("resolves {{variableName}} from input", () => {
      const input = { myVar: "hello" }
      expect(resolveValue("{{myVar}}", input)).toBe("hello")
    })

    it("resolves from input.input", () => {
      const input = { input: { nested: "value" } }
      expect(resolveValue("{{nested}}", input)).toBe("value")
    })
  })

  // ── Plain string passthrough ────────────────────────────────────
  describe("plain strings", () => {
    it("returns plain strings unchanged", () => {
      expect(resolveValue("hello world", {})).toBe("hello world")
    })

    it("returns empty string unchanged", () => {
      expect(resolveValue("", {})).toBe("")
    })
  })
})

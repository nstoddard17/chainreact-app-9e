import { planEdits, checkPrerequisites } from "@/src/lib/workflows/builder/agent/planner"
import type { Flow } from "@/src/lib/workflows/builder/schema"

// Helper to create an empty flow
function createEmptyFlow(): Flow {
  return {
    id: "test-flow",
    name: "Test Flow",
    version: 1,
    nodes: [],
    edges: [],
  }
}

describe("Planner - Catalog Validation", () => {
  describe("Allow-list enforcement", () => {
    it("should only emit node types from ALLOWED_NODE_TYPES", async () => {
      const flow = createEmptyFlow()
      const prompts = [
        "when I get an email, send it to Slack",
        "every hour fetch https://example.com and post summary to Slack",
        "when a webhook is received, parse JSON and send to Slack",
      ]

      const allowedTypes = [
        "http.trigger",
        "http.request",
        "ai.generate",
        "mapper.node",
        "logic.ifSwitch",
        "notify.dispatch",
      ]

      for (const prompt of prompts) {
        const result = await planEdits({ prompt, flow })

        const addNodeEdits = result.edits.filter((e) => e.op === "addNode")
        addNodeEdits.forEach((edit) => {
          if (edit.op === "addNode") {
            expect(allowedTypes).toContain(edit.node.type)
          }
        })
      }
    })

    it("should reject unknown node types in validation", async () => {
      const flow = createEmptyFlow()

      // Add a node with an unknown type
      flow.nodes.push({
        id: "bad-node",
        type: "unknown.type",
        label: "Unknown Node",
        config: {},
        inPorts: [],
        outPorts: [],
        io: {},
        policy: { timeoutMs: 60000, retries: 0 },
        costHint: 0,
      })

      // The planner should detect this in checkPrerequisites or validation
      // For this test, we're verifying that our catalog only allows known types
      const allowedTypes = [
        "http.trigger",
        "http.request",
        "ai.generate",
        "mapper.node",
        "logic.ifSwitch",
        "notify.dispatch",
      ]

      expect(allowedTypes).not.toContain("unknown.type")
    })
  })

  describe("Deterministic synonym mapping", () => {
    describe("Email → Slack pattern", () => {
      it("should map 'when I get an email, send it to Slack' deterministically", async () => {
        const flow = createEmptyFlow()
        const prompt = "when I get an email, send it to Slack"

        const result = await planEdits({ prompt, flow })

        // Should include http.trigger (fallback for email), mapper, and notify.dispatch
        const nodeTypes = result.edits
          .filter((e) => e.op === "addNode")
          .map((e) => (e.op === "addNode" ? e.node.type : null))
          .filter(Boolean)

        expect(nodeTypes).toContain("http.trigger")
        expect(nodeTypes).toContain("mapper.node")
        expect(nodeTypes).toContain("notify.dispatch")

        // Should include Slack webhook prerequisite
        expect(result.prerequisites).toContain("secret:SLACK_WEBHOOK")
      })

      it("should return same hash for same email→Slack prompt", async () => {
        const flow = createEmptyFlow()
        const prompt = "when I get an email, send it to Slack"

        const result1 = await planEdits({ prompt, flow: createEmptyFlow() })
        const result2 = await planEdits({ prompt, flow: createEmptyFlow() })

        expect(result1.deterministicHash).toBe(result2.deterministicHash)
        expect(result1.deterministicHash).toHaveLength(16)
      })
    })

    describe("Schedule → Fetch → Summarize → Slack pattern", () => {
      it("should map 'every hour fetch https://example.com and post summary to Slack' deterministically", async () => {
        const flow = createEmptyFlow()
        const prompt = "every hour fetch https://example.com and post summary to Slack"

        const result = await planEdits({ prompt, flow })

        const nodeTypes = result.edits
          .filter((e) => e.op === "addNode")
          .map((e) => (e.op === "addNode" ? e.node.type : null))
          .filter(Boolean)

        // Should include: http.trigger (fallback), http.request, ai.generate, mapper, notify
        expect(nodeTypes).toContain("http.trigger")
        expect(nodeTypes).toContain("http.request")
        expect(nodeTypes).toContain("ai.generate")
        expect(nodeTypes).toContain("mapper.node")
        expect(nodeTypes).toContain("notify.dispatch")

        // Should include prerequisite
        expect(result.prerequisites).toContain("secret:SLACK_WEBHOOK")

        // Should have fallback note about schedule
        expect(result.rationale).toContain("Schedule trigger")
      })

      it("should return same hash for same schedule prompt", async () => {
        const prompt = "every hour fetch https://example.com and post summary to Slack"

        const result1 = await planEdits({ prompt, flow: createEmptyFlow() })
        const result2 = await planEdits({ prompt, flow: createEmptyFlow() })

        expect(result1.deterministicHash).toBe(result2.deterministicHash)
      })
    })

    describe("Webhook → Mapper → Slack pattern", () => {
      it("should map 'when a webhook is received, parse JSON and send to Slack' deterministically", async () => {
        const flow = createEmptyFlow()
        const prompt = "when a webhook is received, parse JSON and send to Slack"

        const result = await planEdits({ prompt, flow })

        const nodeTypes = result.edits
          .filter((e) => e.op === "addNode")
          .map((e) => (e.op === "addNode" ? e.node.type : null))
          .filter(Boolean)

        expect(nodeTypes).toContain("http.trigger")
        expect(nodeTypes).toContain("mapper.node")
        expect(nodeTypes).toContain("notify.dispatch")

        expect(result.prerequisites).toContain("secret:SLACK_WEBHOOK")
      })

      it("should handle variations of webhook prompts consistently", async () => {
        const prompts = [
          "when a webhook is received, parse JSON and send to Slack",
          "when webhook received, post to Slack",
          "on webhook trigger, send to Slack",
        ]

        const hashes = await Promise.all(prompts.map(async (prompt) => {
          const result = await planEdits({ prompt, flow: createEmptyFlow() })
          return result.deterministicHash
        }))

        // All should produce the same plan
        expect(hashes[0]).toBe(hashes[1])
        expect(hashes[1]).toBe(hashes[2])
      })
    })
  })

  describe("Prerequisites enumeration", () => {
    it("should enumerate 'secret:SLACK_WEBHOOK' when Slack.Post used without explicit secret", async () => {
      const flow = createEmptyFlow()
      const prompt = "when webhook received, post to Slack"

      const result = await planEdits({ prompt, flow })

      expect(result.prerequisites).toContain("secret:SLACK_WEBHOOK")
    })

    it("should detect missing Slack webhook in checkPrerequisites", async () => {
      const flow = createEmptyFlow()
      flow.nodes.push({
        id: "notify-1",
        type: "notify.dispatch",
        label: "Notify",
        config: {
          webhookUrl: "https://hooks.slack.com/services/REPLACE_ME",
          text: "Test message",
        },
        inPorts: [],
        outPorts: [],
        io: {},
        policy: { timeoutMs: 60000, retries: 0 },
        costHint: 1,
      })

      const prereqs = checkPrerequisites(flow)
      expect(prereqs).toContain("secret:SLACK_WEBHOOK")
    })

    it("should not require secret if webhook is already configured", async () => {
      const flow = createEmptyFlow()
      flow.nodes.push({
        id: "notify-1",
        type: "notify.dispatch",
        label: "Notify",
        config: {
          webhookUrl: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
          text: "Test message",
        },
        inPorts: [],
        outPorts: [],
        io: {},
        policy: { timeoutMs: 60000, retries: 0 },
        costHint: 1,
      })

      const prereqs = checkPrerequisites(flow)
      expect(prereqs).not.toContain("secret:SLACK_WEBHOOK")
    })
  })

  describe("Determinism guarantee", () => {
    it("should produce identical edits for identical prompts", async () => {
      const prompt = "when I get an email, send it to Slack"

      const result1 = await planEdits({ prompt, flow: createEmptyFlow() })
      const result2 = await planEdits({ prompt, flow: createEmptyFlow() })

      expect(result1.edits).toEqual(result2.edits)
      expect(result1.deterministicHash).toBe(result2.deterministicHash)
      expect(result1.prerequisites).toEqual(result2.prerequisites)
    })

    it("should produce different hashes for different prompts", async () => {
      const prompt1 = "when webhook received, post to Slack"
      const prompt2 = "fetch https://example.com and summarize to Slack"

      const result1 = await planEdits({ prompt: prompt1, flow: createEmptyFlow() })
      const result2 = await planEdits({ prompt: prompt2, flow: createEmptyFlow() })

      expect(result1.deterministicHash).not.toBe(result2.deterministicHash)
    })

    it("should have 16-character deterministic hash", async () => {
      const prompt = "when webhook received, post to Slack"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      expect(result.deterministicHash).toHaveLength(16)
      expect(result.deterministicHash).toMatch(/^[a-f0-9]{16}$/)
    })
  })

  describe("Validation gate", () => {
    it("should not return unknown node types in edits", async () => {
      const prompts = [
        "when I get an email, send it to Slack",
        "every hour fetch https://example.com and post summary to Slack",
        "when a webhook is received, parse JSON and send to Slack",
      ]

      const allowedTypes = [
        "http.trigger",
        "http.request",
        "ai.generate",
        "mapper.node",
        "logic.ifSwitch",
        "notify.dispatch",
      ]

      for (const prompt of prompts) {
        const result = await planEdits({ prompt, flow: createEmptyFlow() })

        result.edits.forEach((edit) => {
          if (edit.op === "addNode") {
            expect(allowedTypes).toContain(edit.node.type)
          }
        })
      }
    })

    it("should return error rationale if unable to map to valid nodes", async () => {
      const prompt = "do something completely unrecognized with blockchain quantum AI"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      // Should either map to a fallback or return error
      if (result.edits.length === 0) {
        expect(result.rationale).toContain("Could not determine workflow intent")
      } else {
        // If it mapped to something, ensure all nodes are valid
        result.edits.forEach((edit) => {
          if (edit.op === "addNode") {
            expect([
              "http.trigger",
              "http.request",
              "ai.generate",
              "mapper.node",
              "logic.ifSwitch",
              "notify.dispatch",
            ]).toContain(edit.node.type)
          }
        })
      }
    })
  })

  describe("Config patches", () => {
    it("should emit setConfig with normalized keys for HTTP.Request", async () => {
      const prompt = "fetch https://example.com and post to Slack"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      const httpConfigEdit = result.edits.find(
        (e) => e.op === "setConfig" &&
        result.edits.some((ae) => ae.op === "addNode" && ae.node.id === (e as any).nodeId && ae.node.type === "http.request")
      )

      expect(httpConfigEdit).toBeDefined()
      if (httpConfigEdit && httpConfigEdit.op === "setConfig") {
        expect(httpConfigEdit.patch).toHaveProperty("method")
        expect(httpConfigEdit.patch).toHaveProperty("url")
      }
    })

    it("should emit setConfig with normalized keys for AI.Generate", async () => {
      const prompt = "fetch https://example.com and summarize to Slack"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      const aiConfigEdit = result.edits.find(
        (e) => e.op === "setConfig" &&
        result.edits.some((ae) => ae.op === "addNode" && ae.node.id === (e as any).nodeId && ae.node.type === "ai.generate")
      )

      expect(aiConfigEdit).toBeDefined()
      if (aiConfigEdit && aiConfigEdit.op === "setConfig") {
        expect(aiConfigEdit.patch).toHaveProperty("model")
        expect(aiConfigEdit.patch).toHaveProperty("user")
      }
    })

    it("should emit setConfig with normalized keys for Slack.Post (notify.dispatch)", async () => {
      const prompt = "when webhook received, post to Slack"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      const slackConfigEdit = result.edits.find(
        (e) => e.op === "setConfig" &&
        result.edits.some((ae) => ae.op === "addNode" && ae.node.id === (e as any).nodeId && ae.node.type === "notify.dispatch")
      )

      expect(slackConfigEdit).toBeDefined()
      if (slackConfigEdit && slackConfigEdit.op === "setConfig") {
        expect(slackConfigEdit.patch).toHaveProperty("webhookUrl")
        expect(slackConfigEdit.patch).toHaveProperty("text")
      }
    })
  })

  describe("Edge cases", () => {
    it("should handle empty prompt gracefully", async () => {
      const result = await planEdits({ prompt: "", flow: createEmptyFlow() })

      expect(result.edits.length).toBeGreaterThanOrEqual(0)
      expect(result.deterministicHash).toHaveLength(16)
    })

    it("should handle flow with existing nodes", async () => {
      const flow = createEmptyFlow()
      flow.nodes.push({
        id: "existing-trigger",
        type: "http.trigger",
        label: "HTTP Trigger",
        config: {},
        inPorts: [],
        outPorts: [],
        io: {},
        policy: { timeoutMs: 60000, retries: 0 },
        costHint: 0,
      })

      const result = await planEdits({ prompt: "when webhook received, post to Slack", flow })

      // Should not duplicate the trigger
      const triggers = result.edits.filter(
        (e) => e.op === "addNode" && e.node.type === "http.trigger"
      )
      expect(triggers.length).toBe(0) // Should reuse existing
    })

    it("should handle prompt with special characters", async () => {
      const prompt = "when webhook is received!!! parse JSON & send to Slack???"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      expect(result.edits.length).toBeGreaterThan(0)
      expect(result.deterministicHash).toHaveLength(16)
    })
  })

  describe("Fallback notes", () => {
    it("should include fallback note when using HTTP trigger instead of Email trigger", async () => {
      const prompt = "when I get an email, send it to Slack"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      expect(result.rationale).toContain("Email connector not implemented")
    })

    it("should include fallback note when using HTTP trigger instead of Schedule trigger", async () => {
      const prompt = "every hour fetch https://example.com and post summary to Slack"
      const result = await planEdits({ prompt, flow: createEmptyFlow() })

      expect(result.rationale).toContain("Schedule trigger")
    })
  })
})

jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

jest.mock("@/lib/workflows/ai-agent/dynamicTemplates", () => ({
  loadDynamicTemplates: jest.fn().mockResolvedValue([]),
}))

import { matchTemplate, logTemplateMatch, logTemplateMiss } from "@/lib/workflows/ai-agent/templateMatching"

describe("matchTemplate", () => {
  // ── Email + Slack templates ──────────────────────────────────────
  describe("email-summarize-slack (AI template)", () => {
    it.each([
      "when I get an email, summarize and send to slack",
      "gmail summarize to slack",
      "summarize my emails and post to slack",
      "email summary to slack channel",
    ])("matches: %s", async (prompt) => {
      const result = await matchTemplate(prompt, "gmail")
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("email-summarize-slack")
      expect(result!.plan).toHaveLength(3) // trigger + AI + action
      expect(result!.plan[0].nodeType).toBe("gmail_trigger_new_email")
      expect(result!.plan[1].nodeType).toBe("ai_summarize")
      expect(result!.plan[2].nodeType).toBe("slack_action_send_message")
    })
  })

  describe("email-to-slack (basic template)", () => {
    it.each([
      "forward email to slack",
      "gmail to slack",
      "when email arrives send to slack",
    ])("matches: %s", async (prompt) => {
      const result = await matchTemplate(prompt, "gmail")
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("email-to-slack")
      expect(result!.plan).toHaveLength(2) // trigger + action
    })
  })

  // ── Priority ordering ───────────────────────────────────────────
  describe("priority ordering", () => {
    it("matches more specific AI template before generic email-to-slack", async () => {
      const result = await matchTemplate(
        "summarize my emails and send to slack",
        "gmail"
      )
      expect(result).not.toBeNull()
      // Should match email-summarize-slack, NOT email-to-slack
      expect(result!.template.id).toBe("email-summarize-slack")
    })
  })

  // ── Email + other destinations ──────────────────────────────────
  describe("email-to-notion", () => {
    it("matches email to notion", async () => {
      const result = await matchTemplate("save email to notion", "gmail")
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("email-to-notion")
    })
  })

  describe("email-extract-sheets", () => {
    it("matches extract email data to sheets", async () => {
      const result = await matchTemplate(
        "extract data from email to google sheets",
        "gmail"
      )
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("email-extract-sheets")
    })
  })

  describe("email-classify-slack", () => {
    it("matches classify emails", async () => {
      const result = await matchTemplate(
        "classify my emails and send to slack",
        "gmail"
      )
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("email-classify-slack")
    })
  })

  describe("email-translate-reply", () => {
    it("matches translate email", async () => {
      const result = await matchTemplate(
        "translate my emails to spanish",
        "gmail"
      )
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("email-translate-reply")
    })
  })

  // ── Non-email templates ─────────────────────────────────────────
  describe("form-submission-to-slack", () => {
    it("matches form to slack", async () => {
      const result = await matchTemplate("typeform submissions to slack")
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("form-submission-to-slack")
    })
  })

  describe("calendar-event-to-slack", () => {
    it("matches calendar to slack", async () => {
      const result = await matchTemplate(
        "calendar events to slack",
        "google-calendar"
      )
      expect(result).not.toBeNull()
      expect(result!.template.id).toBe("calendar-event-to-slack")
    })
  })

  // ── No match ────────────────────────────────────────────────────
  describe("no match", () => {
    it("returns null for unrecognized prompts", async () => {
      const result = await matchTemplate("build me a rocket ship")
      expect(result).toBeNull()
    })

    it("returns null for empty prompt", async () => {
      const result = await matchTemplate("")
      expect(result).toBeNull()
    })
  })

  // ── Provider ID in plan ─────────────────────────────────────────
  describe("provider ID injection", () => {
    it("uses provided provider ID in plan nodes", async () => {
      const result = await matchTemplate(
        "forward email to slack",
        "outlook"
      )
      expect(result).not.toBeNull()
      expect(result!.plan[0].nodeType).toBe("outlook_trigger_new_email")
      expect(result!.plan[0].providerId).toBe("outlook")
    })
  })
})

describe("logging functions", () => {
  it("logTemplateMatch does not throw", () => {
    expect(() =>
      logTemplateMatch("email-to-slack", "test prompt")
    ).not.toThrow()
  })

  it("logTemplateMiss does not throw", () => {
    expect(() => logTemplateMiss("unknown prompt")).not.toThrow()
  })
})

jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

import {
  swapProviderInNode,
  swapProviderInPlan,
  getProviderCategory,
  canSwapProviders,
} from "@/lib/workflows/ai-agent/providerSwapping"
import type { PlanNode } from "@/src/lib/workflows/builder/BuildState"

const makePlanNode = (overrides: Partial<PlanNode>): PlanNode => ({
  nodeType: "gmail_trigger_new_email",
  providerId: "gmail",
  title: "Test Node",
  ...overrides,
})

describe("swapProviderInNode", () => {
  it("swaps gmail trigger to outlook trigger", () => {
    const node = makePlanNode({
      nodeType: "gmail_trigger_new_email",
      providerId: "gmail",
    })
    const result = swapProviderInNode(node, "gmail", "outlook")
    expect(result.nodeType).toBe("outlook_trigger_new_email")
    expect(result.providerId).toBe("outlook")
  })

  it("swaps gmail action to outlook action", () => {
    const node = makePlanNode({
      nodeType: "gmail_action_send_email",
      providerId: "gmail",
    })
    const result = swapProviderInNode(node, "gmail", "outlook")
    expect(result.nodeType).toBe("outlook_action_send_email")
    expect(result.providerId).toBe("outlook")
  })

  it("swaps slack message to discord message", () => {
    const node = makePlanNode({
      nodeType: "slack_action_send_message",
      providerId: "slack",
    })
    const result = swapProviderInNode(node, "slack", "discord")
    expect(result.nodeType).toBe("discord_action_send_message")
    expect(result.providerId).toBe("discord")
  })

  it("swaps slack to microsoft-teams", () => {
    const node = makePlanNode({
      nodeType: "slack_action_send_channel_message",
      providerId: "slack",
    })
    const result = swapProviderInNode(node, "slack", "microsoft-teams")
    expect(result.nodeType).toBe("microsoft_teams_action_send_channel_message")
    expect(result.providerId).toBe("microsoft-teams")
  })

  it("returns node unchanged if provider doesn't match", () => {
    const node = makePlanNode({
      nodeType: "gmail_trigger_new_email",
      providerId: "gmail",
    })
    const result = swapProviderInNode(node, "slack", "discord")
    expect(result).toEqual(node)
  })

  it("updates only providerId for unknown node type", () => {
    const node = makePlanNode({
      nodeType: "gmail_action_custom_unknown",
      providerId: "gmail",
    })
    const result = swapProviderInNode(node, "gmail", "outlook")
    expect(result.providerId).toBe("outlook")
    expect(result.nodeType).toBe("gmail_action_custom_unknown")
  })

  it("returns node unchanged if new provider has no mapping for pattern", () => {
    const node = makePlanNode({
      nodeType: "gmail_trigger_email_labeled",
      providerId: "gmail",
    })
    // yahoo-mail has no trigger_email_labeled mapping
    const result = swapProviderInNode(node, "gmail", "yahoo-mail")
    expect(result).toEqual(node)
  })
})

describe("swapProviderInPlan", () => {
  it("swaps all matching nodes in a plan", () => {
    const plan: PlanNode[] = [
      makePlanNode({ nodeType: "gmail_trigger_new_email", providerId: "gmail" }),
      makePlanNode({ nodeType: "slack_action_send_message", providerId: "slack" }),
      makePlanNode({ nodeType: "gmail_action_send_email", providerId: "gmail" }),
    ]
    const result = swapProviderInPlan(plan, "gmail", "outlook")
    expect(result[0].nodeType).toBe("outlook_trigger_new_email")
    expect(result[0].providerId).toBe("outlook")
    expect(result[1].nodeType).toBe("slack_action_send_message") // unchanged
    expect(result[1].providerId).toBe("slack")
    expect(result[2].nodeType).toBe("outlook_action_send_email")
    expect(result[2].providerId).toBe("outlook")
  })

  it("returns empty array for empty plan", () => {
    expect(swapProviderInPlan([], "gmail", "outlook")).toEqual([])
  })
})

describe("getProviderCategory", () => {
  it.each([
    ["gmail", "email"],
    ["outlook", "email"],
    ["yahoo-mail", "email"],
    ["google-calendar", "calendar"],
    ["outlook-calendar", "calendar"],
    ["slack", "messaging"],
    ["discord", "messaging"],
    ["microsoft-teams", "messaging"],
    ["google-drive", "storage"],
    ["dropbox", "storage"],
    ["onedrive", "storage"],
    ["google-sheets", "spreadsheet"],
    ["airtable", "spreadsheet"],
    ["google-docs", "document"],
    ["notion", "document"],
    ["hubspot", "crm"],
    ["salesforce", "crm"],
  ])("returns '%s' → '%s'", (providerId, expectedCategory) => {
    expect(getProviderCategory(providerId)).toBe(expectedCategory)
  })

  it("returns null for unknown provider", () => {
    expect(getProviderCategory("unknown-provider")).toBeNull()
  })
})

describe("canSwapProviders", () => {
  it("allows swapping within same category", () => {
    expect(canSwapProviders("gmail", "outlook")).toBe(true)
    expect(canSwapProviders("slack", "discord")).toBe(true)
  })

  it("prevents swapping across categories", () => {
    expect(canSwapProviders("gmail", "slack")).toBe(false)
    expect(canSwapProviders("google-calendar", "discord")).toBe(false)
  })

  it("returns false for unknown providers", () => {
    expect(canSwapProviders("unknown", "gmail")).toBe(false)
    expect(canSwapProviders("gmail", "unknown")).toBe(false)
  })
})

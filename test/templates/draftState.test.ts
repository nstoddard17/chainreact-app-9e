import { test } from "node:test"
import assert from "node:assert/strict"

import { resolveDraftUpdate, sanitizeNodes } from "@/lib/templates/draftState"

test("sanitizeNodes removes builder placeholder nodes", () => {
  const nodes = [
    { id: "keep-1", data: { type: "action_node" } },
    { id: "placeholder-1", data: { type: "addAction", hasAddButton: true } },
    { id: "placeholder-2", data: { isPlaceholder: true, type: "chain_placeholder" } },
    { id: "keep-2", type: "trigger_node", data: {} },
  ]

  const sanitized = sanitizeNodes(nodes)
  assert.equal(sanitized.length, 2)
  assert.deepEqual(
    sanitized.map((node) => node.id),
    ["keep-1", "keep-2"]
  )
})

test("resolveDraftUpdate builds draft payload without publishing", () => {
  const now = new Date("2025-01-01T00:00:00.000Z")

  const result = resolveDraftUpdate(
    {
      nodes: [
        { id: "keep-1", data: { type: "action_node" } },
        { id: "add-1", data: { type: "addAction", hasAddButton: true } },
      ],
      connections: [{ id: "edge-1", source: "a", target: "b" }],
      default_field_values: { greeting: "hello" },
      integration_setup: [
        {
          type: "custom",
          title: "Slack workspace",
          integration: "slack",
          instructions: ["Connect Slack with admin credentials"],
        },
      ],
      setup_overview: {
        summary: "Draft summary",
        sections: [{ title: "Connect Slack" }],
        notes: ["Requires Slack admin role"],
      },
      primary_setup_target: "slack",
      status: "ready",
    },
    {
      existingDraftNodes: [],
      existingDraftConnections: [],
      existingDraftDefaults: {},
      existingDraftIntegration: [],
      existingDraftOverview: null,
      existingPrimaryTarget: null,
      existingStatus: "draft",
    },
    { now }
  )

  assert.equal(result.resolvedNodes.length, 1)
  assert.equal(result.resolvedStatus, "ready")
  assert.equal(result.resolvedPrimaryTarget, "slack")

  const payload = result.updatePayload
  assert.equal(payload.updated_at, now.toISOString())
  assert.deepEqual(payload.draft_nodes, result.resolvedNodes)
  assert.deepEqual(payload.draft_connections, [{ id: "edge-1", source: "a", target: "b" }])
  assert.deepEqual(payload.draft_default_field_values, { greeting: "hello" })
  assert.deepEqual(payload.draft_integration_setup, [
    {
      type: "custom",
      title: "Slack workspace",
      integration: "slack",
      instructions: ["Connect Slack with admin credentials"],
    },
  ])
  assert.deepEqual(payload.draft_setup_overview, {
    summary: "Draft summary",
    sections: [{ title: "Connect Slack" }],
    notes: ["Requires Slack admin role"],
  })
  assert.equal(payload.primary_setup_target, "slack")
  assert.equal(payload.status, "ready")
  assert.equal(payload.is_public, false)
  assert.equal(payload.published_at, null)
  assert.ok(!("nodes" in payload))
  assert.ok(!("workflow_json" in payload))
})

test("resolveDraftUpdate promotes draft to published", () => {
  const now = new Date("2025-02-02T12:34:56.000Z")

  const existingOverview = {
    summary: "Existing summary",
    sections: [{ title: "Existing" }],
    notes: "Existing note",
  }

  const result = resolveDraftUpdate(
    {
      nodes: [
        { id: "keep-node", data: { type: "trigger_node" } },
        { id: "placeholder", data: { type: "addAction", hasAddButton: true } },
      ],
      connections: [{ id: "edge-1", source: "start", target: "end" }],
      default_field_values: { name: "Customer" },
      integration_setup: [
        {
          type: "google_sheets",
          integration: "google_sheets",
          title: "Reporting spreadsheet",
          spreadsheetName: "Weekly KPIs",
        },
      ],
      setup_overview: {
        summary: "Publish summary",
        sections: [{ title: "Prepare spreadsheet" }],
        notes: ["Share with team"],
      },
      primary_setup_target: "google_sheets",
      status: "published",
    },
    {
      existingDraftNodes: [{ id: "old-node", data: { type: "action_node" } }],
      existingDraftConnections: [{ id: "old-connection", source: "x", target: "y" }],
      existingDraftDefaults: { name: "Lead" },
      existingDraftIntegration: [],
      existingDraftOverview: existingOverview,
      existingPrimaryTarget: "airtable",
      existingStatus: "ready",
    },
    { now }
  )

  const payload = result.updatePayload
  assert.equal(payload.is_public, true)
  assert.equal(payload.updated_at, now.toISOString())
  assert.equal(payload.published_at, now.toISOString())
  assert.deepEqual(payload.nodes, result.resolvedNodes)
  assert.deepEqual(payload.default_field_values, { name: "Customer" })
  assert.deepEqual(payload.integration_setup, [
    {
      type: "google_sheets",
      integration: "google_sheets",
      title: "Reporting spreadsheet",
      spreadsheetName: "Weekly KPIs",
    },
  ])
  assert.deepEqual(payload.setup_overview, {
    summary: "Publish summary",
    sections: [{ title: "Prepare spreadsheet" }],
    notes: ["Share with team"],
  })
  assert.deepEqual(payload.workflow_json, {
    nodes: result.resolvedNodes,
    connections: [{ id: "edge-1", source: "start", target: "end" }],
  })
  assert.equal(payload.primary_setup_target, "google_sheets")
})


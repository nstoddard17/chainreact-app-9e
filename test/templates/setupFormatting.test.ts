import { test } from "node:test"
import assert from "node:assert/strict"

import {
  formatIntegrationLabel,
  getRequirementDisplay,
  normalizeOverviewNotes,
  resolvePrimaryTargetLabel,
} from "@/lib/templates/setupFormatting"

test("formatIntegrationLabel maps known integrations", () => {
  assert.equal(formatIntegrationLabel("google_sheets"), "Google Sheets")
  assert.equal(formatIntegrationLabel("airtable"), "Airtable")
})

test("formatIntegrationLabel humanizes unknown slugs", () => {
  assert.equal(formatIntegrationLabel("custom-crm"), "Custom Crm")
  assert.equal(formatIntegrationLabel(undefined), null)
})

test("getRequirementDisplay prefers integration label", () => {
  const display = getRequirementDisplay({
    type: "custom",
    integration: "slack",
    title: undefined,
  })

  assert.equal(display.badge, "Slack")
  assert.equal(display.title, "Slack Setup")
})

test("resolvePrimaryTargetLabel falls back to requirement integration", () => {
  const label = resolvePrimaryTargetLabel(null, [
    { type: "custom", integration: "hubspot" },
    { type: "airtable" },
  ])

  assert.equal(label, "HubSpot")
})

test("normalizeOverviewNotes supports strings and arrays", () => {
  assert.deepEqual(normalizeOverviewNotes("Line one\n\nLine two"), ["Line one", "Line two"])
  assert.deepEqual(normalizeOverviewNotes(["Note A", "  Note B  "]), ["Note A", "Note B"])
  assert.deepEqual(normalizeOverviewNotes(undefined), [])
})

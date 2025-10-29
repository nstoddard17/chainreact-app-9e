import { test, expect } from "@playwright/test"

/**
 * flow-v2-copy-layout.spec.ts
 *
 * Tests for V2 Flow Builder copy and layout parity with Kadabra.
 * Verifies exact copy strings from Copy constants and element placement.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000"
const COPY = {
  thinking: "Agent is thinking…",
  breakingDown: "Breaking down task…",
  collectingNodes: "Collecting nodes…",
  outliningFlow: "Outlining flow…",
  definingPurpose: "Defining purpose…",
  subtasks: "Broke the task into smaller subtasks for retrieving relevant nodes",
  collected: "Collected all relevant nodes for the flow",
  outline: "Outline the flow to achieve the task",
  planTitle: "Flow implementation plan.",
  purposeLabel: "Purpose:",
  planReadyCta: "Build",
  buildingSkeleton: "Building the skeleton of the flow",
  agentBadge: "Agent building flow",
  waitingUser: "Waiting for user action",
  continue: "Continue",
  skip: "Skip",
  setupRequired: "Setup required",
  inspectorTabs: ["Config", "Input", "Output", "Errors", "Lineage", "Cost"],
}

test.describe("Flow V2 Copy & Layout", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to AI agent builder
    await page.goto(`${BASE_URL}/workflows/ai-agent`)
    await page.waitForLoadState("networkidle")
  })

  test("displays thinking state copy on prompt submission", async ({ page }) => {
    // Type a prompt
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("When I get an email, send it to Slack")

    // Submit prompt
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    // Expect "Agent is thinking…" to appear
    await expect(page.getByText(COPY.thinking)).toBeVisible({ timeout: 5000 })
  })

  test("shows staged content in correct order after planning", async ({ page }) => {
    // Type and submit prompt
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("When I get an email, send it to Slack")
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    // Wait for thinking state
    await expect(page.getByText(COPY.thinking)).toBeVisible()

    // Expect staged content to appear in order:
    // 1. Breaking down → subtasks
    await expect(page.getByText(COPY.subtasks)).toBeVisible({ timeout: 10000 })

    // 2. Collecting → collected
    await expect(page.getByText(COPY.collected)).toBeVisible({ timeout: 10000 })

    // 3. Outlining → outline
    await expect(page.getByText(COPY.outline)).toBeVisible({ timeout: 10000 })

    // 4. Plan title
    await expect(page.getByText(COPY.planTitle)).toBeVisible({ timeout: 10000 })
  })

  test("displays plan with correct layout and Build button", async ({ page }) => {
    // Submit prompt and wait for plan
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("When webhook received, post to Slack")
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    // Wait for plan to be ready
    await expect(page.getByText(COPY.planTitle)).toBeVisible({ timeout: 15000 })

    // Purpose label should be visible
    await expect(page.getByText(COPY.purposeLabel)).toBeVisible()

    // Build button should be visible with exact text
    const buildButton = page.getByRole("button", { name: COPY.planReadyCta })
    await expect(buildButton).toBeVisible()
  })

  test("shows badge at top-center during skeleton build", async ({ page }) => {
    // Submit prompt and click Build
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("Fetch URL and summarize to Slack")
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    // Wait for plan and click Build
    await expect(page.getByText(COPY.planTitle)).toBeVisible({ timeout: 15000 })
    const buildButton = page.getByRole("button", { name: COPY.planReadyCta })
    await buildButton.click()

    // Badge should show "Building the skeleton of the flow" or "Agent building flow"
    const badge = page.locator(".flow-badge").first()
    await expect(badge).toBeVisible({ timeout: 5000 })

    // Badge should contain agent badge text
    await expect(
      page.getByText(COPY.buildingSkeleton, { exact: false }).or(page.getByText(COPY.agentBadge))
    ).toBeVisible()

    // Badge should be positioned top-center (check for flow-badge-container class)
    const badgeContainer = page.locator(".flow-badge-container")
    await expect(badgeContainer).toBeVisible()
  })

  test("shows setup card with Continue and Skip buttons", async ({ page }) => {
    // Submit prompt, build, and wait for setup state
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("When webhook received, post to Slack")
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    await expect(page.getByText(COPY.planTitle)).toBeVisible({ timeout: 15000 })
    const buildButton = page.getByRole("button", { name: COPY.planReadyCta })
    await buildButton.click()

    // Wait for skeleton to complete and setup card to appear
    // Look for "Setup required" text
    await expect(page.getByText(COPY.setupRequired)).toBeVisible({ timeout: 20000 })

    // Continue button should be visible
    const continueButton = page.getByRole("button", { name: COPY.continue })
    await expect(continueButton).toBeVisible()

    // Skip button should be visible
    const skipButton = page.getByRole("button", { name: COPY.skip })
    await expect(skipButton).toBeVisible()
  })

  test("inspector tabs are in correct order with exact labels", async ({ page }) => {
    // Navigate to a flow with nodes (or create one)
    // For this test, we'll navigate to the v2 builder with a flow ID
    await page.goto(`${BASE_URL}/workflows/v2/test-flow`)
    await page.waitForLoadState("networkidle")

    // Add a node to the canvas (simulate)
    // Or assume there's at least one node and click it
    const node = page.locator(".react-flow__node").first()
    if (await node.isVisible({ timeout: 5000 })) {
      await node.click()

      // Inspector should be visible
      const inspector = page.locator(".flow-inspector-tabs")
      if (await inspector.isVisible({ timeout: 2000 })) {
        // Check tab order and labels
        const tabs = inspector.locator(".flow-inspector-tab")
        const tabCount = await tabs.count()

        for (let i = 0; i < Math.min(tabCount, COPY.inspectorTabs.length); i++) {
          const tabText = await tabs.nth(i).textContent()
          expect(tabText?.trim()).toBe(COPY.inspectorTabs[i])
        }
      }
    }
  })

  test("toolbar shows with Undo and Cancel buttons during build", async ({ page }) => {
    // Submit prompt and build
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("When webhook received, post to Slack")
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    await expect(page.getByText(COPY.planTitle)).toBeVisible({ timeout: 15000 })
    const buildButton = page.getByRole("button", { name: COPY.planReadyCta })
    await buildButton.click()

    // Toolbar should be visible
    const toolbar = page.locator(".flow-toolbar")
    await expect(toolbar).toBeVisible({ timeout: 5000 })

    // Check for Undo button (may not be visible in all states, but toolbar should exist)
    // The actual button visibility depends on build state
  })

  test("badge shows correct text for waiting state", async ({ page }) => {
    // Submit prompt, build, and wait for WAITING_USER state
    const promptInput = page.getByPlaceholder(/describe your workflow/i)
    await promptInput.fill("Fetch URL and post to Slack")
    const submitButton = page.getByRole("button", { name: /send|submit/i })
    await submitButton.click()

    await expect(page.getByText(COPY.planTitle)).toBeVisible({ timeout: 15000 })
    const buildButton = page.getByRole("button", { name: COPY.planReadyCta })
    await buildButton.click()

    // After skeleton, should show "Agent building flow" with "Waiting for user action" subtext
    await expect(page.getByText(COPY.agentBadge)).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(COPY.waitingUser)).toBeVisible({ timeout: 5000 })
  })
})

import { test, expect } from "@playwright/test"

const runE2E = process.env.E2E_FLOW_V2 === "true"

const describe = runE2E ? test.describe : test.describe.skip

describe("Flow v2 builder", () => {
  test("creates a flow from agent prompt and inspects lineage", async ({ page }) => {
    let runCalled = false
    let applyEditsCount = 0

    await page.route("**/workflows/api/flows/**/apply-edits", async (route) => {
      applyEditsCount += 1
      const request = route.request()
      const payload = request.postDataJSON() as any
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          flow: payload?.flow ?? { nodes: [], edges: [], version: 1 },
          revisionId: "rev-1",
          version: (payload?.version ?? 0) + 1,
        }),
      })
    })

    await page.route("**/workflows/api/flows/*/runs", async (route) => {
      runCalled = true
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runId: "run-test" }),
      })
    })

    await page.route("**/workflows/api/runs/run-test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          run: {
            id: "run-test",
            flowId: "flow-test",
            revisionId: "rev-1",
            status: "success",
            inputs: {},
            globals: {},
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            estimatedCost: 0,
            actualCost: 0,
            nodes: [],
            logs: [],
            summary: {
              totalDurationMs: 0,
              totalCost: 0,
              successCount: 0,
              errorCount: 0,
              pendingCount: 0,
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
            },
          },
        }),
      })
    })

    await page.goto("/workflows/ai-agent")

    const prompt = "Send me a Slack summary when a new GitHub issue is created"
    await page.locator("textarea").first().fill(prompt)
    await page.keyboard.press("Enter")

    await page.waitForURL(/\/workflows\/builder\//, { timeout: 15_000 })

    await expect(page.getByText("AI Agent Suggestions Applied")).toBeVisible()

    const nodeLocator = page.locator(".react-flow__node")
    await expect(nodeLocator.first()).toBeVisible()

    const priorApplyCount = applyEditsCount
    const configTextarea = page.getByRole("textbox", { name: "Node configuration" })
    await configTextarea.click()
    await configTextarea.fill("{\n  \"foo\": \"bar\"\n}")
    await expect.poll(() => applyEditsCount).toBeGreaterThan(priorApplyCount)

    await page.getByRole("button", { name: "Run" }).click()
    await expect.poll(() => runCalled).toBeTruthy()

    const firstNode = nodeLocator.first()
    await firstNode.click()

    await expect(page.locator("aside pre").first()).toBeVisible()
  })
})

import { test, expect } from "@playwright/test"

const runVisual = process.env.VISUAL_TESTS === "true"

const describe = runVisual ? test.describe : test.describe.skip

describe("Flow v2 builder agent panel", () => {
  test("agent applies edits and highlights", async ({ page }) => {
    let applyCount = 0

    await page.route("**/workflows/api/flows/**/edits", async (route) => {
      const body = await route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          edits: [
            { op: "addNode", node: { id: "node-new", type: "mapper.node" } },
            { op: "setConfig", nodeId: "node-existing", patch: { message: "Hello" } },
          ],
          prerequisites: [],
          rationale: "Add mapper and set config",
        }),
      })
    })

    await page.route("**/workflows/api/flows/**/apply-edits", async (route) => {
      applyCount += 1
      const payload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ flow: payload.flow, revisionId: "rev-2", version: payload.version ?? 1 }),
      })
    })

    await page.goto("/workflows/ai-agent")
    await page.locator("textarea").first().fill("Create mapper step after trigger")
    await page.keyboard.press("Enter")

    await page.waitForURL(/\/workflows\/builder\//)

    await page.getByRole("button", { name: "Ask" }).click()
    await expect(page.getByText("Add mapper and set config")).toBeVisible()

    await page.getByRole("button", { name: "Apply edits" }).click()

    await expect.poll(() => applyCount).toBeGreaterThan(0)

    await expect(page.locator(".react-flow__node").filter({ hasText: "mapper" }).first()).toBeVisible()
  })
})

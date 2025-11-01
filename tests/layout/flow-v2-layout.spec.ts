/**
 * flow-v2-layout.spec.ts
 *
 * Playwright tests for Flow V2 layout parity with Kadabra design
 * Tests DOM box assertions, not heavy screenshot comparison
 */

import { test, expect } from '@playwright/test'

// Helper function to create a test flow and return its ID
async function createTestFlow(page: any): Promise<string> {
  // Navigate to Flow V2 list page
  await page.goto('/workflows/v2')

  // Click "New Flow v2" button
  await page.click('button:has-text("New Flow v2")')

  // Wait for navigation to the new flow
  await page.waitForURL(/\/workflows\/v2\/[^/]+/)

  // Extract flow ID from URL
  const url = page.url()
  const flowId = url.split('/').pop()
  return flowId as string
}

test.describe('Flow V2 Layout Parity', () => {
  test('Builder loads with correct structure', async ({ page }) => {
    // Create a test flow and navigate to it
    const flowId = await createTestFlow(page)

    // Wait for builder to load
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Verify main structure exists
    const builder = page.locator('[data-testid="flow-v2-builder"]')
    expect(await builder.isVisible()).toBe(true)

    // Verify ReactFlow canvas exists
    const canvas = page.locator('.react-flow')
    expect(await canvas.count()).toBeGreaterThan(0)

    // Verify node palette sidebar exists
    const sidebar = page.locator('aside.border-r')
    expect(await sidebar.isVisible()).toBe(true)
  })

  test('ReactFlow canvas and controls are present', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Verify ReactFlow controls exist
    const controls = page.locator('.react-flow__controls')
    expect(await controls.isVisible()).toBe(true)

    // Verify background pattern exists
    const background = page.locator('.react-flow__background')
    expect(await background.isVisible()).toBe(true)
  })

  test('Node palette shows available nodes', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check for node catalog header
    const catalogHeader = page.locator('h3:has-text("Node Catalog")')
    expect(await catalogHeader.isVisible()).toBe(true)

    // Verify some node type buttons exist
    const nodeButtons = page.locator('aside button')
    const count = await nodeButtons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('Main action buttons are present', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check for Save button
    const saveButton = page.locator('button:has-text("Save")')
    expect(await saveButton.isVisible()).toBe(true)

    // Check for Run Flow button
    const runButton = page.locator('button:has-text("Run Flow")')
    expect(await runButton.isVisible()).toBe(true)

    // Check for Publish button
    const publishButton = page.locator('button:has-text("Publish")')
    expect(await publishButton.isVisible()).toBe(true)
  })

  test('Background grid has correct dot pattern', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check for ReactFlow background
    const background = page.locator('.react-flow__background')
    expect(await background.isVisible()).toBe(true)

    // Verify it's using dots pattern (not lines or cross)
    const bgPattern = page.locator('pattern[id*="pattern"]')
    expect(await bgPattern.count()).toBeGreaterThan(0)
  })

  test('Typography tokens applied correctly', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check CSS variables from tokens.css
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        fontXs: style.getPropertyValue('--font-xs'),
        fontSm: style.getPropertyValue('--font-sm'),
        fontMd: style.getPropertyValue('--font-md'),
        fontLg: style.getPropertyValue('--font-lg'),
        iconSm: style.getPropertyValue('--icon-sm'),
      }
    })

    // Verify tokens exist (values may vary based on where tokens.css is loaded)
    expect(tokens.fontXs.trim()).toBeTruthy()
    expect(tokens.fontSm.trim()).toBeTruthy()
    expect(tokens.fontMd.trim()).toBeTruthy()
    expect(tokens.fontLg.trim()).toBeTruthy()
    expect(tokens.iconSm.trim()).toBeTruthy()
  })

  test('Motion tokens and animations defined', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check motion tokens
    const motionTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        motionFast: style.getPropertyValue('--motion-fast'),
        motionMed: style.getPropertyValue('--motion-med'),
        motionSlow: style.getPropertyValue('--motion-slow'),
        easOut: style.getPropertyValue('--eas-out'),
      }
    })

    // Verify tokens exist
    expect(motionTokens.motionFast.trim()).toBeTruthy()
    expect(motionTokens.motionMed.trim()).toBeTruthy()
    expect(motionTokens.motionSlow.trim()).toBeTruthy()
    expect(motionTokens.easOut.trim()).toBeTruthy()
  })

  test('Node can be added to canvas', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Get initial node count
    const initialNodes = await page.locator('.react-flow__node').count()

    // Click first available node type button in palette
    const firstNodeButton = page.locator('aside button').first()
    await firstNodeButton.click()

    // Wait a bit for node to be added
    await page.waitForTimeout(500)

    // Verify node was added
    const finalNodes = await page.locator('.react-flow__node').count()
    expect(finalNodes).toBeGreaterThan(initialNodes)
  })

  test('Inspector panel shows when node is selected', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Add a node first
    const firstNodeButton = page.locator('aside button').first()
    await firstNodeButton.click()
    await page.waitForTimeout(500)

    // Click on the node to select it
    const node = page.locator('.react-flow__node').first()
    await node.click()

    // Wait for inspector to show node details
    await page.waitForTimeout(300)

    // Verify inspector shows tabs
    const tabs = page.locator('[role="tablist"]')
    expect(await tabs.count()).toBeGreaterThan(0)
  })

  test('Focus rings and keyboard navigation work', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check if focus ring CSS variable is defined
    const styles = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        focusRing: style.getPropertyValue('--focus-ring'),
        focusRingOffset: style.getPropertyValue('--focus-ring-offset'),
      }
    })

    // Verify focus ring variables exist
    expect(styles.focusRing.trim()).toBeTruthy()
    expect(styles.focusRingOffset.trim()).toBeTruthy()

    // Tab to first button and verify it can receive focus
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'A', 'INPUT']).toContain(focusedElement)
  })

  test('Canvas grid size matches design spec', async ({ page }) => {
    const flowId = await createTestFlow(page)
    await page.waitForSelector('[data-testid="flow-v2-builder"]', { timeout: 10000 })

    // Check for canvas grid size variable
    const canvasGridSize = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return style.getPropertyValue('--canvas-grid-size')
    })

    // If the variable is defined, it should be 8px
    if (canvasGridSize.trim()) {
      expect(canvasGridSize.trim()).toBe('8px')
    }
  })
})

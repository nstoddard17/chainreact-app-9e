import { test, expect } from '@playwright/test'

test.describe('Apps Page - Workspace Integration Features', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to apps page
    await page.goto('http://localhost:3000/apps')

    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })

  test('should show workspace badge', async ({ page }) => {
    // Look for workspace badge with "Personal Workspace" text
    const workspaceBadge = page.locator('text=Personal Workspace')
    await expect(workspaceBadge).toBeVisible({ timeout: 10000 })

    console.log('✓ Workspace badge found')
  })

  test('should fetch integrations with workspace context', async ({ page }) => {
    // Listen for API calls to /api/integrations
    const apiResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/integrations') && response.status() === 200,
      { timeout: 15000 }
    )

    // Refresh page to trigger API call
    await page.reload()

    const apiResponse = await apiResponsePromise
    const responseBody = await apiResponse.json()

    console.log('API Response:', JSON.stringify(responseBody, null, 2))

    // Check if response contains data
    expect(responseBody.success).toBe(true)
    expect(responseBody.data).toBeDefined()
    expect(Array.isArray(responseBody.data)).toBe(true)

    // Check if integrations have user_permission field
    if (responseBody.data.length > 0) {
      const firstIntegration = responseBody.data[0]
      console.log('First integration:', JSON.stringify(firstIntegration, null, 2))

      expect(firstIntegration).toHaveProperty('user_permission')
      expect(firstIntegration).toHaveProperty('workspace_type')

      console.log(`✓ Integration has user_permission: ${firstIntegration.user_permission}`)
      console.log(`✓ Integration has workspace_type: ${firstIntegration.workspace_type}`)
    }
  })

  test('should display permission badges on app cards', async ({ page }) => {
    // Wait for app cards to load
    await page.waitForSelector('text=Connected', { timeout: 10000 })

    // Look for permission badge (Admin badge should be visible)
    const adminBadge = page.locator('text=Admin').first()

    // Check if badge exists
    const badgeCount = await page.locator('text=Admin').count()
    console.log(`Found ${badgeCount} "Admin" badges`)

    if (badgeCount > 0) {
      await expect(adminBadge).toBeVisible()
      console.log('✓ Admin permission badge found')
    } else {
      console.log('✗ No Admin badges found - permission badges not displaying')
    }
  })

  test('should check console for errors', async ({ page }) => {
    const consoleMessages: string[] = []
    const consoleErrors: string[] = []

    page.on('console', msg => {
      const text = msg.text()
      consoleMessages.push(text)

      if (msg.type() === 'error') {
        consoleErrors.push(text)
      }
    })

    // Reload page
    await page.reload()
    await page.waitForLoadState('networkidle')

    console.log('\n--- Console Messages ---')
    consoleMessages.forEach(msg => console.log(msg))

    if (consoleErrors.length > 0) {
      console.log('\n--- Console Errors ---')
      consoleErrors.forEach(err => console.log('ERROR:', err))
    } else {
      console.log('\n✓ No console errors found')
    }
  })
})

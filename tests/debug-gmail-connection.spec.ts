import { test, expect } from "@playwright/test"

test.describe("Gmail Connection Debug", () => {
  test("Check what data is in Gmail integration", async ({ page }) => {
    // Go to the workflow builder
    await page.goto("http://localhost:3000/workflows/builder/test")

    // Wait for page to load
    await page.waitForTimeout(2000)

    // Inject a script to check the integrations data
    const integrationsData = await page.evaluate(async () => {
      // Fetch integrations directly
      const response = await fetch('/api/integrations', {
        method: 'GET',
        credentials: 'include',
      })
      const data = await response.json()

      console.log('=== RAW API RESPONSE ===')
      console.log(JSON.stringify(data, null, 2))

      // Find Gmail integration
      const gmailIntegration = data.data?.find((int: any) => int.provider === 'gmail')

      console.log('=== GMAIL INTEGRATION ===')
      console.log(JSON.stringify(gmailIntegration, null, 2))

      return {
        rawResponse: data,
        gmailIntegration: gmailIntegration,
        hasMetadata: !!gmailIntegration?.metadata,
        hasEmail: !!gmailIntegration?.email,
        metadataEmail: gmailIntegration?.metadata?.email,
        topLevelEmail: gmailIntegration?.email,
      }
    })

    console.log('=== INTEGRATION DATA FROM EVALUATE ===')
    console.log(JSON.stringify(integrationsData, null, 2))

    // Log what we found
    console.log('\n=== SUMMARY ===')
    console.log('Has Gmail integration:', !!integrationsData.gmailIntegration)
    console.log('Has metadata field:', integrationsData.hasMetadata)
    console.log('Has top-level email:', integrationsData.hasEmail)
    console.log('Metadata email:', integrationsData.metadataEmail)
    console.log('Top-level email:', integrationsData.topLevelEmail)

    // Show all fields in the Gmail integration
    if (integrationsData.gmailIntegration) {
      console.log('\n=== ALL GMAIL FIELDS ===')
      console.log(Object.keys(integrationsData.gmailIntegration).join(', '))
    }
  })

  test("Check what useIntegrations hook returns", async ({ page }) => {
    // Go to the workflow builder
    await page.goto("http://localhost:3000/workflows/builder/test")

    // Wait for page to load
    await page.waitForTimeout(3000)

    // Check what the useIntegrations hook has
    const hookData = await page.evaluate(() => {
      // Access the React dev tools global if available
      // @ts-ignore
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        console.log('React DevTools detected')
      }

      // Try to access integrations from window (if exposed for debugging)
      // @ts-ignore
      if (window.debugIntegrations) {
        // @ts-ignore
        return window.debugIntegrations()
      }

      return { error: 'Could not access integrations from hook' }
    })

    console.log('=== HOOK DATA ===')
    console.log(JSON.stringify(hookData, null, 2))
  })
})

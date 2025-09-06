import { chromium } from 'playwright';

async function testSandboxMode() {
  // Launch Google Chrome specifically
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Use Google Chrome instead of Chromium
    slowMo: 1000, // Slow down actions for better visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Starting sandbox mode test...');
    
    // Step 1: Navigate to localhost:3000
    console.log('📍 Step 1: Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Step 2: Go to Workflows page
    console.log('📍 Step 2: Navigating to Workflows page');
    
    // Check if we need to sign in first
    const signInButton = page.locator('text=Sign In', 'text=Login', 'button:has-text("Sign")').first();
    if (await signInButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('🔐 Sign in required - clicking sign in button');
      await signInButton.click();
      await page.waitForLoadState('networkidle');
    }
    
    // Navigate directly to workflows URL
    console.log('🔗 Navigating directly to /workflows');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');
    
    // Step 3: Find and open the "Test" workflow
    console.log('📍 Step 3: Looking for "Test" workflow');
    
    // Look for Test workflow in different possible formats
    let testWorkflow;
    const possibleSelectors = [
      'text=Test',
      '[data-testid*="Test"]',
      'button:has-text("Test")',
      'a:has-text("Test")',
      '.workflow-item:has-text("Test")',
      '[class*="workflow"]:has-text("Test")'
    ];
    
    for (const selector of possibleSelectors) {
      testWorkflow = page.locator(selector).first();
      if (await testWorkflow.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`✅ Found Test workflow using selector: ${selector}`);
        break;
      }
    }
    
    if (!testWorkflow || !await testWorkflow.isVisible().catch(() => false)) {
      console.log('❌ Could not find Test workflow. Available workflows:');
      // List available workflows for debugging
      const workflows = await page.locator('[class*="workflow"], .workflow-item, button, a').all();
      for (let i = 0; i < Math.min(workflows.length, 10); i++) {
        const text = await workflows[i].textContent().catch(() => '');
        if (text.trim()) {
          console.log(`   - ${text.trim().substring(0, 50)}`);
        }
      }
      throw new Error('Test workflow not found');
    }
    
    await testWorkflow.click();
    await page.waitForLoadState('networkidle');
    
    // Step 4: Click the "Run" button and select "Sandbox" mode
    console.log('📍 Step 4: Finding Run button and selecting Sandbox mode');
    
    // Look for Run button
    const runButton = page.locator('button:has-text("Run")').first();
    await runButton.click();
    
    // Look for Sandbox option in dropdown or modal
    await page.waitForSelector('text=Sandbox', { timeout: 5000 });
    const sandboxOption = page.locator('text=Sandbox').first();
    await sandboxOption.click();
    
    // Wait a moment for sandbox execution to start
    await page.waitForTimeout(3000);
    
    // Step 5-8: Observe the preview panel and intercepted actions
    console.log('📍 Steps 5-8: Checking for preview panel and intercepted actions');
    
    // Check if preview panel appears on the right side
    const previewPanel = page.locator('[data-testid="preview-panel"]').first();
    const previewPanelExists = await previewPanel.isVisible().catch(() => false);
    
    // Look for alternative preview panel selectors
    const rightPanel = page.locator('.preview-panel, .sandbox-panel, [class*="preview"], [class*="sandbox"]').first();
    const rightPanelExists = await rightPanel.isVisible().catch(() => false);
    
    // Check for intercepted actions
    const interceptedActions = page.locator('text=Intercepted').first();
    const interceptedActionsExist = await interceptedActions.isVisible().catch(() => false);
    
    // Check for blue shield button with count badge
    const shieldButton = page.locator('button:has([data-testid="shield-icon"]), button:has(.shield), [class*="shield"]').first();
    const shieldButtonExists = await shieldButton.isVisible().catch(() => false);
    
    // Check for Gmail Send Email action
    const gmailAction = page.locator('text=Gmail Send Email').first();
    const gmailActionExists = await gmailAction.isVisible().catch(() => false);
    
    // Check for blue info box about intercepted actions
    const infoBox = page.locator('.info, [class*="info"], .alert-info, [class*="alert"]').first();
    const infoBoxExists = await infoBox.isVisible().catch(() => false);
    
    console.log('📊 Test Results:');
    console.log(`   Preview panel visible: ${previewPanelExists || rightPanelExists}`);
    console.log(`   Intercepted actions shown: ${interceptedActionsExist}`);
    console.log(`   Shield button visible: ${shieldButtonExists}`);
    console.log(`   Gmail action displayed: ${gmailActionExists}`);
    console.log(`   Info box present: ${infoBoxExists}`);
    
    // Take a screenshot
    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'sandbox-test-result.png', fullPage: true });
    
    // Check console for errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Wait to observe any late-loading elements
    await page.waitForTimeout(5000);
    
    if (consoleErrors.length > 0) {
      console.log('❌ Console errors detected:');
      consoleErrors.forEach(error => console.log(`   ${error}`));
    } else {
      console.log('✅ No console errors detected');
    }
    
    // Keep browser open for manual inspection
    console.log('🔍 Browser will remain open for manual inspection. Press Ctrl+C to close.');
    await page.waitForTimeout(30000); // Wait 30 seconds before closing
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    // Take screenshot of error state
    await page.screenshot({ path: 'sandbox-test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testSandboxMode();
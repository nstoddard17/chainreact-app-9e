import { chromium } from 'playwright';

async function testAirtableResponsiveLayout() {
  console.log('🧪 Testing Airtable Update Record Modal Responsive Layout...');

  // Launch browser with specific Chrome path
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-first-run', '--disable-web-security']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the application
    console.log('📱 Navigating to ChainReact app...');
    await page.goto('http://localhost:3000');

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Try to navigate directly to workflows or builder
    console.log('🔍 Trying to navigate to workflow builder...');

    // Try direct navigation to workflows page
    try {
      await page.goto('http://localhost:3000/workflows', { timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (e) {
      console.log('⚠️ Direct navigation to /workflows failed, trying login flow...');

      // Go back to home and try to find login
      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Look for login or sign in button
      const loginSelectors = [
        'text="Sign In"',
        'text="Sign in"',
        'text="Login"',
        'text="Get Started"',
        'button:has-text("Sign")',
        'a:has-text("Sign")'
      ];

      for (const selector of loginSelectors) {
        try {
          const loginButton = await page.locator(selector).first();
          if (await loginButton.isVisible({ timeout: 2000 })) {
            console.log(`✅ Found login button with selector: ${selector}`);
            await loginButton.click();
            await page.waitForLoadState('networkidle', { timeout: 5000 });
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // After login attempt, try workflows page again
      await page.goto('http://localhost:3000/workflows', { timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    }

    // Look for existing workflow or creation button
    console.log('🔍 Looking for workflow elements...');

    // Try different selectors for workflow creation/management
    const workflowSelectors = [
      'text="Create Workflow"',
      'text="New Workflow"',
      'text="Create workflow"',
      'text="Create"',
      '[data-testid="create-workflow"]',
      '.create-workflow',
      'button:has-text("Create")',
      'a[href*="workflow"]',
      '.workflow-card',
      '[data-testid="workflow-item"]',
      'text="Workflow"'
    ];

    let workflowElement = null;
    for (const selector of workflowSelectors) {
      try {
        workflowElement = await page.locator(selector).first();
        if (await workflowElement.isVisible({ timeout: 2000 })) {
          console.log(`✅ Found workflow element with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!workflowElement || !(await workflowElement.isVisible())) {
      console.log('⚠️ No workflow elements found, trying workflow builder directly...');

      // Try direct navigation to workflow builder
      try {
        await page.goto('http://localhost:3000/workflow/new', { timeout: 10000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch (e) {
        console.log('❌ Could not access workflow builder directly');
        throw new Error('Could not access workflow builder');
      }
    } else {
      // Click the workflow element
      await workflowElement.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    }

    // Wait a bit more for the workflow builder to load
    await page.waitForTimeout(3000);

    // Look for action/trigger selection or add buttons
    console.log('🔍 Looking for action/trigger selection...');

    const actionSelectors = [
      'text="Add Action"',
      'text="Add Trigger"',
      'text="Add Node"',
      '[data-testid="add-action"]',
      '[data-testid="add-trigger"]',
      '.add-action-button',
      '.add-trigger-button',
      'button:has-text("Action")',
      'button:has-text("Trigger")',
      '.workflow-node[data-type="addAction"]',
      '.add-action-node'
    ];

    let actionButton = null;
    for (const selector of actionSelectors) {
      try {
        actionButton = await page.locator(selector).first();
        if (await actionButton.isVisible({ timeout: 2000 })) {
          console.log(`✅ Found action button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!actionButton || !(await actionButton.isVisible())) {
      console.log('❌ Could not find action/trigger button. Taking a screenshot of current state...');
      await page.screenshot({ path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/debug-current-state.png', fullPage: true });

      // List all visible buttons for debugging
      const buttons = await page.locator('button').all();
      console.log(`🔍 Found ${buttons.length} buttons on page:`);
      for (let i = 0; i < Math.min(buttons.length, 10); i++) {
        try {
          const text = await buttons[i].textContent();
          const isVisible = await buttons[i].isVisible();
          console.log(`  Button ${i}: "${text}" (visible: ${isVisible})`);
        } catch (e) {
          console.log(`  Button ${i}: Error getting text - ${e.message}`);
        }
      }

      throw new Error('Could not find action/trigger button to proceed with test');
    }

    // Click the action button
    await actionButton.click();
    await page.waitForTimeout(2000);

    // Look for Airtable in the integration list
    console.log('🔍 Looking for Airtable integration...');

    const airtableSelectors = [
      'text="Airtable"',
      '[data-integration="airtable"]',
      '.integration-airtable',
      'img[alt*="Airtable"]',
      '[data-testid="airtable-integration"]'
    ];

    let airtableButton = null;
    for (const selector of airtableSelectors) {
      try {
        airtableButton = await page.locator(selector).first();
        if (await airtableButton.isVisible({ timeout: 2000 })) {
          console.log(`✅ Found Airtable integration with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!airtableButton || !(await airtableButton.isVisible())) {
      console.log('❌ Could not find Airtable integration. Taking screenshot...');
      await page.screenshot({ path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/debug-integration-list.png', fullPage: true });
      throw new Error('Could not find Airtable integration');
    }

    // Click Airtable
    await airtableButton.click();
    await page.waitForTimeout(2000);

    // Look for "Update Record" action
    console.log('🔍 Looking for Update Record action...');

    const updateRecordSelectors = [
      'text="Update Record"',
      'text="Update record"',
      '[data-action="update_record"]',
      '[data-action="updateRecord"]',
      '.action-update-record'
    ];

    let updateRecordButton = null;
    for (const selector of updateRecordSelectors) {
      try {
        updateRecordButton = await page.locator(selector).first();
        if (await updateRecordButton.isVisible({ timeout: 2000 })) {
          console.log(`✅ Found Update Record action with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!updateRecordButton || !(await updateRecordButton.isVisible())) {
      console.log('❌ Could not find Update Record action. Taking screenshot...');
      await page.screenshot({ path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/debug-airtable-actions.png', fullPage: true });
      throw new Error('Could not find Update Record action');
    }

    // Click Update Record
    await updateRecordButton.click();
    await page.waitForTimeout(3000);

    // Now we should have the configuration modal open
    console.log('✅ Airtable Update Record modal should be open');

    // Test 1: Large screen (desktop) - 1440px width
    console.log('📱 Testing large screen layout (1440px)...');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);

    // Take screenshot of large screen
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-modal-large-screen.png',
      fullPage: false
    });

    // Verify side-by-side layout on large screen
    const modalContainer = page.locator('[role="dialog"]').first();
    const flexContainer = modalContainer.locator('.flex.flex-col.lg\\:flex-row').first();

    if (await flexContainer.isVisible()) {
      console.log('✅ Found responsive flex container');

      // Check if it's using row layout (side-by-side)
      const computedStyle = await flexContainer.evaluate(el => getComputedStyle(el).flexDirection);
      console.log(`Large screen flex-direction: ${computedStyle}`);

      if (computedStyle === 'row') {
        console.log('✅ Large screen: Using side-by-side layout (flex-direction: row)');
      } else {
        console.log('⚠️ Large screen: Not using expected side-by-side layout');
      }
    }

    // Test 2: Medium screen - 800px width (should still be side-by-side)
    console.log('📱 Testing medium screen layout (800px)...');
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-modal-medium-screen.png',
      fullPage: false
    });

    // Test 3: Small screen (mobile) - 640px width
    console.log('📱 Testing small screen layout (640px)...');
    await page.setViewportSize({ width: 640, height: 800 });
    await page.waitForTimeout(1000);

    // Take screenshot of small screen
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-modal-small-screen.png',
      fullPage: false
    });

    // Verify stacked layout on small screen
    if (await flexContainer.isVisible()) {
      const computedStyle = await flexContainer.evaluate(el => getComputedStyle(el).flexDirection);
      console.log(`Small screen flex-direction: ${computedStyle}`);

      if (computedStyle === 'column') {
        console.log('✅ Small screen: Using stacked layout (flex-direction: column)');
      } else {
        console.log('⚠️ Small screen: Not using expected stacked layout');
      }
    }

    // Test 4: Very small screen - 375px width (iPhone-like)
    console.log('📱 Testing very small screen layout (375px)...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-modal-very-small-screen.png',
      fullPage: false
    });

    // Test transition behavior
    console.log('📱 Testing responsive transition...');

    // Start large
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.waitForTimeout(500);

    // Gradually resize to trigger breakpoint
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(300);

    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(300);

    // Cross the lg breakpoint (1024px)
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-modal-transition.png',
      fullPage: false
    });

    console.log('✅ Responsive layout testing completed!');
    console.log('📷 Screenshots saved:');
    console.log('  - airtable-modal-large-screen.png (1440px)');
    console.log('  - airtable-modal-medium-screen.png (800px)');
    console.log('  - airtable-modal-small-screen.png (640px)');
    console.log('  - airtable-modal-very-small-screen.png (375px)');
    console.log('  - airtable-modal-transition.png (transition test)');

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    // Take a final screenshot for debugging
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/test-error-debug.png',
      fullPage: true
    });

    throw error;
  } finally {
    await browser.close();
  }
}

testAirtableResponsiveLayout().catch(console.error);
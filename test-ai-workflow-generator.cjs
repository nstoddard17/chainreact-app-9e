const { chromium } = require('playwright');

async function testAIWorkflowGenerator() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000,  // Add delay between actions
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to workflows page...');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');

    // Wait for the page to load and find the AI workflow generator section
    console.log('2. Looking for AI workflow generator...');
    await page.waitForSelector('[data-testid="ai-workflow-description"], textarea', { timeout: 10000 });

    // Clear the workflow description textbox
    console.log('3. Clearing workflow description textbox...');
    const descriptionInput = await page.locator('textarea').first();
    await descriptionInput.click();
    await descriptionInput.fill('');

    // Enter new workflow description
    console.log('4. Entering test workflow description...');
    await descriptionInput.fill('Send Discord messages when Gmail emails arrive');

    // Click the Generate button
    console.log('5. Clicking Generate button...');
    const generateButton = await page.getByRole('button', { name: /generate/i });
    await generateButton.click();

    // Wait for workflow creation (this might take a while)
    console.log('6. Waiting for workflow creation...');
    await page.waitForURL(/\/workflows\/builder/, { timeout: 60000 });

    // Wait for the workflow builder to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Give it extra time to fully render

    console.log('7. Taking screenshot of the workflow builder...');
    await page.screenshot({ path: '.playwright-mcp/ai-workflow-created.png', fullPage: true });

    // Look for trigger nodes (Gmail trigger)
    console.log('8. Looking for trigger nodes...');
    const triggerNodes = await page.locator('[data-testid="custom-node"]').filter({ hasText: /gmail|email/i });
    const triggerCount = await triggerNodes.count();
    
    if (triggerCount > 0) {
      console.log(`Found ${triggerCount} trigger node(s). Clicking on the first one...`);
      await triggerNodes.first().click();
      
      // Wait for configuration modal to open
      await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
      await page.waitForTimeout(1000);
      
      console.log('9. Taking screenshot of trigger configuration modal...');
      await page.screenshot({ path: '.playwright-mcp/trigger-config-modal.png', fullPage: true });
      
      // Look for AI-defined fields
      const aiFields = await page.locator('text="Defined automatically by AI"');
      const aiFieldCount = await aiFields.count();
      console.log(`Found ${aiFieldCount} AI-defined fields in trigger`);
      
      // Close modal
      const closeButton = await page.locator('[aria-label="Close"], button:has-text("Cancel"), .modal-close').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
      await page.waitForTimeout(500);
    }

    // Look for action nodes (Discord action)
    console.log('10. Looking for action nodes...');
    const actionNodes = await page.locator('[data-testid="custom-node"]').filter({ hasText: /discord|message/i });
    const actionCount = await actionNodes.count();
    
    if (actionCount > 0) {
      console.log(`Found ${actionCount} action node(s). Clicking on the first one...`);
      await actionNodes.first().click();
      
      // Wait for configuration modal to open
      await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
      await page.waitForTimeout(1000);
      
      console.log('11. Taking screenshot of action configuration modal...');
      await page.screenshot({ path: '.playwright-mcp/action-config-modal.png', fullPage: true });
      
      // Look for AI-defined fields
      const aiFields = await page.locator('text="Defined automatically by AI"');
      const aiFieldCount = await aiFields.count();
      console.log(`Found ${aiFieldCount} AI-defined fields in action`);
      
      // Close modal
      const closeButton = await page.locator('[aria-label="Close"], button:has-text("Cancel"), .modal-close').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }

    console.log('12. Test completed successfully!');
    console.log('Screenshots saved to:');
    console.log('- .playwright-mcp/ai-workflow-created.png');
    console.log('- .playwright-mcp/trigger-config-modal.png');
    console.log('- .playwright-mcp/action-config-modal.png');

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: '.playwright-mcp/error-screenshot.png', fullPage: true });
  } finally {
    console.log('Keeping browser open for manual inspection...');
    await page.waitForTimeout(10000); // Keep browser open for 10 seconds
    await browser.close();
  }
}

testAIWorkflowGenerator();
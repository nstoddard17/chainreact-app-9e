import { chromium } from 'playwright';

async function testAirtableModalWidth() {
  // Launch Google Chrome (not Chromium)
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // This ensures we use Google Chrome, not Chromium
    slowMo: 1000 // Slow down for better observation
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Enable console logging to catch any errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    console.log('Step 1: Navigating to localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    console.log('Step 2: Checking if logged in...');
    // Wait a bit for the page to fully load
    await page.waitForTimeout(3000);

    // Check if already logged in by looking for common dashboard elements
    const isLoggedIn = await page.locator('text=Workflows, text=Dashboard, [data-testid="user-menu"]').first().count() > 0;

    if (!isLoggedIn) {
      // Look for login form
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.count() > 0) {
        await emailInput.fill('stoddard.nathaniel900@gmail.com');
        await page.fill('input[type="password"]', 'Muhammad77!1');
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
      }
    } else {
      console.log('Already logged in, proceeding...');
    }

    console.log('Step 3: Navigating to Workflows page...');
    // Navigate to workflows
    await page.click('text=Workflows');
    await page.waitForLoadState('networkidle');

    console.log('Step 4: Creating new workflow or opening existing one...');
    // Try to find existing workflow or create new one
    const existingWorkflow = await page.locator('[data-testid="workflow-card"]').first();
    if (await existingWorkflow.count() > 0) {
      await existingWorkflow.click();
    } else {
      // Create new workflow
      await page.click('text=Create Workflow');
      await page.fill('input[placeholder*="workflow name"]', 'Test Airtable Width');
      await page.click('button:has-text("Create")');
    }
    await page.waitForLoadState('networkidle');

    console.log('Step 5: Adding Airtable Update Record action...');
    // Look for add action button or plus button
    const addActionButton = page.locator('button:has-text("Add Action"), [data-testid="add-action"], .add-action-button').first();
    await addActionButton.click();
    await page.waitForTimeout(1000);

    // Look for Airtable in the integration list
    await page.click('text=Airtable');
    await page.waitForTimeout(500);

    // Select Update Record action
    await page.click('text=Update Record');
    await page.waitForTimeout(1000);

    console.log('Step 6: Double-clicking to open configuration modal...');
    // Find the Airtable Update Record node and double-click it
    const airtableNode = page.locator('[data-testid*="airtable"], .react-flow__node:has-text("Update Record")').first();
    await airtableNode.dblclick();
    await page.waitForTimeout(2000);

    console.log('Step 7: Taking screenshot of initial state...');
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-width-test-1-initial.png',
      fullPage: false
    });

    // Inspect initial field layout
    console.log('Inspecting initial field layout...');
    const fieldCards = await page.locator('.field-card, [data-testid="field-card"]').all();
    for (let i = 0; i < fieldCards.length; i++) {
      const fieldCard = fieldCards[i];
      const boundingBox = await fieldCard.boundingBox();
      const styles = await fieldCard.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          maxWidth: computed.maxWidth,
          flexBasis: computed.flexBasis,
          flexGrow: computed.flexGrow,
          flexShrink: computed.flexShrink
        };
      });
      console.log(`Field card ${i}:`, { boundingBox, styles });
    }

    console.log('Step 8: Selecting a Base...');
    // Find and click base dropdown
    const baseDropdown = page.locator('select[name="baseId"], [data-testid="base-select"]').first();
    await baseDropdown.click();
    await page.waitForTimeout(500);

    // Select the first available base
    const firstBase = page.locator('option').nth(1); // Skip the placeholder option
    await firstBase.click();
    await page.waitForTimeout(2000);

    console.log('Step 9: Taking screenshot after base selection...');
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-width-test-2-base-selected.png',
      fullPage: false
    });

    console.log('Step 10: Selecting a Table...');
    // Find and click table dropdown
    const tableDropdown = page.locator('select[name="tableName"], [data-testid="table-select"]').first();
    await tableDropdown.click();
    await page.waitForTimeout(500);

    // Select the first available table
    const firstTable = page.locator('option').nth(1); // Skip the placeholder option
    await firstTable.click();
    await page.waitForTimeout(3000); // Wait for dynamic fields to load

    console.log('Step 11: Taking screenshot after table selection...');
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-width-test-3-table-selected.png',
      fullPage: false
    });

    console.log('Step 12: Detailed CSS inspection after table selection...');

    // Check ScrollArea width
    const scrollArea = page.locator('[data-radix-scroll-area-viewport]').first();
    if (await scrollArea.count() > 0) {
      const scrollAreaStyles = await scrollArea.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          paddingRight: computed.paddingRight,
          className: el.className,
          style: el.getAttribute('style')
        };
      });
      console.log('ScrollArea styles:', scrollAreaStyles);
    }

    // Check field container styles
    const fieldContainer = page.locator('.grid, .flex, [class*="grid-cols"]').first();
    if (await fieldContainer.count() > 0) {
      const containerStyles = await fieldContainer.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          gridTemplateColumns: computed.gridTemplateColumns,
          gap: computed.gap,
          className: el.className,
          style: el.getAttribute('style')
        };
      });
      console.log('Field container styles:', containerStyles);
    }

    // Check individual field cards after table selection
    const updatedFieldCards = await page.locator('.field-card, [data-testid="field-card"]').all();
    console.log(`Found ${updatedFieldCards.length} field cards after table selection`);

    for (let i = 0; i < updatedFieldCards.length; i++) {
      const fieldCard = updatedFieldCards[i];
      const boundingBox = await fieldCard.boundingBox();
      const styles = await fieldCard.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          maxWidth: computed.maxWidth,
          flexBasis: computed.flexBasis,
          flexGrow: computed.flexGrow,
          flexShrink: computed.flexShrink,
          className: el.className,
          style: el.getAttribute('style')
        };
      });
      console.log(`Updated field card ${i}:`, { boundingBox, styles });
    }

    // Check if there's a variable picker that might be getting covered
    const variablePicker = page.locator('[data-testid="variable-picker"], .variable-picker').first();
    if (await variablePicker.count() > 0) {
      const pickerBox = await variablePicker.boundingBox();
      console.log('Variable picker position:', pickerBox);
    }

    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/airtable-width-test-error.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }
}

testAirtableModalWidth();
import { chromium } from 'playwright';
import path from 'path';

async function testAirtableLayout() {
  // Launch browser with Chrome
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'  // Use Google Chrome specifically
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    console.log('Step 1: Navigate to workflows page...');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');

    console.log('Step 2: Create new workflow...');
    // Look for create workflow button
    const createButton = await page.locator('button').filter({ hasText: /create|new/i }).first();
    if (await createButton.count() > 0) {
      await createButton.click();
    } else {
      // Alternative: look for + button or similar
      await page.locator('[data-testid="create-workflow"], button[aria-label*="create"], button[title*="create"]').first().click();
    }
    await page.waitForTimeout(2000);

    console.log('Step 3: Add Airtable Update Record action...');
    // Look for add action button or similar
    const addActionBtn = await page.locator('button').filter({ hasText: /add action|add/i }).first();
    if (await addActionBtn.count() > 0) {
      await addActionBtn.click();
    } else {
      // Try finding by common selectors
      await page.locator('[data-testid="add-action"], .add-action-btn, button[aria-label*="action"]').first().click();
    }
    await page.waitForTimeout(1000);

    // Search for Airtable
    const searchInput = await page.locator('input[placeholder*="search"], input[type="search"], .search-input').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('airtable');
      await page.waitForTimeout(500);
    }

    // Click on Airtable integration
    await page.locator('text=Airtable').first().click();
    await page.waitForTimeout(1000);

    // Click on Update Record action
    await page.locator('text=Update Record').click();
    await page.waitForTimeout(2000);

    console.log('Step 4: Take screenshot - Modal first opens (base fields only)...');
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/step1-modal-initial.png',
      fullPage: true
    });

    // Get field container width initially
    const initialFieldContainer = await page.locator('.field-container, .form-field, [class*="field"]').first();
    const initialWidth = await initialFieldContainer.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, right: rect.right };
    });
    console.log('Initial field container width:', initialWidth);

    console.log('Step 5: Select a base...');
    // Find base dropdown
    const baseDropdown = await page.locator('select[name="baseId"], [data-field="baseId"] select, .base-selector select').first();
    if (await baseDropdown.count() > 0) {
      // Get first option that's not empty
      const options = await baseDropdown.locator('option').all();
      if (options.length > 1) {
        const firstOptionValue = await options[1].getAttribute('value');
        if (firstOptionValue) {
          await baseDropdown.selectOption(firstOptionValue);
          await page.waitForTimeout(2000); // Wait for tables to load
        }
      }
    }

    console.log('Step 6: Take screenshot - After selecting base...');
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/step2-base-selected.png',
      fullPage: true
    });

    console.log('Step 7: Select a table...');
    // Find table dropdown
    const tableDropdown = await page.locator('select[name="tableName"], [data-field="tableName"] select, .table-selector select').first();
    if (await tableDropdown.count() > 0) {
      await page.waitForSelector('select[name="tableName"] option:not([value=""])', { timeout: 5000 });
      const tableOptions = await tableDropdown.locator('option').all();
      if (tableOptions.length > 1) {
        const firstTableValue = await tableOptions[1].getAttribute('value');
        if (firstTableValue) {
          await tableDropdown.selectOption(firstTableValue);
          await page.waitForTimeout(3000); // Wait for dynamic fields to load
        }
      }
    }

    console.log('Step 8: Take screenshot - After selecting table (dynamic fields loaded)...');
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/step3-table-selected-fields-loaded.png',
      fullPage: true
    });

    // Get field container width after dynamic fields load
    const finalFieldContainer = await page.locator('.field-container, .form-field, [class*="field"]').first();
    const finalWidth = await finalFieldContainer.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, right: rect.right };
    });
    console.log('Final field container width:', finalWidth);

    console.log('Step 9: Inspect DOM structure...');

    // Check for modal and form structure
    const modalInfo = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"], .modal, [class*="modal"]');
      const form = document.querySelector('form');
      const fieldContainers = document.querySelectorAll('.field-container, .form-field, [class*="field"]');
      const variablePicker = document.querySelector('[class*="variable"], [class*="picker"]');

      return {
        modalWidth: modal ? modal.getBoundingClientRect().width : null,
        modalClasses: modal ? modal.className : null,
        formWidth: form ? form.getBoundingClientRect().width : null,
        formClasses: form ? form.className : null,
        fieldCount: fieldContainers.length,
        variablePickerWidth: variablePicker ? variablePicker.getBoundingClientRect().width : null,
        variablePickerClasses: variablePicker ? variablePicker.className : null
      };
    });

    console.log('DOM Structure Info:', modalInfo);

    // Check for specific CSS classes and styles that might cause width issues
    const fieldAnalysis = await page.evaluate(() => {
      const fields = document.querySelectorAll('.field-container, .form-field, [class*="field"]');
      const analysis = [];

      fields.forEach((field, index) => {
        const computedStyle = window.getComputedStyle(field);
        const rect = field.getBoundingClientRect();

        analysis.push({
          index,
          className: field.className,
          width: rect.width,
          right: rect.right,
          computedWidth: computedStyle.width,
          maxWidth: computedStyle.maxWidth,
          flexGrow: computedStyle.flexGrow,
          display: computedStyle.display
        });
      });

      return analysis;
    });

    console.log('Field Analysis:', fieldAnalysis);

    // Check for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    console.log('Console Errors Found:', consoleErrors);

    console.log('Test completed! Screenshots saved to project root.');

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/error-screenshot.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }
}

testAirtableLayout();
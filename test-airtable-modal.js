import { chromium } from 'playwright';

(async () => {
  // Launch Chrome (not Chromium)
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Navigate to localhost:3000
  await page.goto('http://localhost:3000');

  // Wait for the page to load
  await page.waitForTimeout(2000);

  console.log('🔍 Starting Airtable Update Record modal field width test...');

  try {
    // Navigate to workflows page
    console.log('📂 Navigating to workflows page...');
    await page.click('a[href="/workflows"]');
    await page.waitForTimeout(2000);

    // Look for existing workflows or create new one
    const workflowExists = await page.locator('.workflow-card, [data-testid="workflow-card"]').first().isVisible().catch(() => false);

    if (workflowExists) {
      console.log('📝 Opening existing workflow...');
      await page.locator('.workflow-card, [data-testid="workflow-card"]').first().click();
    } else {
      console.log('➕ Creating new workflow...');
      await page.click('button:has-text("Create Workflow"), button:has-text("New Workflow"), [data-testid="create-workflow"]');
      await page.waitForTimeout(1000);

      // Fill in workflow name if needed
      const nameInput = page.locator('input[placeholder*="workflow"], input[name="name"]');
      if (await nameInput.isVisible()) {
        await nameInput.fill('Test Airtable Modal Width');
        await page.click('button:has-text("Create"), button:has-text("Save")');
      }
    }

    await page.waitForTimeout(3000);

    // Look for Add Action button or existing Airtable node
    let airtableNode = page.locator('[data-testid*="airtable"], .react-flow__node:has-text("Airtable")').first();

    if (await airtableNode.isVisible()) {
      console.log('🔧 Found existing Airtable node, clicking it...');
      await airtableNode.dblclick();
    } else {
      console.log('➕ Adding new Airtable Update Record action...');

      // Click Add Action button
      await page.click('button:has-text("Add Action"), [data-testid="add-action"]');
      await page.waitForTimeout(1000);

      // Search for Airtable
      await page.fill('input[placeholder*="Search"], input[type="search"]', 'airtable');
      await page.waitForTimeout(500);

      // Click on Airtable
      await page.click('text=Airtable');
      await page.waitForTimeout(1000);

      // Click on Update Record
      await page.click('text=Update Record');
      await page.waitForTimeout(1000);
    }

    // Wait for modal to open
    await page.waitForSelector('[role="dialog"], .modal, [data-testid="config-modal"]', { timeout: 10000 });

    console.log('📸 Taking screenshot 1: Initial modal state...');
    await page.screenshot({ path: 'airtable-modal-1-initial.png', fullPage: true });

    // Get initial field widths using DevTools
    const initialFieldWidths = await page.evaluate(() => {
      const fields = document.querySelectorAll('[class*="field"], .form-field, [data-testid*="field"]');
      const scrollArea = document.querySelector('[data-radix-scroll-area-viewport], .scroll-area');
      return {
        fieldCount: fields.length,
        scrollAreaWidth: scrollArea ? scrollArea.offsetWidth : 'not found',
        fieldWidths: Array.from(fields).slice(0, 5).map(field => ({
          className: field.className,
          width: field.offsetWidth,
          computedStyle: getComputedStyle(field).width
        }))
      };
    });

    console.log('📊 Initial field measurements:', initialFieldWidths);

    // Select a base
    console.log('🗂️ Selecting base...');
    const baseDropdown = page.locator('select:has(option:text-matches("Base", "i)), [data-testid="base-select"]').first();

    if (await baseDropdown.isVisible()) {
      await baseDropdown.selectOption({ index: 1 }); // Select first non-empty option
      await page.waitForTimeout(2000);

      console.log('📸 Taking screenshot 2: After base selection...');
      await page.screenshot({ path: 'airtable-modal-2-base-selected.png', fullPage: true });
    }

    // Select a table
    console.log('📋 Selecting table...');
    const tableDropdown = page.locator('select:has(option:text-matches("Table", "i)), [data-testid="table-select"]').first();

    if (await tableDropdown.isVisible()) {
      await tableDropdown.selectOption({ index: 1 }); // Select first non-empty option
      await page.waitForTimeout(3000); // Wait for dynamic fields to load

      console.log('📸 Taking screenshot 3: After table selection with dynamic fields...');
      await page.screenshot({ path: 'airtable-modal-3-table-selected.png', fullPage: true });

      // Get field widths after table selection
      const dynamicFieldWidths = await page.evaluate(() => {
        const fields = document.querySelectorAll('[class*="field"], .form-field, [data-testid*="field"]');
        const scrollArea = document.querySelector('[data-radix-scroll-area-viewport], .scroll-area');
        const modalContent = document.querySelector('[role="dialog"] > div, .modal-content');

        return {
          fieldCount: fields.length,
          scrollAreaWidth: scrollArea ? scrollArea.offsetWidth : 'not found',
          modalWidth: modalContent ? modalContent.offsetWidth : 'not found',
          fieldWidths: Array.from(fields).slice(0, 10).map((field, index) => ({
            index,
            className: field.className,
            width: field.offsetWidth,
            computedStyle: getComputedStyle(field).width,
            hasInlineStyles: field.style.cssText || 'none'
          }))
        };
      });

      console.log('📊 Dynamic field measurements:', dynamicFieldWidths);

      // Open DevTools to inspect CSS
      console.log('🔍 Opening DevTools for inspection...');
      await page.evaluate(() => {
        // Focus on the first field that might be too wide
        const fields = document.querySelectorAll('[class*="field"], .form-field');
        if (fields.length > 0) {
          fields[0].scrollIntoView();
          fields[0].style.border = '2px solid red'; // Highlight for inspection
        }
      });

      // Take a final screenshot with DevTools context
      await page.screenshot({ path: 'airtable-modal-4-devtools-ready.png', fullPage: true });

      // Check for console errors
      const logs = [];
      page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));

      await page.waitForTimeout(2000);

      console.log('📝 Console messages during test:', logs);

      // Get specific CSS information about width constraints
      const cssAnalysis = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
        const fieldContainer = document.querySelector('.space-y-4, .form-fields');
        const fields = document.querySelectorAll('[class*="field"], .form-field');

        const getElementInfo = (element, name) => {
          if (!element) return { name, found: false };

          const style = getComputedStyle(element);
          return {
            name,
            found: true,
            width: element.offsetWidth,
            computedWidth: style.width,
            maxWidth: style.maxWidth,
            paddingRight: style.paddingRight,
            className: element.className,
            hasOverflow: element.scrollWidth > element.offsetWidth
          };
        };

        return {
          modal: getElementInfo(modal, 'Modal'),
          scrollArea: getElementInfo(scrollArea, 'ScrollArea'),
          fieldContainer: getElementInfo(fieldContainer, 'Field Container'),
          firstField: getElementInfo(fields[0], 'First Field'),
          lastField: getElementInfo(fields[fields.length - 1], 'Last Field'),
          totalFields: fields.length
        };
      });

      console.log('🎯 CSS Analysis Results:', JSON.stringify(cssAnalysis, null, 2));
    }

    console.log('✅ Test completed! Check the screenshots and console output above.');
    console.log('📸 Screenshots saved: airtable-modal-1-initial.png, airtable-modal-2-base-selected.png, airtable-modal-3-table-selected.png, airtable-modal-4-devtools-ready.png');

  } catch (error) {
    console.error('❌ Error during test:', error);
    await page.screenshot({ path: 'airtable-modal-error.png', fullPage: true });
  }

  // Keep browser open for manual inspection
  console.log('🔧 Browser kept open for manual DevTools inspection. Press Ctrl+C to close.');

  // Wait indefinitely so user can inspect
  await new Promise(() => {});

})();
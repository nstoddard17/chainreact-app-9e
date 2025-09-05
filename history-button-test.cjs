const { chromium } = require('playwright');

(async () => {
  console.log('🔍 Checking for History Button in ChainReact Workflow Builder...');
  
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome',
    slowMo: 1000
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📍 Step 1: Navigate to localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(3000);
    
    console.log('📍 Step 2: Handle login form');
    
    // Wait for either login form or already authenticated state
    try {
      // Check if already logged in by looking for navigation elements
      await page.waitForSelector('a[href="/workflows"], text="Workflows"', { timeout: 5000 });
      console.log('✅ Already authenticated');
    } catch {
      console.log('🔐 Need to log in...');
      
      // Look for login form
      const emailSelector = 'input[type="email"], input[name="email"], input[placeholder*="email" i]';
      const passwordSelector = 'input[type="password"], input[name="password"], input[placeholder*="password" i]';
      const submitSelector = 'button[type="submit"], button:has-text("Sign"), button:has-text("Log")';
      
      await page.fill(emailSelector, 'stoddard.nathaniel900@gmail.com');
      await page.fill(passwordSelector, 'Muhammad77!1');
      await page.click(submitSelector);
      
      await page.waitForTimeout(3000);
    }
    
    console.log('📍 Step 3: Navigate to workflows page');
    
    // Try direct navigation first
    await page.goto('http://localhost:3000/workflows');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'workflows-page-check.png', fullPage: true });
    console.log('📸 Screenshot saved: workflows-page-check.png');
    
    console.log('📍 Step 4: Look for existing workflows');
    
    // Based on server logs, there's a workflow with ID 15aea515-e8f0-47c9-8839-f29bee8e67db
    // Let's try to navigate directly to it
    const workflowId = '15aea515-e8f0-47c9-8839-f29bee8e67db';
    const builderUrl = `http://localhost:3000/workflows/builder?id=${workflowId}`;
    
    console.log(`🎯 Navigating directly to workflow builder: ${builderUrl}`);
    await page.goto(builderUrl);
    await page.waitForTimeout(5000);
    
    console.log('📍 Step 5: Wait for workflow builder to load');
    
    // Wait for workflow builder elements
    const builderSelectors = [
      '.react-flow',
      '[data-testid="workflow-builder"]',
      '.workflow-canvas',
      'div:has-text("Save")',
      'button:has-text("Save")'
    ];
    
    let builderLoaded = false;
    for (const selector of builderSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`✅ Workflow builder loaded (found: ${selector})`);
        builderLoaded = true;
        break;
      } catch (e) {
        console.log(`❌ Builder selector not found: ${selector}`);
      }
    }
    
    await page.screenshot({ path: 'workflow-builder-loaded.png', fullPage: true });
    console.log('📸 Screenshot saved: workflow-builder-loaded.png');
    
    console.log('📍 Step 6: Look for toolbar buttons');
    
    // Find all buttons in the page
    const allButtons = await page.locator('button').all();
    console.log(`Found ${allButtons.length} buttons total`);
    
    console.log('🔍 Analyzing all buttons:');
    for (let i = 0; i < Math.min(allButtons.length, 20); i++) {
      try {
        const buttonText = await allButtons[i].textContent();
        const buttonTitle = await allButtons[i].getAttribute('title');
        const buttonClass = await allButtons[i].getAttribute('class');
        const hasIcon = await allButtons[i].locator('svg, [data-lucide]').count() > 0;
        
        console.log(`  Button ${i}: "${buttonText?.trim() || 'No text'}" | Title: "${buttonTitle || 'No title'}" | HasIcon: ${hasIcon}`);
        
        // Check specifically for History button
        if (buttonText?.toLowerCase().includes('history') || buttonTitle?.toLowerCase().includes('history')) {
          console.log(`🎯 FOUND HISTORY BUTTON at index ${i}!`);
          
          // Highlight it and take screenshot
          await allButtons[i].scrollIntoViewIfNeeded();
          await page.screenshot({ path: 'history-button-highlighted.png', fullPage: true });
          
          // Try to click it
          await allButtons[i].click();
          await page.waitForTimeout(2000);
          
          // Check for modal
          const modalExists = await page.locator('.modal, [role="dialog"], [data-testid="modal"], .fixed.inset-0').count() > 0;
          if (modalExists) {
            console.log('✅ History modal opened!');
            await page.screenshot({ path: 'history-modal-opened.png', fullPage: true });
          } else {
            console.log('⚠️  History button clicked but no modal detected');
          }
          
          builderLoaded = true;
          break;
        }
      } catch (e) {
        console.log(`  Button ${i}: Error reading button details`);
      }
    }
    
    console.log('📍 Step 7: Look specifically for clock icons (History button typically has clock icon)');
    
    // Look for clock icons
    const clockSelectors = [
      '[data-lucide="clock"]',
      '.lucide-clock',
      'svg[class*="clock"]',
      '[data-testid*="clock"]',
      '[title*="history" i]'
    ];
    
    for (const clockSelector of clockSelectors) {
      const clockElements = await page.locator(clockSelector).count();
      if (clockElements > 0) {
        console.log(`🕒 Found ${clockElements} clock icon(s) with selector: ${clockSelector}`);
        
        // Try clicking on the parent button
        const parentButton = page.locator(clockSelector).locator('..').locator('button').first();
        if (await parentButton.count() > 0) {
          console.log('Clicking on button containing clock icon...');
          await parentButton.click();
          await page.waitForTimeout(2000);
          
          const modalExists = await page.locator('.modal, [role="dialog"], [data-testid="modal"]').count() > 0;
          if (modalExists) {
            console.log('✅ Modal opened after clicking clock icon button!');
            await page.screenshot({ path: 'clock-modal-opened.png', fullPage: true });
          }
        }
      }
    }
    
    console.log('📍 Step 8: Check page content for any History-related text');
    const pageText = await page.textContent('body');
    const hasHistoryText = pageText?.toLowerCase().includes('history');
    console.log(`Has "history" text in page: ${hasHistoryText}`);
    
    if (hasHistoryText) {
      console.log('📝 Found "history" text - looking for clickable elements...');
      const historyElements = await page.locator('text="History", text="history"').count();
      console.log(`Found ${historyElements} elements with "history" text`);
    }
    
    console.log('📍 Step 9: Final assessment');
    
    if (!builderLoaded) {
      console.log('❌ Workflow builder may not have loaded properly');
    } else {
      console.log('✅ Workflow builder appears to be loaded');
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'final-state.png', fullPage: true });
    console.log('📸 Final screenshot saved: final-state.png');
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
    await page.screenshot({ path: 'error-state.png', fullPage: true });
  } finally {
    console.log('🏁 Test completed. Browser will stay open for manual inspection...');
    // Keep browser open for manual inspection
    // await browser.close();
  }
})();
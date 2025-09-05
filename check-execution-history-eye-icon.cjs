const { chromium } = require('playwright');

(async () => {
  // Launch browser - using default system browser as per PLAYWRIGHT.md
  const browser = await chromium.launch({ 
    headless: false,  // Keep visible for debugging
    slowMo: 1000      // Add delay between actions
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    console.log('🚀 Navigating to ChainReact application...');
    
    // 1. Navigate to localhost:3000
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ path: 'step1-homepage.png', fullPage: true });
    console.log('📸 Screenshot saved: step1-homepage.png');
    
    // 2. Login with provided credentials
    console.log('🔐 Attempting to login...');
    
    // Look for login form or check if already logged in
    const loginForm = page.locator('form').filter({ hasText: /email|login|sign/i }).first();
    const workflowsLink = page.locator('a[href="/workflows"]').first();
    
    if (await loginForm.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('🔍 Found login form, attempting to login...');
      
      // Fill in email
      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
      await emailInput.fill('stoddard.nathaniel900@gmail.com');
      
      // Fill in password
      const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
      await passwordInput.fill('Muhammad77!1');
      
      // Submit form
      const submitButton = page.locator('button[type="submit"], button:has-text("sign in"), button:has-text("login")').first();
      await submitButton.click();
      
      // Wait for redirect
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'step2-after-login.png', fullPage: true });
      console.log('📸 Screenshot saved: step2-after-login.png');
      
    } else if (await workflowsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Already logged in, found workflows link');
    } else {
      console.log('❌ Could not find login form or workflows link');
      await page.screenshot({ path: 'step2-login-issue.png', fullPage: true });
    }
    
    // 3. Navigate to Workflows page
    console.log('🎯 Navigating to Workflows page...');
    
    // Try multiple ways to get to workflows
    const workflowsLinks = [
      page.locator('a[href="/workflows"]').first(),
      page.locator('text=Workflows').first(),
      page.locator('nav a:has-text("Workflows")').first()
    ];
    
    let navigated = false;
    for (const link of workflowsLinks) {
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await link.click();
        navigated = true;
        break;
      }
    }
    
    if (!navigated) {
      console.log('🔄 Direct navigation to /workflows...');
      await page.goto('http://localhost:3000/workflows');
    }
    
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'step3-workflows-page.png', fullPage: true });
    console.log('📸 Screenshot saved: step3-workflows-page.png');
    
    // 4. Look for existing workflows and open one
    console.log('🔍 Looking for existing workflows...');
    
    // Wait a bit for workflows to load
    await page.waitForTimeout(3000);
    
    // Look for workflow cards or list items
    const workflowItems = page.locator('[data-testid*="workflow"], .workflow-card, .workflow-item, a[href*="/workflows/builder"]');
    const itemCount = await workflowItems.count();
    
    console.log(`🎯 Found ${itemCount} potential workflow items`);
    
    if (itemCount > 0) {
      console.log('✅ Opening first available workflow...');
      await workflowItems.first().click();
      await page.waitForLoadState('networkidle');
    } else {
      console.log('🆕 No existing workflows found, creating a new one...');
      
      // Look for create/new workflow button
      const createButtons = [
        page.locator('button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New")'),
        page.locator('[data-testid*="create"], [data-testid*="new"]')
      ];
      
      let created = false;
      for (const button of createButtons) {
        const buttonCount = await button.count();
        if (buttonCount > 0) {
          await button.first().click();
          created = true;
          break;
        }
      }
      
      if (!created) {
        console.log('🔄 Trying direct navigation to workflow builder...');
        await page.goto('http://localhost:3000/workflows/builder');
      }
      
      await page.waitForLoadState('networkidle');
    }
    
    await page.screenshot({ path: 'step4-workflow-builder.png', fullPage: true });
    console.log('📸 Screenshot saved: step4-workflow-builder.png');
    
    // 5. Look for Execution History section
    console.log('🔍 Searching for Execution History section...');
    
    // Wait for page to fully load
    await page.waitForTimeout(5000);
    
    // Look for execution history related elements
    const historySelectors = [
      'text="Execution History"',
      'text="execution history"',
      'text="Executions"',
      'text="executions"',
      'text="History"',
      'text="history"',
      '[data-testid*="history"]',
      '[data-testid*="execution"]',
      '.execution-history',
      '.executions',
      '.history'
    ];
    
    let historyFound = false;
    let historyElement = null;
    
    for (const selector of historySelectors) {
      try {
        historyElement = page.locator(selector).first();
        if (await historyElement.isVisible({ timeout: 2000 })) {
          console.log(`✅ Found execution history with selector: ${selector}`);
          historyFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (historyFound) {
      // Scroll to the history section
      await historyElement.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'step5-execution-history-section.png', fullPage: true });
      console.log('📸 Screenshot saved: step5-execution-history-section.png');
      
      // 6. Look for eye icons in execution history
      console.log('👁️ Searching for eye icons in execution history...');
      
      const eyeSelectors = [
        'svg[data-testid="eye-icon"]',
        'button[aria-label*="view"]',
        'button[title*="view"]',
        '.eye-icon',
        'svg:has(path[d*="eye"])',
        'button:has(svg:has(path[d*="M15"]))',  // Common eye icon path
        '[data-icon="eye"]',
        '.fa-eye',
        'button:has-text("View")',
        'a:has-text("View")'
      ];
      
      let eyeIconFound = false;
      let eyeElements = [];
      
      for (const selector of eyeSelectors) {
        try {
          const elements = page.locator(selector);
          const count = await elements.count();
          if (count > 0) {
            console.log(`🎯 Found ${count} potential eye icon(s) with selector: ${selector}`);
            eyeIconFound = true;
            eyeElements.push({ selector, count, elements });
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (eyeIconFound) {
        console.log('✅ Eye icons found in execution history!');
        
        // Take detailed screenshots of eye icons
        for (let i = 0; i < eyeElements.length; i++) {
          const { elements } = eyeElements[i];
          if (await elements.first().isVisible()) {
            await elements.first().scrollIntoViewIfNeeded();
            await page.screenshot({ path: `step6-eye-icons-${i}.png`, fullPage: true });
            console.log(`📸 Screenshot saved: step6-eye-icons-${i}.png`);
          }
        }
        
        // Try clicking the first eye icon
        try {
          await eyeElements[0].elements.first().click();
          await page.waitForLoadState('networkidle');
          await page.screenshot({ path: 'step7-after-eye-click.png', fullPage: true });
          console.log('📸 Screenshot saved: step7-after-eye-click.png');
        } catch (e) {
          console.log('⚠️ Could not click eye icon:', e.message);
        }
        
      } else {
        console.log('❌ No eye icons found in execution history');
        await page.screenshot({ path: 'step6-no-eye-icons.png', fullPage: true });
        console.log('📸 Screenshot saved: step6-no-eye-icons.png');
      }
      
    } else {
      console.log('❌ No execution history section found');
      
      // Look for any execution-related elements on the page
      const allElements = await page.locator('*').allTextContents();
      const executionRelated = allElements.filter(text => 
        text.toLowerCase().includes('execution') || 
        text.toLowerCase().includes('history') || 
        text.toLowerCase().includes('run')
      );
      
      console.log('🔍 Found these execution-related texts:', executionRelated.slice(0, 10));
      
      await page.screenshot({ path: 'step5-no-execution-history.png', fullPage: true });
      console.log('📸 Screenshot saved: step5-no-execution-history.png');
    }
    
    // 7. Final comprehensive screenshot
    await page.screenshot({ path: 'step8-final-view.png', fullPage: true });
    console.log('📸 Screenshot saved: step8-final-view.png');
    
    console.log('✅ Execution history eye icon check complete!');
    
  } catch (error) {
    console.error('❌ Error during execution:', error.message);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
    console.log('📸 Error screenshot saved: error-screenshot.png');
  } finally {
    await browser.close();
  }
})();
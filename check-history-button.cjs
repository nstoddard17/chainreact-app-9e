const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Starting History Button Check...');
  
  // Launch Chrome browser
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
    // Step 1: Navigate to localhost:3000
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Step 2: Log in
    console.log('Logging in...');
    await page.fill('input[type="email"]', 'stoddard.nathaniel900@gmail.com');
    await page.fill('input[type="password"]', 'Muhammad77!1');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    // Wait a moment for dashboard to load
    await page.waitForTimeout(2000);
    
    // Step 3: Navigate to Workflows page
    console.log('Navigating to Workflows page...');
    
    // Try different selectors for workflows navigation
    const workflowSelectors = [
      'a[href="/workflows"]',
      'text=Workflows',
      '[data-testid="workflows-nav"]',
      'nav a:has-text("Workflows")'
    ];
    
    let workflowNavFound = false;
    for (const selector of workflowSelectors) {
      try {
        await page.click(selector, { timeout: 2000 });
        workflowNavFound = true;
        console.log(`Found workflows navigation with selector: ${selector}`);
        break;
      } catch (e) {
        console.log(`Selector ${selector} not found, trying next...`);
      }
    }
    
    if (!workflowNavFound) {
      // Try direct navigation
      console.log('Direct navigation to workflows page...');
      await page.goto('http://localhost:3000/workflows');
    }
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot of workflows page
    await page.screenshot({ path: 'workflows-page.png', fullPage: true });
    console.log('Screenshot taken: workflows-page.png');
    
    // Step 4: Look for existing workflows
    console.log('Looking for existing workflows...');
    
    const workflowSelectors2 = [
      '.workflow-card',
      '[data-testid="workflow-item"]',
      '.grid .cursor-pointer',
      'div:has-text("Workflow")',
      '.border.rounded'
    ];
    
    let workflowFound = false;
    for (const selector of workflowSelectors2) {
      try {
        const workflows = await page.locator(selector).count();
        if (workflows > 0) {
          console.log(`Found ${workflows} workflows with selector: ${selector}`);
          // Click on the first workflow
          await page.locator(selector).first().click();
          workflowFound = true;
          break;
        }
      } catch (e) {
        console.log(`No workflows found with selector: ${selector}`);
      }
    }
    
    if (!workflowFound) {
      console.log('No existing workflows found. Let me check what\'s on the page...');
      const pageContent = await page.content();
      console.log('Page title:', await page.title());
      
      // Try to find any clickable elements that might be workflows
      const clickableElements = await page.locator('div[class*="cursor-pointer"], button, a').count();
      console.log(`Found ${clickableElements} clickable elements`);
      
      // Look for any text that might indicate workflows
      const hasWorkflowText = await page.locator('text="workflow"').count() > 0;
      console.log('Has workflow text:', hasWorkflowText);
      
      if (hasWorkflowText) {
        // Try clicking on any element with workflow text
        try {
          await page.locator('text="workflow"').first().click();
          workflowFound = true;
        } catch (e) {
          console.log('Could not click on workflow text element');
        }
      }
    }
    
    if (workflowFound) {
      console.log('Clicked on a workflow, waiting for builder to load...');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // Step 5: Check for the workflow builder toolbar
      console.log('Looking for workflow builder toolbar...');
      
      // Take screenshot of the builder
      await page.screenshot({ path: 'workflow-builder.png', fullPage: true });
      console.log('Screenshot taken: workflow-builder.png');
      
      // Step 6: Look for History button
      console.log('Looking for History button...');
      
      const historySelectors = [
        'button:has-text("History")',
        '[data-testid="history-button"]',
        'button[title*="History"]',
        'button:has([data-lucide="clock"])',
        'button:has(.lucide-clock)',
        'text=History'
      ];
      
      let historyButtonFound = false;
      for (const selector of historySelectors) {
        try {
          const historyButton = page.locator(selector);
          const count = await historyButton.count();
          if (count > 0) {
            console.log(`Found History button with selector: ${selector}`);
            historyButtonFound = true;
            
            // Take screenshot highlighting the button
            await page.screenshot({ path: 'history-button-found.png', fullPage: true });
            
            // Try to click on it
            await historyButton.first().click();
            await page.waitForTimeout(2000);
            
            // Check if modal opened
            const modalVisible = await page.locator('.modal, [role="dialog"], [data-testid="modal"]').isVisible();
            if (modalVisible) {
              console.log('History modal opened successfully!');
              await page.screenshot({ path: 'history-modal.png', fullPage: true });
            } else {
              console.log('History button clicked but no modal detected');
            }
            
            break;
          }
        } catch (e) {
          console.log(`History button not found with selector: ${selector}`);
        }
      }
      
      if (!historyButtonFound) {
        console.log('History button not found. Checking all buttons in toolbar...');
        
        // Get all buttons in the page
        const buttons = await page.locator('button').all();
        console.log(`Found ${buttons.length} buttons total`);
        
        for (let i = 0; i < buttons.length; i++) {
          try {
            const buttonText = await buttons[i].textContent();
            const buttonTitle = await buttons[i].getAttribute('title');
            console.log(`Button ${i}: Text="${buttonText}", Title="${buttonTitle}"`);
          } catch (e) {
            console.log(`Could not read button ${i}`);
          }
        }
        
        // Look for specific toolbar area
        const toolbarSelectors = [
          '.toolbar',
          '[data-testid="toolbar"]',
          '.flex.gap-2',
          '.space-x-2'
        ];
        
        for (const toolbarSelector of toolbarSelectors) {
          try {
            const toolbar = page.locator(toolbarSelector);
            if (await toolbar.count() > 0) {
              console.log(`Found toolbar with selector: ${toolbarSelector}`);
              const toolbarButtons = await toolbar.locator('button').all();
              console.log(`Toolbar has ${toolbarButtons.length} buttons`);
              
              for (let i = 0; i < toolbarButtons.length; i++) {
                const buttonText = await toolbarButtons[i].textContent();
                console.log(`Toolbar button ${i}: "${buttonText}"`);
              }
              break;
            }
          } catch (e) {
            console.log(`Toolbar not found with selector: ${toolbarSelector}`);
          }
        }
      }
    } else {
      console.log('Could not find or access any workflows');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    console.log('Test completed. Closing browser...');
    await browser.close();
  }
})();
const { chromium } = require('playwright');

async function verifyHistoryButton() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`Console error: ${msg.text()}`);
    }
  });

  try {
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    console.log('2. Clicking Sign In button...');
    await page.click('text=Sign In');
    await page.waitForLoadState('networkidle');
    
    console.log('3. Logging in...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'stoddard.nathaniel900@gmail.com');
    await page.fill('input[type="password"]', 'Muhammad77!1');
    await page.click('button[type="submit"]');
    
    console.log('4. Waiting for dashboard to load...');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of dashboard
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/dashboard-state.png' 
    });
    
    console.log('5. Navigating to Workflows page via URL...');
    // Navigate directly to workflows page via URL instead of clicking
    await page.goto('http://localhost:3000/workflows', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Take screenshot of workflows page
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/workflows-page-direct.png' 
    });
    
    console.log('6. Looking for existing workflows or creating a new one...');
    
    // Check current URL to make sure we're on workflows page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    // Look for Create Workflow button or existing workflows
    const createWorkflowBtn = page.locator('text="Create Workflow", button:has-text("Create Workflow"), [data-testid="create-workflow"]');
    const existingWorkflows = page.locator('.workflow-card, [data-testid="workflow-card"], .cursor-pointer:not(nav *)');
    
    const createBtnCount = await createWorkflowBtn.count();
    const workflowCount = await existingWorkflows.count();
    
    console.log(`Found ${createBtnCount} create buttons and ${workflowCount} existing workflows`);
    
    if (workflowCount > 0) {
      console.log('Clicking on first existing workflow...');
      await existingWorkflows.first().click();
    } else if (createBtnCount > 0) {
      console.log('Clicking Create Workflow button...');
      await createWorkflowBtn.first().click();
    } else {
      // Try to find any button with "Create" text
      console.log('Looking for any Create button...');
      const anyCreateBtn = page.locator('button:has-text("Create")');
      const anyCreateCount = await anyCreateBtn.count();
      console.log(`Found ${anyCreateCount} buttons with "Create" text`);
      
      if (anyCreateCount > 0) {
        await anyCreateBtn.first().click();
      } else {
        console.log('No create button found, taking screenshot for debugging...');
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/no-create-button.png' 
        });
        throw new Error('No create button or existing workflows found');
      }
    }
    
    console.log('7. Waiting for workflow builder to load...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Take screenshot of workflow builder
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/workflow-builder-loaded.png' 
    });
    
    console.log('8. Looking for the History button...');
    
    // Look for History button with comprehensive selectors
    const historySelectors = [
      'button:has-text("History")',
      '[data-testid="history-button"]',
      'button:has([data-lucide="clock"])',
      'button:has(.lucide-clock)',
      'button[title*="History"]',
      'button[aria-label*="History"]',
      'text="History"',
      '.history-button',
      '[class*="history"]'
    ];
    
    let historyButton = null;
    let selectorUsed = null;
    
    for (const selector of historySelectors) {
      try {
        const button = page.locator(selector);
        const count = await button.count();
        if (count > 0 && await button.first().isVisible()) {
          console.log(`✅ Found History button using selector: ${selector}`);
          historyButton = button.first();
          selectorUsed = selector;
          break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    if (historyButton) {
      console.log('✅ HISTORY BUTTON FOUND!');
      
      // Highlight the button
      await historyButton.hover();
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-button-highlighted.png' 
      });
      
      console.log('9. Clicking History button...');
      await historyButton.click();
      await page.waitForTimeout(3000);
      
      // Look for modal
      const modalSelectors = [
        '[role="dialog"]',
        '.modal',
        '[data-testid="execution-history-modal"]',
        'text="Workflow Execution History"',
        'text="Execution History"'
      ];
      
      let modalOpened = false;
      for (const selector of modalSelectors) {
        const modal = page.locator(selector);
        if (await modal.count() > 0 && await modal.first().isVisible()) {
          console.log(`✅ MODAL OPENED using selector: ${selector}`);
          modalOpened = true;
          break;
        }
      }
      
      if (modalOpened) {
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/execution-history-modal-open.png' 
        });
        
        // Check for execution entries
        const entrySelectors = ['.execution-entry', 'tr', '.list-item', '.border'];
        let maxEntries = 0;
        for (const selector of entrySelectors) {
          const count = await page.locator(selector).count();
          if (count > maxEntries) maxEntries = count;
        }
        
        console.log(`Found ${maxEntries} execution entries`);
      }
      
      console.log('\n📋 FINAL VERIFICATION RESULTS:');
      console.log(`✅ History Button Present: YES`);
      console.log(`✅ Selector Used: ${selectorUsed}`);
      console.log(`✅ Modal Opens: ${modalOpened ? 'YES' : 'NO'}`);
      
    } else {
      console.log('❌ HISTORY BUTTON NOT FOUND');
      
      // Debug: List all buttons
      const allButtons = await page.locator('button').all();
      console.log(`\nFound ${allButtons.length} buttons on the page:`);
      
      for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
        try {
          const text = await allButtons[i].textContent();
          const isVisible = await allButtons[i].isVisible();
          const classes = await allButtons[i].getAttribute('class');
          console.log(`${i + 1}. "${text}" (visible: ${isVisible}) - classes: ${classes}`);
        } catch (error) {
          console.log(`${i + 1}. Error reading button`);
        }
      }
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-button-not-found-debug.png' 
      });
      
      console.log('\n📋 FINAL VERIFICATION RESULTS:');
      console.log(`❌ History Button Present: NO`);
    }
    
    console.log('\n📸 All screenshots saved to .playwright-mcp/ directory');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/verification-error.png' 
    });
  } finally {
    await browser.close();
  }
}

verifyHistoryButton().catch(console.error);
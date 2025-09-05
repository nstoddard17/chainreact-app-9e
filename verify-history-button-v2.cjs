const { chromium } = require('playwright');
const path = require('path');

async function verifyHistoryButton() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 // Slow down for visibility
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Add console error monitoring
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`Console error: ${msg.text()}`);
    }
  });

  try {
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Take screenshot of initial page
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/01-landing-page.png' 
    });
    
    console.log('2. Clicking Sign In button...');
    // Click on Sign In button in the top right
    await page.click('text=Sign In');
    
    // Wait for login page to load
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of login page
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/02-login-page.png' 
    });
    
    console.log('3. Logging in...');
    // Wait for login form and fill credentials
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'stoddard.nathaniel900@gmail.com');
    await page.fill('input[type="password"]', 'Muhammad77!1');
    
    // Take screenshot before clicking login
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/03-login-form-filled.png' 
    });
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load
    console.log('4. Waiting for dashboard to load...');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of dashboard
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/04-dashboard.png' 
    });
    
    console.log('5. Navigating to Workflows page...');
    // Click on Workflows in the navigation
    await page.click('text=Workflows');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of workflows page
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/05-workflows-page.png' 
    });
    
    console.log('6. Looking for existing workflows or creating a new one...');
    
    // Check if there are any existing workflows by looking for workflow-related elements
    const workflowElements = await page.locator('text=Create Workflow, .workflow-card, [data-testid="workflow-card"], .cursor-pointer:has-text("workflow"), .grid > div, .space-y-4 > div').count();
    
    if (workflowElements > 0) {
      console.log('Found workflow elements, looking for existing workflows...');
      // Try to find clickable workflow cards
      const clickableWorkflows = page.locator('.cursor-pointer, .hover\\:shadow, [data-testid="workflow-card"]');
      const workflowCount = await clickableWorkflows.count();
      
      if (workflowCount > 0) {
        console.log(`Found ${workflowCount} existing workflows, clicking on the first one...`);
        await clickableWorkflows.first().click();
      } else {
        console.log('No existing workflows found, looking for create button...');
        // Look for "Create Workflow" or similar button
        const createBtn = page.locator('text=Create Workflow, text=New Workflow, button:has-text("Create"), text=Create');
        await createBtn.first().click();
      }
    } else {
      console.log('No workflow elements found, looking for create button...');
      // Look for any create button
      const createBtn = page.locator('text=Create, button:has-text("Create"), text=New');
      await createBtn.first().click();
    }
    
    console.log('7. Waiting for workflow builder to load...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Extra wait for the builder to fully initialize
    
    // Take screenshot of workflow builder
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/06-workflow-builder.png' 
    });
    
    console.log('8. Looking for the History button in the toolbar...');
    
    // Take screenshot of current state for debugging
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/07-looking-for-history-button.png' 
    });
    
    // Look for History button with various selectors
    const historyButtonSelectors = [
      'button:has-text("History")',
      '[data-testid="history-button"]',
      'button:has([data-lucide="clock"])',
      'button:has(.lucide-clock)',
      'button[title*="History"]',
      'button[aria-label*="History"]',
      'text=History'
    ];
    
    let historyButtonFound = false;
    let historyButton = null;
    
    for (const selector of historyButtonSelectors) {
      try {
        const button = page.locator(selector);
        const count = await button.count();
        if (count > 0) {
          console.log(`✅ Found History button using selector: ${selector}`);
          historyButton = button.first();
          historyButtonFound = true;
          break;
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    if (historyButtonFound) {
      console.log('✅ History button found! Taking screenshot...');
      
      // Highlight the History button by hovering over it
      await historyButton.hover();
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/08-history-button-found.png' 
      });
      
      console.log('9. Clicking on History button...');
      await historyButton.click();
      
      // Wait for modal to appear
      await page.waitForTimeout(3000);
      
      // Look for the execution history modal with various selectors
      const modalSelectors = [
        '[role="dialog"]',
        '.modal',
        '[data-testid="execution-history-modal"]',
        'text=Workflow Execution History',
        'text=Execution History',
        'text=History'
      ];
      
      let modalFound = false;
      for (const selector of modalSelectors) {
        const modal = page.locator(selector);
        const count = await modal.count();
        if (count > 0) {
          console.log(`✅ Found modal using selector: ${selector}`);
          modalFound = true;
          break;
        }
      }
      
      if (modalFound) {
        console.log('✅ Execution History modal opened successfully!');
        
        // Take screenshot of the modal
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/09-execution-history-modal.png' 
        });
        
        // Check for execution entries
        const executionSelectors = [
          '.execution-entry',
          '[data-testid="execution-entry"]',
          '.border',
          '.rounded',
          'tr',
          '.list-item'
        ];
        
        let executionEntries = 0;
        for (const selector of executionSelectors) {
          const entries = await page.locator(selector).count();
          if (entries > executionEntries) {
            executionEntries = entries;
          }
        }
        
        if (executionEntries > 0) {
          console.log(`✅ Found ${executionEntries} execution entries in the history`);
        } else {
          console.log('ℹ️ No execution entries found (this is normal for new workflows)');
        }
        
        // Take final screenshot showing any execution entries
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/10-execution-entries.png' 
        });
        
      } else {
        console.log('❌ Execution History modal did not open');
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/09-modal-not-found.png' 
        });
      }
      
    } else {
      console.log('❌ History button not found in the toolbar');
      
      // Take screenshot of all buttons in the toolbar for debugging
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} buttons on the page`);
      
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        try {
          const buttonText = await allButtons[i].textContent();
          const isVisible = await allButtons[i].isVisible();
          console.log(`Button ${i + 1}: "${buttonText}" (visible: ${isVisible})`);
        } catch (error) {
          console.log(`Button ${i + 1}: Error reading button - ${error.message}`);
        }
      }
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/08-history-button-not-found.png' 
      });
    }
    
    console.log('\n📋 VERIFICATION SUMMARY:');
    console.log(`History Button Present: ${historyButtonFound ? '✅ YES' : '❌ NO'}`);
    
    if (historyButtonFound) {
      // Check if modal opened
      let modalOpened = false;
      const modalSelectors = [
        '[role="dialog"]',
        '.modal',
        '[data-testid="execution-history-modal"]'
      ];
      
      for (const selector of modalSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          modalOpened = true;
          break;
        }
      }
      
      console.log(`History Modal Opens: ${modalOpened ? '✅ YES' : '❌ NO'}`);
      
      if (modalOpened) {
        const executionSelectors = ['.execution-entry', '[data-testid="execution-entry"]', 'tr', '.list-item'];
        let maxEntries = 0;
        for (const selector of executionSelectors) {
          const count = await page.locator(selector).count();
          if (count > maxEntries) maxEntries = count;
        }
        console.log(`Execution Entries: ${maxEntries} found`);
      }
    }
    
    console.log('\n📸 Screenshots saved to .playwright-mcp/ directory');

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.error('Stack trace:', error.stack);
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/error-screenshot.png' 
    });
  } finally {
    await browser.close();
  }
}

verifyHistoryButton().catch(console.error);
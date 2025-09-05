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
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/01-initial-page.png' 
    });
    
    console.log('2. Logging in...');
    // Wait for login form and fill credentials
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'stoddard.nathaniel900@gmail.com');
    await page.fill('input[type="password"]', 'Muhammad77!1');
    
    // Take screenshot before clicking login
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/02-login-form.png' 
    });
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load
    console.log('3. Waiting for dashboard to load...');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of dashboard
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/03-dashboard.png' 
    });
    
    console.log('4. Navigating to Workflows page...');
    // Click on Workflows in the navigation
    await page.click('text=Workflows');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of workflows page
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/04-workflows-page.png' 
    });
    
    console.log('5. Looking for existing workflows or creating a new one...');
    
    // Check if there are any existing workflows
    const existingWorkflows = await page.locator('[data-testid="workflow-card"], .workflow-card, .cursor-pointer').count();
    
    if (existingWorkflows > 0) {
      console.log('Found existing workflows, clicking on the first one...');
      await page.locator('[data-testid="workflow-card"], .workflow-card, .cursor-pointer').first().click();
    } else {
      console.log('No existing workflows found, creating a new one...');
      // Look for "Create Workflow" or "New Workflow" button
      const createButton = page.locator('text=Create Workflow, text=New Workflow, button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
      } else {
        // If no specific create button, look for any button that might create a workflow
        await page.click('button:has-text("Create")');
      }
    }
    
    console.log('6. Waiting for workflow builder to load...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Extra wait for the builder to fully initialize
    
    // Take screenshot of workflow builder
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/05-workflow-builder.png' 
    });
    
    console.log('7. Looking for the History button in the toolbar...');
    
    // Look for the toolbar area with Save, Listen, Execute buttons
    const toolbar = page.locator('.toolbar, [data-testid="toolbar"], .flex.items-center, .space-x-2').first();
    
    // Take screenshot highlighting the toolbar area
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/06-toolbar-area.png' 
    });
    
    // Look for History button specifically
    const historyButton = page.locator('button:has-text("History"), [data-testid="history-button"], button:has([data-lucide="clock"]), button:has(.lucide-clock)');
    
    const historyButtonExists = await historyButton.count() > 0;
    
    if (historyButtonExists) {
      console.log('✅ History button found! Taking screenshot...');
      
      // Highlight the History button by hovering over it
      await historyButton.first().hover();
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/07-history-button-found.png' 
      });
      
      console.log('8. Clicking on History button...');
      await historyButton.first().click();
      
      // Wait for modal to appear
      await page.waitForTimeout(2000);
      
      // Look for the execution history modal
      const modal = page.locator('[role="dialog"], .modal, [data-testid="execution-history-modal"]');
      const modalExists = await modal.count() > 0;
      
      if (modalExists) {
        console.log('✅ Execution History modal opened successfully!');
        
        // Take screenshot of the modal
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/08-execution-history-modal.png' 
        });
        
        // Check for execution entries
        const executionEntries = await page.locator('.execution-entry, [data-testid="execution-entry"], .border, .rounded').count();
        
        if (executionEntries > 0) {
          console.log(`✅ Found ${executionEntries} execution entries in the history`);
        } else {
          console.log('ℹ️ No execution entries found (this is normal for new workflows)');
        }
        
        // Take final screenshot showing any execution entries
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/09-execution-entries.png' 
        });
        
      } else {
        console.log('❌ Execution History modal did not open');
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/08-modal-not-found.png' 
        });
      }
      
    } else {
      console.log('❌ History button not found in the toolbar');
      
      // Take screenshot of all buttons in the toolbar for debugging
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} buttons on the page`);
      
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const buttonText = await allButtons[i].textContent();
        console.log(`Button ${i + 1}: "${buttonText}"`);
      }
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/07-history-button-not-found.png' 
      });
    }
    
    console.log('\n📋 VERIFICATION SUMMARY:');
    console.log(`History Button Present: ${historyButtonExists ? '✅ YES' : '❌ NO'}`);
    
    if (historyButtonExists) {
      const modalOpened = await page.locator('[role="dialog"], .modal, [data-testid="execution-history-modal"]').count() > 0;
      console.log(`History Modal Opens: ${modalOpened ? '✅ YES' : '❌ NO'}`);
      
      if (modalOpened) {
        const executionCount = await page.locator('.execution-entry, [data-testid="execution-entry"], .border, .rounded').count();
        console.log(`Execution Entries: ${executionCount} found`);
      }
    }
    
    console.log('\n📸 Screenshots saved to .playwright-mcp/ directory');

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/error-screenshot.png' 
    });
  } finally {
    await browser.close();
  }
}

verifyHistoryButton().catch(console.error);
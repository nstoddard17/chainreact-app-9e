const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome',
    slowMo: 500
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate directly to the workflow builder with a known workflow ID
    const workflowId = '15aea515-e8f0-47c9-8839-f29bee8e67db';
    const builderUrl = `http://localhost:3000/workflows/builder?id=${workflowId}`;
    
    console.log(`🎯 Navigating directly to: ${builderUrl}`);
    await page.goto(builderUrl, { waitUntil: 'networkidle' });
    
    // Wait for page to load
    await page.waitForTimeout(5000);
    
    // Take initial screenshot
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/initial-builder-load.png', 
      fullPage: true 
    });
    
    console.log('📸 Initial screenshot taken');
    
    // Look for the History button specifically
    console.log('🔍 Looking for History button...');
    
    const historyButton = page.locator('button:has-text("History")');
    const historyButtonExists = await historyButton.count() > 0;
    
    console.log(`History button found: ${historyButtonExists}`);
    
    if (historyButtonExists) {
      console.log('✅ HISTORY BUTTON FOUND!');
      
      // Highlight the button
      await historyButton.hover();
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-button-highlighted.png', 
        fullPage: true 
      });
      
      console.log('📸 History button highlighted screenshot taken');
      
      // Click the button
      console.log('🖱️  Clicking History button...');
      await historyButton.click();
      await page.waitForTimeout(2000);
      
      // Check for modal
      const modal = page.locator('.modal, [role="dialog"], [data-radix-dialog-content]');
      const modalExists = await modal.count() > 0;
      
      console.log(`Modal opened: ${modalExists}`);
      
      if (modalExists) {
        console.log('✅ HISTORY MODAL OPENED!');
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-modal-opened.png', 
          fullPage: true 
        });
        console.log('📸 History modal screenshot taken');
        
        // Check for dialog title
        const modalTitle = page.locator('text="Workflow Execution History"');
        const titleExists = await modalTitle.count() > 0;
        console.log(`Modal title "Workflow Execution History" found: ${titleExists}`);
        
      } else {
        console.log('❌ Modal did not open after clicking History button');
      }
    } else {
      console.log('❌ HISTORY BUTTON NOT FOUND');
      
      // Debug: List all buttons
      console.log('🔍 Listing all buttons for debugging:');
      const allButtons = await page.locator('button').all();
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const buttonText = await allButtons[i].textContent();
        console.log(`  Button ${i}: "${buttonText?.trim() || 'No text'}"`);
      }
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/no-history-button-found.png', 
        fullPage: true 
      });
    }
    
    console.log('📋 FINAL RESULTS:');
    console.log(`   History Button Present: ${historyButtonExists ? '✅ YES' : '❌ NO'}`);
    console.log(`   Workflow ID: ${workflowId}`);
    console.log(`   URL: ${builderUrl}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/error-screenshot.png', 
      fullPage: true 
    });
  } finally {
    console.log('🔚 Test completed. Check screenshots in .playwright-mcp folder');
    await browser.close();
  }
})();
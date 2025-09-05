const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting complete History Button test with Chrome browser...');
  
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome',
    slowMo: 800
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('1️⃣ Navigating to ChainReact...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    console.log('2️⃣ Handling login...');
    
    // Fill in login credentials
    await page.fill('input[placeholder="Enter your email"]', 'stoddard.nathaniel900@gmail.com');
    await page.fill('input[placeholder="Enter your password"]', 'Muhammad77!1');
    
    // Click Sign In button
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log('3️⃣ Navigating to workflow builder...');
    
    // Navigate directly to workflow builder with known workflow ID
    const workflowId = '15aea515-e8f0-47c9-8839-f29bee8e67db';
    const builderUrl = `http://localhost:3000/workflows/builder?id=${workflowId}`;
    
    await page.goto(builderUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Give it time to fully load
    
    console.log('4️⃣ Taking screenshot of loaded workflow builder...');
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/workflow-builder-loaded.png', 
      fullPage: true 
    });
    
    console.log('5️⃣ Looking for toolbar buttons...');
    
    // Check for common workflow toolbar buttons first
    const saveButton = await page.locator('button:has-text("Save")').count();
    const executeButton = await page.locator('button:has-text("Execute")').count();
    const listenButton = await page.locator('button:has-text("Listen")').count();
    
    console.log(`   Save button: ${saveButton > 0 ? '✅' : '❌'}`);
    console.log(`   Execute button: ${executeButton > 0 ? '✅' : '❌'}`);
    console.log(`   Listen button: ${listenButton > 0 ? '✅' : '❌'}`);
    
    console.log('6️⃣ Looking specifically for History button...');
    
    // Look for History button with multiple selectors
    const historySelectors = [
      'button:has-text("History")',
      'button:has([data-lucide="history"])',
      'button:has(.lucide-history)',
      'button[title*="history" i]',
      'button[aria-label*="history" i]'
    ];
    
    let historyButtonFound = false;
    let historyButton = null;
    
    for (const selector of historySelectors) {
      const button = page.locator(selector);
      const count = await button.count();
      if (count > 0) {
        console.log(`✅ Found History button with selector: ${selector}`);
        historyButton = button.first();
        historyButtonFound = true;
        break;
      }
    }
    
    if (historyButtonFound) {
      console.log('7️⃣ History button found! Testing functionality...');
      
      // Highlight the button
      await historyButton.hover();
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-button-highlighted.png', 
        fullPage: true 
      });
      console.log('📸 History button highlighted screenshot saved');
      
      // Click the History button
      console.log('8️⃣ Clicking History button...');
      await historyButton.click();
      await page.waitForTimeout(2000);
      
      // Check for modal/dialog
      const modalSelectors = [
        '[data-radix-dialog-content]',
        '[role="dialog"]',
        '.modal',
        'div:has-text("Workflow Execution History")'
      ];
      
      let modalFound = false;
      for (const modalSelector of modalSelectors) {
        const modal = page.locator(modalSelector);
        const count = await modal.count();
        if (count > 0) {
          console.log(`✅ Modal found with selector: ${modalSelector}`);
          modalFound = true;
          break;
        }
      }
      
      if (modalFound) {
        console.log('9️⃣ History modal opened successfully!');
        await page.screenshot({ 
          path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-modal-opened.png', 
          fullPage: true 
        });
        console.log('📸 History modal screenshot saved');
        
        // Check for modal title
        const titleExists = await page.locator('text="Workflow Execution History"').count() > 0;
        console.log(`   Modal title found: ${titleExists ? '✅' : '❌'}`);
        
      } else {
        console.log('❌ Modal did not open after clicking History button');
      }
      
    } else {
      console.log('❌ History button NOT FOUND');
      
      // Debug: List all visible buttons
      console.log('🔍 Debug - All visible buttons:');
      const allButtons = await page.locator('button:visible').all();
      
      for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
        try {
          const buttonText = await allButtons[i].textContent();
          const buttonTitle = await allButtons[i].getAttribute('title');
          const hasHistoryIcon = await allButtons[i].locator('[data-lucide="history"], .lucide-history').count() > 0;
          
          console.log(`   Button ${i}: "${buttonText?.trim() || 'No text'}" | Title: "${buttonTitle || 'None'}" | HasHistoryIcon: ${hasHistoryIcon}`);
        } catch (e) {
          console.log(`   Button ${i}: Error reading button`);
        }
      }
      
      await page.screenshot({ 
        path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/history-button-not-found-debug.png', 
        fullPage: true 
      });
    }
    
    console.log('\n📋 FINAL TEST RESULTS:');
    console.log('================================');
    console.log(`✨ Browser Used: Chrome (channel: 'chrome')`);
    console.log(`🎯 Workflow ID: ${workflowId}`);
    console.log(`🌐 URL: ${builderUrl}`);
    console.log(`📍 History Button Present: ${historyButtonFound ? '✅ YES' : '❌ NO'}`);
    console.log(`📱 Modal Functionality: ${historyButtonFound ? (modalFound ? '✅ WORKING' : '❌ NOT WORKING') : 'N/A'}`);
    console.log('================================');
    
    if (historyButtonFound) {
      console.log('🎉 SUCCESS: History button found and tested!');
    } else {
      console.log('⚠️  History button was not found in the workflow builder toolbar');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    await page.screenshot({ 
      path: '/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/.playwright-mcp/test-error.png', 
      fullPage: true 
    });
  } finally {
    console.log('\n🔚 Test completed. Screenshots saved in .playwright-mcp folder');
    await browser.close();
  }
})();
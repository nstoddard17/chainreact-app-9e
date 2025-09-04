import { chromium } from 'playwright';

async function testWorkflowBuilder() {
  console.log('🚀 Starting Brave browser for testing...\n');
  
  let browser;
  let page;
  
  try {
    // Launch Brave browser
    browser = await chromium.launch({
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      headless: false,  // Show the browser window
      args: ['--start-maximized']
    });
    
    console.log('✅ Brave browser launched successfully\n');
    
    // Create a new page
    const context = await browser.newContext({
      viewport: null, // Use full window size
    });
    page = await context.newPage();
    
    // First navigate to the main page
    console.log('📍 Navigating to main page...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait a bit for the app to load
    await page.waitForTimeout(3000);
    
    // Check if we need to log in or if there's an error
    const pageContent = await page.content();
    if (pageContent.includes('Internal Server Error')) {
      console.log('❌ Internal Server Error detected. Make sure the development server is running.');
      console.log('Run "npm run dev" in a separate terminal.\n');
      return;
    }
    
    // Now navigate to the workflow builder
    console.log('📍 Navigating to workflow builder...');
    await page.goto('http://localhost:3000/workflows/builder?id=0b0f2309-97f3-4c7f-8d04-968eda040940', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('✅ Page loaded\n');
    
    // Wait for the workflow to fully load - look for React Flow container
    console.log('⏳ Waiting for workflow to initialize...');
    try {
      await page.waitForSelector('.react-flow', { timeout: 10000 });
      console.log('✅ React Flow detected\n');
    } catch (e) {
      console.log('⚠️ React Flow container not found, continuing anyway...\n');
    }
    
    await page.waitForTimeout(3000);
    
    // Click the add action button - try multiple selectors
    console.log('🖱️ Looking for "Add Action" button...');
    
    // Try different selectors for the add action button
    const selectors = [
      '[data-testid*="add-action"]',
      'button:has(svg)',
      '[role="button"]:has(svg)',
      '.react-flow__node-addAction button',
      'g[class*="rf__node-add-action"] button'
    ];
    
    let addActionButton = null;
    for (const selector of selectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          addActionButton = element;
          console.log(`✅ Found button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (addActionButton && await addActionButton.isVisible()) {
      await addActionButton.click();
      console.log('✅ Action dialog opened\n');
      
      // Wait for dialog to fully render
      await page.waitForTimeout(2000);
      
      // Check for integrations
      console.log('🔍 Checking integration statuses:\n');
      
      // Check "Coming Soon" integrations
      const comingSoonIntegrations = [
        'beehiiv', 'Blackbaud', 'Box', 'Dropbox', 'GitLab', 'Gumroad',
        'Instagram', 'LinkedIn', 'ManyChat', 'Microsoft Teams', 'PayPal',
        'Shopify', 'Stripe', 'TikTok', 'YouTube', 'YouTube Studio'
      ];
      
      for (const integration of comingSoonIntegrations) {
        const element = await page.locator(`text="${integration}"`).first();
        if (await element.isVisible()) {
          const parent = await element.locator('..').first();
          const hasComingSoon = await parent.locator('text="Coming soon"').count() > 0;
          console.log(`  ${integration}: ${hasComingSoon ? '✅ Shows "Coming Soon"' : '❌ Missing "Coming Soon" badge'}`);
        }
      }
      
      console.log('\n🔍 Checking Google services connection status:\n');
      
      // Check Google services
      const googleServices = [
        'Google Calendar', 'Google Docs', 'Google Drive', 'Google Sheets'
      ];
      
      for (const service of googleServices) {
        const element = await page.locator(`text="${service}"`).first();
        if (await element.isVisible()) {
          const parent = await element.locator('..').first();
          const hasConnect = await parent.locator('button:has-text("Connect")').count() > 0;
          const hasCheckmark = await parent.locator('svg, img[alt*="check"]').count() > 0;
          
          if (hasConnect) {
            console.log(`  ${service}: 🔗 Shows "Connect" button (disconnected/expired)`);
          } else if (hasCheckmark) {
            console.log(`  ${service}: ✅ Connected (shows checkmark)`);
          } else {
            console.log(`  ${service}: ❓ Unknown status`);
          }
        }
      }
      
      // Take a screenshot for reference
      console.log('\n📸 Taking screenshot...');
      await page.screenshot({ 
        path: 'workflow-action-dialog-brave.png',
        fullPage: false 
      });
      console.log('✅ Screenshot saved as workflow-action-dialog-brave.png\n');
      
      // Close the dialog
      const closeButton = await page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        console.log('✅ Dialog closed\n');
      }
      
    } else {
      console.log('❌ Add Action button not found');
      console.log('📸 Taking screenshot of current page state...');
      await page.screenshot({ 
        path: 'workflow-no-button-found.png',
        fullPage: true 
      });
      console.log('✅ Screenshot saved as workflow-no-button-found.png\n');
      
      // Try to list all visible buttons for debugging
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} buttons on the page`);
    }
    
    console.log('✨ Test completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    
    // Try to take error screenshot
    if (page) {
      try {
        await page.screenshot({ path: 'error-screenshot-brave.png' });
        console.log('📸 Error screenshot saved as error-screenshot-brave.png');
      } catch (screenshotError) {
        console.log('Could not capture error screenshot');
      }
    }
    
  } finally {
    // Keep browser open for a short time for inspection
    console.log('🔍 Browser will remain open for 5 seconds for inspection...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (browser) {
      console.log('🔒 Closing browser...');
      await browser.close();
    }
    console.log('✅ Test script completed.\n');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Closing browser and exiting...');
  process.exit(0);
});

// Run the test
testWorkflowBuilder().catch(console.error);
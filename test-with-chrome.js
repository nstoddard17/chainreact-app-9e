import { chromium } from 'playwright';

async function testWorkflowBuilder() {
  console.log('🚀 Starting Chrome browser test...\n');
  
  let browser;
  let page;
  
  try {
    // Launch Chrome (default Chromium)
    browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });
    
    console.log('✅ Chrome browser launched\n');
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    page = await context.newPage();
    
    // Navigate to the workflow builder
    console.log('📍 Navigating to workflow builder...');
    await page.goto('http://localhost:3000/workflows/builder?id=0b0f2309-97f3-4c7f-8d04-968eda040940', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('✅ Page loaded\n');
    
    // Wait for workflow to load
    console.log('⏳ Waiting for workflow components...');
    await page.waitForTimeout(5000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'chrome-workflow-initial.png' });
    console.log('📸 Initial screenshot saved\n');
    
    // Try to find the add action button
    console.log('🔍 Looking for Add Action button...');
    
    // Try clicking on the add action node
    const addActionNode = await page.locator('.react-flow__node-addAction').first();
    if (await addActionNode.isVisible({ timeout: 3000 })) {
      console.log('✅ Found add action node, clicking...');
      await addActionNode.click();
      await page.waitForTimeout(2000);
      
      // Check if dialog opened
      const dialog = await page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 3000 })) {
        console.log('✅ Action dialog opened!\n');
        
        // Take screenshot of dialog
        await page.screenshot({ path: 'chrome-action-dialog.png' });
        console.log('📸 Dialog screenshot saved\n');
        
        // Count Coming Soon badges
        console.log('📊 Checking integration statuses...\n');
        const comingSoonCount = await page.locator('text="Coming soon"').count();
        console.log(`   ✅ Found ${comingSoonCount} "Coming Soon" badges\n`);
        
        // Check specific integrations
        const integrationsToCheck = [
          'Microsoft Teams', 'YouTube', 'Stripe', 'PayPal',
          'Google Calendar', 'Google Sheets', 'Google Drive', 'Google Docs'
        ];
        
        for (const integration of integrationsToCheck) {
          const element = await page.locator(`text="${integration}"`).first();
          if (await element.isVisible({ timeout: 1000 })) {
            const parent = await element.locator('..').first();
            const hasComingSoon = await parent.locator('text="Coming soon"').count() > 0;
            const hasConnect = await parent.locator('button:has-text("Connect")').count() > 0;
            
            let status = '✅ Connected';
            if (hasComingSoon) status = '🔜 Coming Soon';
            else if (hasConnect) status = '🔗 Shows Connect';
            
            console.log(`   ${integration}: ${status}`);
          }
        }
        
        console.log('\n✅ Test completed successfully!');
      } else {
        console.log('⚠️ Dialog did not open');
      }
    } else {
      console.log('❌ Add action node not found');
      
      // List what we can see
      const buttons = await page.locator('button').count();
      console.log(`   Found ${buttons} buttons on page`);
      
      const nodes = await page.locator('.react-flow__node').count();
      console.log(`   Found ${nodes} workflow nodes`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (page) {
      await page.screenshot({ path: 'chrome-error.png' });
      console.log('📸 Error screenshot saved');
    }
  } finally {
    console.log('\n🔍 Browser will stay open for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed\n');
    }
  }
}

// Run the test
testWorkflowBuilder();
import { chromium } from 'playwright';

async function testWorkflowBuilder() {
  console.log('🚀 Starting Brave browser test...\n');
  
  let browser;
  
  try {
    // Launch Brave with more permissive settings
    browser = await chromium.launch({
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--start-maximized'
      ]
    });
    
    console.log('✅ Brave launched\n');
    
    // Create context with permissions
    const context = await browser.newContext({
      viewport: null,
      ignoreHTTPSErrors: true,
      bypassCSP: true,
      permissions: ['geolocation', 'notifications'],
    });
    
    const page = await context.newPage();
    
    // Go directly to workflows page
    console.log('📍 Opening workflows page...');
    await page.goto('http://localhost:3000/workflows', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    await page.waitForTimeout(3000);
    
    // Take screenshot of workflows page
    await page.screenshot({ path: 'brave-workflows-page.png' });
    console.log('📸 Screenshot saved: brave-workflows-page.png\n');
    
    // Try to find and click Edit Workflow button
    console.log('🔍 Looking for Edit Workflow button...');
    try {
      const editButton = await page.locator('a:has-text("Edit Workflow")').first();
      if (await editButton.isVisible({ timeout: 5000 })) {
        console.log('✅ Found Edit Workflow button, clicking...');
        await editButton.click();
        await page.waitForTimeout(5000);
        
        // Take screenshot of builder
        await page.screenshot({ path: 'brave-workflow-builder.png' });
        console.log('📸 Screenshot saved: brave-workflow-builder.png\n');
        
        // Look for add action button
        console.log('🔍 Looking for Add Action button...');
        const addButton = await page.locator('button').filter({ has: page.locator('svg') }).first();
        if (await addButton.isVisible({ timeout: 3000 })) {
          console.log('✅ Found Add Action button, clicking...');
          await addButton.click();
          await page.waitForTimeout(2000);
          
          // Take screenshot of dialog
          await page.screenshot({ path: 'brave-action-dialog.png' });
          console.log('📸 Screenshot saved: brave-action-dialog.png\n');
          
          // Check for Coming Soon badges
          console.log('🔍 Checking "Coming Soon" badges...');
          const comingSoon = await page.locator('text="Coming soon"').count();
          console.log(`   Found ${comingSoon} "Coming Soon" badges\n`);
          
          // Check Google services
          console.log('🔍 Checking Google services...');
          const googleServices = ['Google Calendar', 'Google Docs', 'Google Drive', 'Google Sheets'];
          for (const service of googleServices) {
            const hasService = await page.locator(`text="${service}"`).count() > 0;
            if (hasService) {
              console.log(`   ✅ ${service} found`);
            }
          }
        }
      }
    } catch (e) {
      console.log('⚠️ Could not complete workflow test:', e.message);
    }
    
    console.log('\n✨ Test completed!');
    console.log('💡 Check the screenshot files for visual verification.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed\n');
    }
  }
}

// Run the test
testWorkflowBuilder();
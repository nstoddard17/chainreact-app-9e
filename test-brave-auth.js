import { chromium } from 'playwright';

async function testWithBrave() {
  console.log('🚀 Starting Brave browser test with authentication handling...\n');
  
  let browser;
  let context;
  let page;
  
  try {
    // Launch Brave with user data to preserve sessions
    browser = await chromium.launch({
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    console.log('✅ Brave browser launched\n');
    
    // Create context with storage state if available
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      // Accept all permissions
      permissions: ['geolocation', 'notifications', 'camera', 'microphone'],
      // Set user agent to avoid bot detection
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    page = await context.newPage();
    
    // Add console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console error:', msg.text());
      }
    });
    
    // Add request logging to debug
    page.on('request', request => {
      if (request.url().includes('localhost:3000')) {
        console.log(`📤 Request: ${request.method()} ${request.url()}`);
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('localhost:3000') && response.status() >= 400) {
        console.log(`📥 Response: ${response.status()} ${response.url()}`);
      }
    });
    
    // First try to go to the main page
    console.log('📍 Navigating to main page first...');
    try {
      const response = await page.goto('http://localhost:3000', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      if (response) {
        console.log(`   Response status: ${response.status()}`);
      }
      
      await page.waitForTimeout(2000);
      
      // Check if we're on an error page
      const pageTitle = await page.title();
      const pageURL = page.url();
      console.log(`   Current URL: ${pageURL}`);
      console.log(`   Page title: ${pageTitle}\n`);
      
      // Try to get page content
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      if (bodyText.includes('Internal Server Error')) {
        console.log('❌ Internal Server Error detected\n');
        
        // Try direct API request to check server
        console.log('🔍 Checking server directly...');
        try {
          const apiResponse = await page.evaluate(async () => {
            try {
              const res = await fetch('http://localhost:3000/api/health', {
                method: 'GET',
                credentials: 'include'
              });
              return { status: res.status, ok: res.ok };
            } catch (e) {
              return { error: e.message };
            }
          });
          console.log('   API check result:', apiResponse);
        } catch (e) {
          console.log('   API check failed:', e.message);
        }
      } else if (bodyText.includes('Sign in') || bodyText.includes('Login')) {
        console.log('🔐 Login page detected, needs authentication\n');
      } else {
        console.log('✅ Main page loaded successfully\n');
        
        // Now try the workflow builder
        console.log('📍 Navigating to workflow builder...');
        await page.goto('http://localhost:3000/workflows/builder?id=0b0f2309-97f3-4c7f-8d04-968eda040940', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        
        await page.waitForTimeout(5000);
        
        // Take screenshot
        await page.screenshot({ path: 'brave-workflow-test.png', fullPage: false });
        console.log('📸 Screenshot saved: brave-workflow-test.png\n');
        
        // Look for workflow elements
        const hasReactFlow = await page.locator('.react-flow').count() > 0;
        const hasNodes = await page.locator('.react-flow__node').count() > 0;
        const hasButtons = await page.locator('button').count() > 0;
        
        console.log('🔍 Page analysis:');
        console.log(`   React Flow present: ${hasReactFlow ? '✅' : '❌'}`);
        console.log(`   Workflow nodes: ${await page.locator('.react-flow__node').count()}`);
        console.log(`   Buttons found: ${await page.locator('button').count()}\n`);
        
        if (hasNodes) {
          // Try to click add action
          const addActionNode = await page.locator('[data-testid*="add-action"], .react-flow__node-addAction').first();
          if (await addActionNode.isVisible({ timeout: 3000 })) {
            console.log('✅ Found add action node, clicking...');
            await addActionNode.click();
            await page.waitForTimeout(2000);
            
            // Check for dialog
            const hasDialog = await page.locator('[role="dialog"]').count() > 0;
            if (hasDialog) {
              console.log('✅ Action dialog opened!\n');
              await page.screenshot({ path: 'brave-action-dialog.png' });
              console.log('📸 Dialog screenshot saved\n');
              
              // Quick check for coming soon badges
              const comingSoonCount = await page.locator('text="Coming soon"').count();
              console.log(`📊 Found ${comingSoonCount} "Coming Soon" badges\n`);
            }
          }
        }
      }
      
    } catch (navError) {
      console.error('❌ Navigation error:', navError.message);
      
      // Take error screenshot
      await page.screenshot({ path: 'brave-error.png' });
      console.log('📸 Error screenshot saved: brave-error.png\n');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    console.log('✨ Test completed. Browser will remain open for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed\n');
    }
  }
}

// Run the test
testWithBrave();
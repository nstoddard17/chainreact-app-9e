import { chromium } from 'playwright';

async function testWithBraveAndLogin() {
  console.log('🚀 Starting Brave browser test with login flow...\n');
  
  let browser;
  let context;
  let page;
  
  try {
    // Launch Brave browser
    browser = await chromium.launch({
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    console.log('✅ Brave browser launched\n');
    
    // Create persistent context to maintain session
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState: undefined // Start fresh
    });
    
    page = await context.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console error:', msg.text());
      }
    });
    
    // Step 1: Navigate to main page
    console.log('📍 Step 1: Navigating to main page...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
    // Check current URL and page state
    const currentURL = page.url();
    console.log(`   Current URL: ${currentURL}`);
    
    // Check if we're on login page
    if (currentURL.includes('/login') || currentURL.includes('/auth')) {
      console.log('🔐 Login page detected, attempting to log in...\n');
      
      // Look for login form elements
      const emailInput = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
      const passwordInput = await page.locator('input[type="password"], input[name="password"]').first();
      
      if (await emailInput.isVisible() && await passwordInput.isVisible()) {
        console.log('📝 Found login form, filling credentials...');
        
        // You'll need to replace these with actual credentials
        await emailInput.fill('test@example.com');
        await passwordInput.fill('testpassword');
        
        // Look for login button
        const loginButton = await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
        if (await loginButton.isVisible()) {
          console.log('   Clicking login button...');
          await loginButton.click();
          
          // Wait for navigation after login
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {
            console.log('   Navigation timeout, continuing...');
          });
          
          await page.waitForTimeout(3000);
        }
      } else {
        console.log('⚠️  Could not find login form elements');
        
        // Take screenshot to see what's on the page
        await page.screenshot({ path: 'brave-login-page.png' });
        console.log('📸 Screenshot saved: brave-login-page.png\n');
      }
    }
    
    // Step 2: Try to navigate to workflow builder
    console.log('📍 Step 2: Navigating to workflow builder...');
    const builderURL = 'http://localhost:3000/workflows/builder?id=0b0f2309-97f3-4c7f-8d04-968eda040940';
    
    await page.goto(builderURL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await page.waitForTimeout(5000);
    
    // Check if we successfully reached the builder
    const finalURL = page.url();
    console.log(`   Final URL: ${finalURL}`);
    
    if (finalURL.includes('/workflows/builder')) {
      console.log('✅ Successfully reached workflow builder!\n');
      
      // Take screenshot
      await page.screenshot({ path: 'brave-workflow-builder.png', fullPage: false });
      console.log('📸 Screenshot saved: brave-workflow-builder.png\n');
      
      // Step 3: Look for workflow elements
      console.log('📍 Step 3: Analyzing workflow page...');
      
      const hasReactFlow = await page.locator('.react-flow').count() > 0;
      const nodeCount = await page.locator('.react-flow__node').count();
      const buttonCount = await page.locator('button').count();
      
      console.log(`   React Flow present: ${hasReactFlow ? '✅' : '❌'}`);
      console.log(`   Workflow nodes found: ${nodeCount}`);
      console.log(`   Buttons found: ${buttonCount}\n`);
      
      if (nodeCount > 0) {
        // Step 4: Try to click Add Action node
        console.log('📍 Step 4: Looking for Add Action node...');
        
        // Try multiple selectors for the add action node
        const selectors = [
          '.react-flow__node-addAction',
          '[data-id*="add-action"]',
          '.react-flow__node:has-text("Add Action")',
          'button:has-text("+")'
        ];
        
        let addActionNode = null;
        for (const selector of selectors) {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
            addActionNode = element;
            console.log(`   Found using selector: ${selector}`);
            break;
          }
        }
        
        if (addActionNode) {
          console.log('   Clicking Add Action node...');
          await addActionNode.click();
          await page.waitForTimeout(3000);
          
          // Check if dialog opened
          const hasDialog = await page.locator('[role="dialog"], .fixed.inset-0').count() > 0;
          
          if (hasDialog) {
            console.log('✅ Action selection dialog opened!\n');
            
            // Take screenshot of dialog
            await page.screenshot({ path: 'brave-action-dialog.png' });
            console.log('📸 Dialog screenshot saved: brave-action-dialog.png\n');
            
            // Step 5: Analyze integrations in dialog
            console.log('📍 Step 5: Checking integration statuses...\n');
            
            // Count "Coming Soon" badges
            const comingSoonCount = await page.locator('span:has-text("Coming soon"), .text-yellow-600:has-text("Coming soon")').count();
            console.log(`   "Coming Soon" badges found: ${comingSoonCount}`);
            
            // Check specific integrations
            const integrationsToCheck = [
              { name: 'Microsoft Teams', shouldBe: 'Coming Soon' },
              { name: 'YouTube', shouldBe: 'Coming Soon' },
              { name: 'Stripe', shouldBe: 'Coming Soon' },
              { name: 'PayPal', shouldBe: 'Coming Soon' },
              { name: 'Gmail', shouldBe: 'Connected' },
              { name: 'Google Calendar', shouldBe: 'Connected' },
              { name: 'Google Sheets', shouldBe: 'Connected' },
              { name: 'Google Drive', shouldBe: 'Connected' },
              { name: 'Google Docs', shouldBe: 'Connected' }
            ];
            
            console.log('\n   Checking individual integrations:');
            for (const integration of integrationsToCheck) {
              // Find the integration card
              const card = await page.locator(`div:has-text("${integration.name}")`).first();
              if (await card.isVisible({ timeout: 1000 }).catch(() => false)) {
                // Check for Coming Soon badge
                const hasComingSoon = await card.locator('span:has-text("Coming soon")').count() > 0;
                // Check for Connect button
                const hasConnectButton = await card.locator('button:has-text("Connect")').count() > 0;
                
                let status = '✅ Connected';
                if (hasComingSoon) status = '🔜 Coming Soon';
                else if (hasConnectButton) status = '🔗 Shows Connect (should be connected)';
                
                const isCorrect = (integration.shouldBe === 'Coming Soon' && hasComingSoon) || 
                                 (integration.shouldBe === 'Connected' && !hasComingSoon && !hasConnectButton);
                
                console.log(`   ${integration.name}: ${status} ${isCorrect ? '✅' : '❌ ISSUE'}`);
              } else {
                console.log(`   ${integration.name}: Not found`);
              }
            }
            
            console.log('\n✨ Test completed successfully!');
          } else {
            console.log('⚠️  Dialog did not open');
          }
        } else {
          console.log('⚠️  Could not find Add Action node');
          
          // List visible buttons for debugging
          const visibleButtons = await page.locator('button:visible').all();
          console.log(`   Found ${visibleButtons.length} visible buttons`);
          
          for (let i = 0; i < Math.min(5, visibleButtons.length); i++) {
            const text = await visibleButtons[i].textContent();
            console.log(`   Button ${i + 1}: "${text?.trim() || '(no text)'}"`);
          }
        }
      } else {
        console.log('⚠️  No workflow nodes found on page');
      }
    } else {
      console.log('❌ Failed to reach workflow builder');
      console.log('   Still on:', finalURL);
      
      // Take screenshot of current page
      await page.screenshot({ path: 'brave-current-page.png' });
      console.log('📸 Screenshot saved: brave-current-page.png\n');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    
    if (page) {
      await page.screenshot({ path: 'brave-error.png' });
      console.log('📸 Error screenshot saved: brave-error.png');
    }
  } finally {
    console.log('\n🎯 Test session complete. Browser will stay open for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed\n');
    }
  }
}

// Run the test
console.log('================================');
console.log('Workflow Builder Integration Test');
console.log('================================\n');
console.log('This test will:');
console.log('1. Open Brave browser');
console.log('2. Navigate to the app and handle login if needed');
console.log('3. Open the workflow builder');
console.log('4. Click on Add Action node');
console.log('5. Verify integration statuses');
console.log('   - "Coming Soon" badges should appear for unimplemented integrations');
console.log('   - Connected integrations should NOT show Connect buttons\n');
console.log('Starting in 2 seconds...\n');

setTimeout(() => {
  testWithBraveAndLogin();
}, 2000);
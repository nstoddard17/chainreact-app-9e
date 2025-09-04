import { chromium } from 'playwright';
import fs from 'fs';

async function testWithSession() {
  console.log('🚀 Starting Brave test with session management...\n');
  
  let browser;
  let context;
  let page;
  const storageStatePath = 'auth-state.json';
  
  try {
    browser = await chromium.launch({
      executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    console.log('✅ Brave launched\n');
    
    // Try to use existing storage state if available
    let storageState = null;
    if (fs.existsSync(storageStatePath)) {
      console.log('📂 Found existing auth state, loading...');
      storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
    }
    
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState: storageState
    });
    
    page = await context.newPage();
    
    // Try to go directly to workflow builder
    console.log('📍 Attempting direct navigation to workflow builder...');
    await page.goto('http://localhost:3000/workflows/builder?id=0b0f2309-97f3-4c7f-8d04-968eda040940', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    const currentURL = page.url();
    console.log(`   Current URL: ${currentURL}\n`);
    
    // If redirected to login, handle it
    if (currentURL.includes('/auth/login') || currentURL.includes('/login')) {
      console.log('🔐 Need to authenticate first\n');
      console.log('📝 Please log in manually in the browser window');
      console.log('   The test will wait for you to complete login...\n');
      
      // Wait for manual login - check every 2 seconds for up to 2 minutes
      let loggedIn = false;
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(2000);
        const url = page.url();
        if (!url.includes('/login') && !url.includes('/auth')) {
          loggedIn = true;
          console.log('✅ Login detected!\n');
          break;
        }
        if (i % 5 === 0) {
          console.log(`   Waiting for login... (${120 - i*2} seconds remaining)`);
        }
      }
      
      if (loggedIn) {
        // Save the authentication state
        const state = await context.storageState();
        fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2));
        console.log('💾 Authentication state saved for future tests\n');
        
        // Navigate to workflow builder
        console.log('📍 Navigating to workflow builder...');
        await page.goto('http://localhost:3000/workflows/builder?id=0b0f2309-97f3-4c7f-8d04-968eda040940', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        await page.waitForTimeout(5000);
      } else {
        console.log('⏰ Login timeout - please run the test again and log in');
        return;
      }
    }
    
    // Check if we're on the workflow builder
    if (page.url().includes('/workflows/builder')) {
      console.log('✅ On workflow builder page!\n');
      
      // Take initial screenshot
      await page.screenshot({ path: 'brave-workflow-loaded.png' });
      console.log('📸 Screenshot: brave-workflow-loaded.png\n');
      
      // Analyze the page
      console.log('🔍 Analyzing workflow page...');
      const hasReactFlow = await page.locator('.react-flow').count() > 0;
      const nodeCount = await page.locator('.react-flow__node').count();
      
      console.log(`   React Flow present: ${hasReactFlow ? '✅' : '❌'}`);
      console.log(`   Workflow nodes: ${nodeCount}\n`);
      
      if (nodeCount > 0) {
        // Find and click Add Action
        console.log('🎯 Looking for Add Action node...');
        
        // Try different ways to find the add action element
        let clicked = false;
        
        // Method 1: Look for node with specific class
        let addNode = await page.locator('.react-flow__node-addAction').first();
        if (await addNode.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('   Found by class, clicking...');
          await addNode.click();
          clicked = true;
        }
        
        // Method 2: Look for + button
        if (!clicked) {
          addNode = await page.locator('.react-flow__node button:has-text("+")').first();
          if (await addNode.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('   Found + button, clicking...');
            await addNode.click();
            clicked = true;
          }
        }
        
        // Method 3: Look by data attribute
        if (!clicked) {
          addNode = await page.locator('[data-id*="add"]').first();
          if (await addNode.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('   Found by data attribute, clicking...');
            await addNode.click();
            clicked = true;
          }
        }
        
        if (clicked) {
          await page.waitForTimeout(3000);
          
          // Check for dialog
          const dialogVisible = await page.locator('[role="dialog"], .fixed.inset-0.z-50').count() > 0;
          
          if (dialogVisible) {
            console.log('✅ Action selection dialog opened!\n');
            
            await page.screenshot({ path: 'brave-action-dialog-final.png' });
            console.log('📸 Dialog screenshot: brave-action-dialog-final.png\n');
            
            // Verify integration statuses
            console.log('🔍 Verifying integration statuses...\n');
            
            // Count Coming Soon badges
            const comingSoonElements = await page.locator('span:has-text("Coming soon")').all();
            console.log(`📊 "Coming Soon" badges found: ${comingSoonElements.length}\n`);
            
            // Test specific integrations
            const tests = [
              // Should show "Coming Soon"
              { name: 'Microsoft Teams', expected: 'coming-soon' },
              { name: 'YouTube', expected: 'coming-soon' },
              { name: 'Stripe', expected: 'coming-soon' },
              { name: 'PayPal', expected: 'coming-soon' },
              { name: 'TikTok', expected: 'coming-soon' },
              { name: 'Shopify', expected: 'coming-soon' },
              // Should be connected (no Connect button)
              { name: 'Gmail', expected: 'connected' },
              { name: 'Discord', expected: 'connected' },
              { name: 'Slack', expected: 'connected' },
              { name: 'Notion', expected: 'connected' }
            ];
            
            console.log('Integration Status Check:');
            console.log('─'.repeat(50));
            
            let passCount = 0;
            let failCount = 0;
            
            for (const test of tests) {
              // Find the integration card containing the name
              const card = await page.locator(`div:has(div:text-is("${test.name}"))`).first();
              
              if (await card.isVisible({ timeout: 1000 }).catch(() => false)) {
                const hasComingSoon = await card.locator('span:has-text("Coming soon")').count() > 0;
                const hasConnect = await card.locator('button:has-text("Connect")').count() > 0;
                
                let status = '';
                let passed = false;
                
                if (test.expected === 'coming-soon') {
                  passed = hasComingSoon;
                  status = hasComingSoon ? '🔜 Coming Soon ✅' : (hasConnect ? '❌ Shows Connect' : '❌ Shows as connected');
                } else {
                  passed = !hasComingSoon && !hasConnect;
                  status = hasComingSoon ? '❌ Shows Coming Soon' : (hasConnect ? '❌ Shows Connect' : '✅ Connected');
                }
                
                if (passed) passCount++;
                else failCount++;
                
                console.log(`${test.name.padEnd(20)} ${status}`);
              } else {
                console.log(`${test.name.padEnd(20)} ⚠️ Not found`);
              }
            }
            
            console.log('─'.repeat(50));
            console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
            
            if (failCount === 0) {
              console.log('🎉 All integration statuses are correct!');
            } else {
              console.log('⚠️  Some integrations have incorrect status');
            }
          } else {
            console.log('⚠️  Dialog did not open');
          }
        } else {
          console.log('❌ Could not find Add Action node');
        }
      }
    } else {
      console.log('❌ Not on workflow builder page');
      console.log(`   Current URL: ${page.url()}`);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    if (page) {
      await page.screenshot({ path: 'brave-test-error.png' });
      console.log('📸 Error screenshot: brave-test-error.png');
    }
  } finally {
    console.log('\n✨ Test complete. Browser stays open for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed\n');
    }
  }
}

// Run test
testWithSession();
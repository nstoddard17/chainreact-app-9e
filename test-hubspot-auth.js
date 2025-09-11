import { chromium } from 'playwright';

(async () => {
  console.log('Testing HubSpot OAuth with authentication...');
  
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 500,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('error') || msg.text().includes('Error')) {
      console.log(`🚨 CONSOLE ERROR:`, msg.text());
    } else if (msg.text().includes('OAuth') || msg.text().includes('HubSpot') || msg.text().includes('integration')) {
      console.log(`🔗 INTEGRATION LOG:`, msg.text());
    }
  });
  
  try {
    console.log('Step 1: Navigate to login page...');
    await page.goto('http://localhost:3000/auth/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'auth-1-login-page.png', fullPage: true });
    console.log('Screenshot 1: Login page');
    
    // Try to find login form
    console.log('Step 2: Looking for login options...');
    
    // Check for Google OAuth button
    const googleButton = await page.locator('button').filter({ hasText: /google/i }).first();
    const emailInput = await page.locator('input[type="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    
    if (await googleButton.isVisible()) {
      console.log('Found Google OAuth button. Clicking...');
      await googleButton.click();
      await page.waitForTimeout(3000);
      
      // Handle Google OAuth popup if it appears
      try {
        const popup = await page.waitForEvent('popup', { timeout: 5000 });
        console.log('Google OAuth popup opened');
        // We'll just close this for testing purposes
        await popup.close();
      } catch (e) {
        console.log('No Google OAuth popup appeared');
      }
      
    } else if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      console.log('Found email/password form. Using test credentials...');
      
      // Use test credentials (you may need to adjust these)
      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      
      const signInButton = await page.locator('button').filter({ hasText: /sign in/i }).first();
      if (await signInButton.isVisible()) {
        await signInButton.click();
        await page.waitForTimeout(3000);
      }
    } else {
      console.log('No login options found. Checking if already logged in...');
    }
    
    await page.screenshot({ path: 'auth-2-after-login-attempt.png', fullPage: true });
    console.log('Screenshot 2: After login attempt');
    
    console.log('Step 3: Navigate to integrations page...');
    await page.goto('http://localhost:3000/integrations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/auth/login')) {
      console.log('❌ Still on login page - authentication failed');
      await page.screenshot({ path: 'auth-3-login-failed.png', fullPage: true });
      
      // Let's try a different approach - check if there's a demo mode or skip auth
      console.log('Trying direct navigation to dashboard...');
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(2000);
      
      if (page.url().includes('/auth/login')) {
        console.log('❌ Dashboard also redirects to login. Authentication is required.');
        console.log('Please provide valid test credentials or check if there\'s a demo mode.');
        
        // Try to understand what auth is expected
        const bodyText = await page.locator('body').textContent();
        console.log('Login page content includes:');
        console.log(`- Email/password: ${bodyText?.includes('Email') && bodyText?.includes('Password')}`);
        console.log(`- Google OAuth: ${bodyText?.includes('Google')}`);
        console.log(`- Sign up: ${bodyText?.includes('Sign up')}`);
        
        await browser.close();
        return;
      }
    }
    
    console.log('✅ Successfully reached integrations page!');
    await page.screenshot({ path: 'auth-3-integrations-page.png', fullPage: true });
    console.log('Screenshot 3: Integrations page');
    
    console.log('Step 4: Looking for HubSpot integration...');
    
    // Wait a bit more for the page to fully load
    await page.waitForTimeout(3000);
    
    // Look for HubSpot with various approaches
    const hubspotSelectors = [
      'text=HubSpot',
      '[data-provider="hubspot"]',
      '[data-integration="hubspot"]',
      'text=/hubspot/i',
      '*:has-text("HubSpot")'
    ];
    
    let hubspotElement = null;
    for (const selector of hubspotSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          hubspotElement = element;
          console.log(`✅ Found HubSpot using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!hubspotElement) {
      console.log('❌ HubSpot integration not found. Let me check what integrations are available...');
      
      // Get all visible text that might be integration names
      const allText = await page.locator('body').textContent();
      const integrationKeywords = ['Gmail', 'Slack', 'Discord', 'Notion', 'HubSpot', 'Stripe', 'Airtable'];
      
      console.log('Integrations mentioned on page:');
      integrationKeywords.forEach(keyword => {
        const found = allText?.toLowerCase().includes(keyword.toLowerCase());
        console.log(`  ${keyword}: ${found ? '✅' : '❌'}`);
      });
      
      // Look for any cards or integration-like elements
      const cardElements = await page.locator('div[class*="card"], div[class*="integration"], [role="button"]').all();
      console.log(`Found ${cardElements.length} potential integration cards`);
      
      await page.screenshot({ path: 'auth-4-no-hubspot.png', fullPage: true });
      console.log('Screenshot 4: No HubSpot found');
      
      await browser.close();
      return;
    }
    
    console.log('Step 5: Testing HubSpot OAuth flow...');
    
    // Take screenshot of HubSpot card
    await hubspotElement.screenshot({ path: 'auth-5-hubspot-card.png' });
    console.log('Screenshot 5: HubSpot card');
    
    // Look for connect button within or near the HubSpot element
    const connectButton = await page.locator('button').filter({ hasText: /connect|add|link/i }).first();
    const disconnectButton = await page.locator('button').filter({ hasText: /disconnect|remove|unlink/i }).first();
    
    if (await disconnectButton.isVisible()) {
      console.log('HubSpot appears to be connected. Disconnecting first...');
      await disconnectButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'auth-6-disconnected.png', fullPage: true });
      console.log('Screenshot 6: After disconnecting');
    }
    
    if (await connectButton.isVisible()) {
      console.log('Found Connect button. Setting up popup handler...');
      
      // Set up popup handler
      const popupPromise = page.waitForEvent('popup');
      
      await connectButton.click();
      console.log('Connect button clicked!');
      
      try {
        const popup = await popupPromise;
        console.log(`🎉 OAuth popup opened: ${popup.url()}`);
        
        // Monitor popup events
        popup.on('console', msg => {
          console.log(`POPUP CONSOLE [${msg.type()}]:`, msg.text());
        });
        
        popup.on('framenavigated', frame => {
          console.log(`Popup navigated to: ${frame.url()}`);
        });
        
        // Wait for popup to load
        await popup.waitForLoadState('networkidle');
        await popup.screenshot({ path: 'auth-7-popup.png', fullPage: true });
        console.log('Screenshot 7: OAuth popup');
        
        // Wait and monitor popup behavior
        console.log('Monitoring popup for 30 seconds...');
        
        const popupClosePromise = popup.waitForEvent('close');
        const timeoutPromise = page.waitForTimeout(30000);
        
        await Promise.race([popupClosePromise, timeoutPromise]);
        
        if (!popup.isClosed()) {
          console.log('Popup still open after 30 seconds');
          await popup.screenshot({ path: 'auth-8-popup-timeout.png', fullPage: true });
        } else {
          console.log('✅ Popup closed');
        }
        
        // Check main page for changes
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'auth-9-after-popup.png', fullPage: true });
        console.log('Screenshot 9: Main page after popup');
        
      } catch (popupError) {
        console.log(`❌ Popup error: ${popupError.message}`);
        await page.screenshot({ path: 'auth-error-popup.png', fullPage: true });
      }
      
    } else {
      console.log('❌ No Connect button found');
      await page.screenshot({ path: 'auth-no-connect.png', fullPage: true });
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
    await page.screenshot({ path: 'auth-error.png', fullPage: true });
  }
  
  console.log('Test completed. Waiting 5 seconds before closing...');
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
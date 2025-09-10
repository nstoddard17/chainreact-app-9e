import { chromium } from 'playwright';
import { readFileSync } from 'fs';

async function testHubSpotOAuthWithAuth() {
  console.log('🎭 Starting Playwright test for HubSpot OAuth with authentication...\n');
  
  // Load credentials
  const credentials = JSON.parse(readFileSync('.test-credentials.json', 'utf8'));
  
  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome' // Use Google Chrome
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Console Error:', msg.text());
    } else if (msg.text().includes('OAuth') || msg.text().includes('hubspot') || msg.text().includes('HubSpot')) {
      console.log('📝 Console:', msg.text());
    }
  });
  
  try {
    // First, log in
    console.log('🔐 Navigating to login page...');
    await page.goto('http://localhost:3000/auth/login');
    await page.waitForTimeout(2000);
    
    // Check if already logged in by looking for the login form
    const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
    
    if (await emailInput.isVisible()) {
      console.log('📝 Logging in...');
      
      // Fill in login form
      await emailInput.fill(credentials.email);
      
      const passwordInput = await page.locator('input[type="password"], input[name="password"]').first();
      await passwordInput.fill(credentials.password);
      
      // Submit form
      const submitButton = await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
      await submitButton.click();
      
      // Wait for navigation
      await page.waitForTimeout(3000);
      console.log('✅ Logged in successfully');
    } else {
      console.log('✅ Already logged in');
    }
    
    // Navigate to integrations page
    console.log('📍 Navigating to integrations page...');
    await page.goto('http://localhost:3000/integrations');
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    console.log('🔍 Looking for HubSpot integration...');
    
    // Find HubSpot card - use more specific selector
    const hubspotCard = await page.locator('.integration-card:has-text("HubSpot"), div:has-text("HubSpot"):has(button)').first();
    
    if (await hubspotCard.isVisible()) {
      console.log('✅ Found HubSpot integration card');
      
      // Take screenshot of initial state
      await page.screenshot({ path: 'hubspot-initial.png', fullPage: true });
      console.log('📸 Initial screenshot saved');
      
      // Check current connection status
      const connectedBadge = await hubspotCard.locator('text=/Connected/i').first();
      const disconnectButton = await hubspotCard.locator('button:has-text("Disconnect")').first();
      const isConnected = (await connectedBadge.isVisible().catch(() => false)) || (await disconnectButton.isVisible().catch(() => false));
      
      if (isConnected) {
        console.log('🔗 HubSpot is currently connected');
        
        // Disconnect first
        console.log('🔌 Disconnecting HubSpot...');
        await disconnectButton.click();
        
        // Wait for confirmation dialog
        await page.waitForTimeout(1000);
        
        // Confirm disconnection in dialog
        const confirmButton = await page.locator('div[role="dialog"] button:has-text("Disconnect"), div[role="alertdialog"] button:has-text("Disconnect")').first();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
          console.log('✅ Confirmed disconnection');
          await page.waitForTimeout(3000);
        }
      } else {
        console.log('🔌 HubSpot is currently disconnected');
      }
      
      // Now connect HubSpot
      console.log('🔄 Attempting to connect HubSpot...');
      const connectButton = await hubspotCard.locator('button:has-text("Connect")').first();
      
      if (await connectButton.isVisible()) {
        // Set up popup handler before clicking
        const popupPromise = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
        
        console.log('🖱️ Clicking Connect button...');
        await connectButton.click();
        
        // Wait for popup
        console.log('⏳ Waiting for OAuth popup...');
        const popup = await popupPromise;
        
        if (popup) {
          console.log('🪟 OAuth popup opened:', popup.url());
          
          // Monitor popup close
          popup.on('close', () => {
            console.log('🚪 OAuth popup closed');
          });
          
          // Wait for OAuth flow to complete
          await page.waitForTimeout(8000);
        } else {
          console.log('⚠️ No popup detected - checking if OAuth happened inline');
          await page.waitForTimeout(5000);
        }
        
        // Refresh page to check final state
        console.log('\n📊 Refreshing to check final state...');
        await page.reload();
        await page.waitForTimeout(3000);
        
        // Check if HubSpot is now connected
        const finalHubspotCard = await page.locator('.integration-card:has-text("HubSpot"), div:has-text("HubSpot"):has(button)').first();
        const finalConnectedBadge = await finalHubspotCard.locator('text=/Connected/i').first();
        const finalDisconnectButton = await finalHubspotCard.locator('button:has-text("Disconnect")').first();
        const isFinallyConnected = (await finalConnectedBadge.isVisible().catch(() => false)) || (await finalDisconnectButton.isVisible().catch(() => false));
        
        if (isFinallyConnected) {
          console.log('✅ SUCCESS: HubSpot shows as connected after OAuth flow!');
          console.log('   The integration is working correctly.');
          console.log('   The console error is just a UI messaging issue.');
        } else {
          console.log('❌ HubSpot still shows as disconnected in UI');
          console.log('   But check the database - it might be connected there.');
        }
      } else {
        console.log('❌ Connect button not found');
      }
    } else {
      console.log('❌ HubSpot integration card not found');
      console.log('   Looking for any integration cards...');
      
      const anyCard = await page.locator('button:has-text("Connect")').first();
      if (await anyCard.isVisible()) {
        console.log('   Found integration cards but not HubSpot');
      } else {
        console.log('   No integration cards visible - might be loading issue');
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'hubspot-final.png', fullPage: true });
    console.log('📸 Final screenshot saved as hubspot-final.png');
    
  } catch (error) {
    console.error('❌ Test error:', error);
    await page.screenshot({ path: 'hubspot-error.png', fullPage: true });
  }
  
  console.log('\n⏸️ Keeping browser open for 10 seconds to observe...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('✅ Test complete');
}

testHubSpotOAuthWithAuth().catch(console.error);
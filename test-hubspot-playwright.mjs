import { chromium } from 'playwright';

async function testHubSpotOAuth() {
  console.log('🎭 Starting Playwright test for HubSpot OAuth...\n');
  
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
    } else if (msg.text().includes('OAuth') || msg.text().includes('hubspot')) {
      console.log('📝 Console:', msg.text());
    }
  });
  
  try {
    console.log('📍 Navigating to integrations page...');
    await page.goto('http://localhost:3000/integrations');
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    console.log('🔍 Looking for HubSpot integration...');
    
    // Check if HubSpot is connected
    const hubspotCard = await page.locator('text=/HubSpot/i').first();
    if (await hubspotCard.isVisible()) {
      console.log('✅ Found HubSpot integration card');
      
      // Check if it shows as connected
      const connectedBadge = await page.locator('text=/HubSpot/i').locator('..').locator('..').locator('text=/Connected/i').first();
      const isConnected = await connectedBadge.isVisible().catch(() => false);
      
      if (isConnected) {
        console.log('🔗 HubSpot shows as connected');
        
        // Find and click disconnect button
        console.log('🔌 Disconnecting HubSpot first...');
        const disconnectButton = await page.locator('text=/HubSpot/i').locator('..').locator('..').locator('button:has-text("Disconnect")').first();
        if (await disconnectButton.isVisible()) {
          await disconnectButton.click();
          
          // Wait for confirmation dialog
          await page.waitForTimeout(1000);
          
          // Confirm disconnection
          const confirmButton = await page.locator('button:has-text("Disconnect")').last();
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
            console.log('✅ Disconnected HubSpot');
            await page.waitForTimeout(2000);
          }
        }
      }
      
      // Now connect HubSpot
      console.log('🔄 Attempting to connect HubSpot...');
      const connectButton = await page.locator('text=/HubSpot/i').locator('..').locator('..').locator('button:has-text("Connect")').first();
      
      if (await connectButton.isVisible()) {
        // Set up popup promise before clicking
        const popupPromise = page.waitForEvent('popup');
        
        console.log('🖱️ Clicking Connect button...');
        await connectButton.click();
        
        // Wait for popup
        console.log('⏳ Waiting for OAuth popup...');
        const popup = await popupPromise;
        
        console.log('🪟 OAuth popup opened:', popup.url());
        
        // Monitor popup
        popup.on('close', () => {
          console.log('🚪 OAuth popup closed');
        });
        
        // Wait for popup to complete
        await page.waitForTimeout(10000); // Give time for OAuth flow
        
        // Check final state
        console.log('\n📊 Checking final state...');
        await page.reload();
        await page.waitForTimeout(2000);
        
        const finalConnectedBadge = await page.locator('text=/HubSpot/i').locator('..').locator('..').locator('text=/Connected/i').first();
        const isFinallyConnected = await finalConnectedBadge.isVisible().catch(() => false);
        
        if (isFinallyConnected) {
          console.log('✅ SUCCESS: HubSpot shows as connected after OAuth flow!');
        } else {
          console.log('❌ HubSpot still shows as disconnected in UI');
        }
      } else {
        console.log('❌ Connect button not found');
      }
    } else {
      console.log('❌ HubSpot integration card not found');
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'hubspot-oauth-test.png', fullPage: true });
    console.log('📸 Screenshot saved as hubspot-oauth-test.png');
    
  } catch (error) {
    console.error('❌ Test error:', error);
    await page.screenshot({ path: 'hubspot-oauth-error.png', fullPage: true });
  }
  
  console.log('\n⏸️ Keeping browser open for 5 seconds...');
  await page.waitForTimeout(5000);
  
  await browser.close();
  console.log('✅ Test complete');
}

testHubSpotOAuth().catch(console.error);
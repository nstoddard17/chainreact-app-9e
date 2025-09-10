import { chromium } from 'playwright';

(async () => {
  console.log('Starting HubSpot OAuth flow test...');
  
  // Launch Google Chrome (not Chromium)
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 1000, // Slow down for better observation
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Monitor console messages
  page.on('console', msg => {
    console.log(`CONSOLE [${msg.type()}]:`, msg.text());
  });
  
  // Monitor network requests for OAuth-related calls
  page.on('request', request => {
    if (request.url().includes('hubspot') || request.url().includes('oauth') || request.url().includes('integrations')) {
      console.log(`REQUEST: ${request.method()} ${request.url()}`);
    }
  });
  
  try {
    console.log('Navigating to integrations page...');
    await page.goto('http://localhost:3000/integrations');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ path: 'hubspot-test-1-initial.png', fullPage: true });
    console.log('Screenshot 1: Initial integrations page');
    
    // Find the HubSpot integration card
    console.log('Looking for HubSpot integration card...');
    const hubspotCard = await page.locator('[data-testid="integration-card"], .integration-card').filter({ hasText: 'HubSpot' }).first();
    
    if (!(await hubspotCard.isVisible())) {
      // Try alternative selectors
      const allCards = await page.locator('div').filter({ hasText: 'HubSpot' }).all();
      console.log(`Found ${allCards.length} elements containing 'HubSpot'`);
      
      for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
        const text = await card.textContent();
        console.log(`Card ${i}: ${text?.substring(0, 100)}...`);
      }
    }
    
    await page.screenshot({ path: 'hubspot-test-2-searching.png', fullPage: true });
    console.log('Screenshot 2: After searching for HubSpot card');
    
    // Look for connect/disconnect button
    console.log('Looking for Connect/Disconnect button...');
    
    // Check if already connected by looking for disconnect button
    const disconnectButton = await page.locator('button').filter({ hasText: /disconnect|remove|unlink/i }).first();
    
    if (await disconnectButton.isVisible()) {
      console.log('HubSpot appears to be connected. Disconnecting first...');
      await disconnectButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'hubspot-test-3-disconnected.png', fullPage: true });
      console.log('Screenshot 3: After disconnecting');
    }
    
    // Now look for connect button
    const connectButton = await page.locator('button').filter({ hasText: /connect|add|link/i }).first();
    
    if (await connectButton.isVisible()) {
      console.log('Found Connect button. Taking screenshot...');
      await page.screenshot({ path: 'hubspot-test-4-before-connect.png', fullPage: true });
      console.log('Screenshot 4: Before clicking connect');
      
      // Set up popup handler before clicking
      const popupPromise = page.waitForEvent('popup');
      
      console.log('Clicking Connect button...');
      await connectButton.click();
      
      try {
        console.log('Waiting for OAuth popup...');
        const popup = await popupPromise;
        
        console.log(`Popup opened: ${popup.url()}`);
        
        // Monitor popup console
        popup.on('console', msg => {
          console.log(`POPUP CONSOLE [${msg.type()}]:`, msg.text());
        });
        
        // Monitor popup navigation
        popup.on('framenavigated', frame => {
          console.log(`Popup navigated to: ${frame.url()}`);
        });
        
        // Wait for popup to load
        await popup.waitForLoadState('networkidle');
        
        // Take screenshot of popup
        await popup.screenshot({ path: 'hubspot-test-5-popup.png', fullPage: true });
        console.log('Screenshot 5: OAuth popup');
        
        // Monitor for popup close
        popup.on('close', () => {
          console.log('Popup closed');
        });
        
        // Wait a bit to observe popup behavior
        await page.waitForTimeout(5000);
        
        // Check if popup is still open
        if (!popup.isClosed()) {
          console.log('Popup still open. Taking another screenshot...');
          await popup.screenshot({ path: 'hubspot-test-6-popup-later.png', fullPage: true });
          console.log('Screenshot 6: Popup after waiting');
        }
        
        // Wait for popup to close or timeout
        await Promise.race([
          popup.waitForEvent('close'),
          page.waitForTimeout(30000) // 30 second timeout
        ]);
        
        console.log('After popup interaction, checking main page...');
        
        // Check main page for updates
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'hubspot-test-7-after-popup.png', fullPage: true });
        console.log('Screenshot 7: Main page after popup');
        
      } catch (popupError) {
        console.log('Error with popup handling:', popupError.message);
        await page.screenshot({ path: 'hubspot-test-error-popup.png', fullPage: true });
      }
      
    } else {
      console.log('No Connect button found. Taking screenshot of current state...');
      await page.screenshot({ path: 'hubspot-test-no-connect.png', fullPage: true });
      
      // Try to find any HubSpot-related elements
      const hubspotElements = await page.locator('*').filter({ hasText: 'HubSpot' }).all();
      console.log(`Found ${hubspotElements.length} elements containing 'HubSpot':`);
      
      for (let i = 0; i < Math.min(hubspotElements.length, 5); i++) {
        const element = hubspotElements[i];
        const text = await element.textContent();
        const tagName = await element.evaluate(el => el.tagName);
        console.log(`  ${i + 1}. <${tagName}>: ${text?.substring(0, 100)}...`);
      }
    }
    
    // Final screenshot
    await page.screenshot({ path: 'hubspot-test-final.png', fullPage: true });
    console.log('Screenshot: Final state');
    
  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'hubspot-test-error.png', fullPage: true });
  }
  
  console.log('Test completed. Waiting 5 seconds before closing...');
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
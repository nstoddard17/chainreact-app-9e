import { chromium } from 'playwright';

(async () => {
  console.log('Debugging integrations page...');
  
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 1000,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  page.on('console', msg => {
    console.log(`CONSOLE [${msg.type()}]:`, msg.text());
  });
  
  try {
    console.log('Navigating to integrations page...');
    await page.goto('http://localhost:3000/integrations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for React to fully load
    
    // Take screenshot of full page
    await page.screenshot({ path: 'debug-1-full-page.png', fullPage: true });
    console.log('Screenshot 1: Full integrations page');
    
    // Get page title and URL
    const title = await page.title();
    const url = page.url();
    console.log(`Page title: ${title}`);
    console.log(`Page URL: ${url}`);
    
    // Look for any integration cards
    console.log('\n=== Searching for integration cards ===');
    
    // Try different selectors for integration cards
    const cardSelectors = [
      '[data-testid*="integration"]',
      '.integration-card',
      '[class*="integration"]',
      '[class*="card"]',
      'div[role="button"]',
      'button'
    ];
    
    for (const selector of cardSelectors) {
      const elements = await page.locator(selector).all();
      console.log(`Selector "${selector}": Found ${elements.length} elements`);
      
      if (elements.length > 0 && elements.length < 20) {
        for (let i = 0; i < Math.min(elements.length, 5); i++) {
          try {
            const text = await elements[i].textContent();
            const className = await elements[i].getAttribute('class');
            console.log(`  ${i + 1}. Class: "${className}" Text: "${text?.substring(0, 100)}..."`);
          } catch (e) {
            console.log(`  ${i + 1}. Error getting text: ${e.message}`);
          }
        }
      }
    }
    
    // Look for any text containing "hub" (case insensitive)
    console.log('\n=== Searching for "hub" text ===');
    const hubElements = await page.locator('text=/hub/i').all();
    console.log(`Found ${hubElements.length} elements containing "hub":`);
    
    for (let i = 0; i < Math.min(hubElements.length, 10); i++) {
      try {
        const element = hubElements[i];
        const text = await element.textContent();
        const tagName = await element.evaluate(el => el.tagName);
        const className = await element.getAttribute('class');
        console.log(`  ${i + 1}. <${tagName}> class="${className}": "${text}"`);
      } catch (e) {
        console.log(`  ${i + 1}. Error: ${e.message}`);
      }
    }
    
    // Check if there's a search or filter on the page
    console.log('\n=== Looking for search/filter elements ===');
    const searchElements = await page.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="filter"]').all();
    console.log(`Found ${searchElements.length} search elements`);
    
    // Look for any loading states
    console.log('\n=== Looking for loading states ===');
    const loadingElements = await page.locator('text=/loading|spinner|skeleton/i').all();
    console.log(`Found ${loadingElements.length} loading elements`);
    
    // Get all visible text on the page
    console.log('\n=== Page content sample ===');
    const bodyText = await page.locator('body').textContent();
    console.log(`Page contains "integrations": ${bodyText?.toLowerCase().includes('integrations')}`);
    console.log(`Page contains "hubspot": ${bodyText?.toLowerCase().includes('hubspot')}`);
    console.log(`Page contains "connect": ${bodyText?.toLowerCase().includes('connect')}`);
    
    // Take another screenshot after analysis
    await page.screenshot({ path: 'debug-2-after-analysis.png', fullPage: true });
    console.log('Screenshot 2: After analysis');
    
    console.log('\n=== Checking for error states ===');
    const errorElements = await page.locator('text=/error|failed|problem/i').all();
    console.log(`Found ${errorElements.length} error-related elements`);
    
    for (let i = 0; i < Math.min(errorElements.length, 3); i++) {
      try {
        const text = await errorElements[i].textContent();
        console.log(`  Error ${i + 1}: "${text}"`);
      } catch (e) {
        console.log(`  Error ${i + 1}: Could not read text`);
      }
    }
    
  } catch (error) {
    console.error('Debug error:', error);
    await page.screenshot({ path: 'debug-error.png', fullPage: true });
  }
  
  console.log('\nDebug completed. Waiting 10 seconds before closing...');
  await page.waitForTimeout(10000);
  
  await browser.close();
})();
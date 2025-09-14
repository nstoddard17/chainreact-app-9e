import { chromium } from 'playwright';

(async () => {
  // Launch Chrome browser (not Chromium) with proper user profile
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Enable console logging with focus on OAuth messages
  page.on('console', msg => {
    const text = msg.text();
    
    // Focus on OAuth, integration, and polling messages
    if (text.includes('OAuth') || 
        text.includes('oauth') || 
        text.includes('polling') || 
        text.includes('integration') ||
        text.includes('🔍') ||
        text.includes('🔄') ||
        text.includes('✅') ||
        text.includes('❌') ||
        text.includes('🛑') ||
        text.includes('🧹') ||
        text.includes('localStorage')) {
      console.log('[OAUTH LOG]', text);
    }
    // Log errors
    else if (msg.type() === 'error') {
      console.log('[ERROR]', text);
    }
  });
  
  // Log page errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]', error.message);
  });
  
  // Navigate to localhost
  console.log('Navigating to localhost:3000...');
  await page.goto('http://localhost:3000');
  
  console.log('\n===========================================');
  console.log('Browser is open. Please:');
  console.log('1. Navigate to the workflow page');
  console.log('2. Click "Add Action" to open the modal');
  console.log('3. Try connecting multiple integrations');
  console.log('===========================================\n');
  console.log('I will monitor OAuth and integration messages...\n');
  
  // Keep the browser open indefinitely
  console.log('\nBrowser will remain open. Close it manually when done.');
  
  // Use a long timeout instead of infinite promise to handle interrupts better
  await page.waitForTimeout(10000000); // Wait for a very long time (about 3 hours)
})();
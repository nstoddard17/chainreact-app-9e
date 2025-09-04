import { chromium } from 'playwright';

async function takeScreenshot() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('Taking screenshot of workflows page...');
  await page.goto('http://localhost:3000/workflows');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'workflows-page-current.png', fullPage: true });
  console.log('Screenshot saved: workflows-page-current.png');
  
  // Look for any tabs or buttons
  const tabs = await page.locator('[role="tab"], button').all();
  console.log(`\nFound ${tabs.length} clickable elements`);
  
  for (let i = 0; i < Math.min(10, tabs.length); i++) {
    const text = await tabs[i].textContent();
    if (text?.trim()) {
      console.log(`  - ${text.trim()}`);
    }
  }
  
  // Check if there's a textarea
  const textareas = await page.locator('textarea, input[type="text"]').all();
  console.log(`\nFound ${textareas.length} input fields`);
  
  for (let i = 0; i < Math.min(5, textareas.length); i++) {
    const placeholder = await textareas[i].getAttribute('placeholder');
    if (placeholder) {
      console.log(`  - Placeholder: ${placeholder}`);
    }
  }
  
  await page.waitForTimeout(3000);
  await browser.close();
}

takeScreenshot().catch(console.error);
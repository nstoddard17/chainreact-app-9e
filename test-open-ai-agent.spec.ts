import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Open AI Agent Page', () => {
  test('should open AI agent page and handle login', async ({ page }) => {
    // Set longer timeout
    test.setTimeout(120000);

    // Read test credentials
    const credsPath = './.test-credentials.json';
    const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    console.log('Loaded test credentials for:', credentials.email);

    // Go to the AI agent page
    console.log('1. Navigating to AI agent page...');
    await page.goto('http://localhost:3001/workflows/ai-agent');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check current URL
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // Check if we're on login page
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      console.log('2. Login required - entering credentials...');

      // Look for email field
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
        '#email'
      ];

      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          emailInput = selector;
          break;
        } catch {
          // Try next selector
        }
      }

      if (emailInput) {
        console.log('Found email input field');
        await page.fill(emailInput, credentials.email);
      } else {
        console.log('Could not find email input field');
        console.log('Page content:', await page.content());
      }

      // Look for password field
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[placeholder*="password" i]',
        'input[placeholder*="Password" i]',
        '#password'
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          passwordInput = selector;
          break;
        } catch {
          // Try next selector
        }
      }

      if (passwordInput) {
        console.log('Found password input field');
        await page.fill(passwordInput, credentials.password);
      } else {
        console.log('Could not find password input field');
      }

      // Look for login button
      const buttonSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Sign In")',
        'input[type="submit"]'
      ];

      let loginButton = null;
      for (const selector of buttonSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible()) {
            loginButton = button;
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (loginButton) {
        console.log('Found login button, clicking...');
        await loginButton.click();

        // Wait for navigation after login
        await page.waitForURL(/\/workflows/, { timeout: 15000 });
        console.log('3. Login successful! Redirected to:', page.url());
      } else {
        console.log('Could not find login button');
        console.log('Staying on login page for manual intervention...');
        console.log('Please log in manually and the test will continue.');

        // Wait for manual login - check every 2 seconds
        while (page.url().includes('/login') || page.url().includes('/auth')) {
          await page.waitForTimeout(2000);
          console.log('Waiting for manual login... Current URL:', page.url());
        }
        console.log('Manual login detected! Continuing...');
      }
    } else {
      console.log('2. Already logged in or no login required');
    }

    // Now we should be on the AI agent page
    const finalUrl = page.url();
    if (!finalUrl.includes('/workflows/ai-agent')) {
      console.log('Not on AI agent page, navigating there now...');
      await page.goto('http://localhost:3001/workflows/ai-agent');
      await page.waitForLoadState('networkidle');
    }

    console.log('4. Successfully on AI agent page:', page.url());

    // Look for the input field
    console.log('5. Looking for AI prompt input field...');

    const inputSelectors = [
      'textarea',
      'input[type="text"]',
      'input[placeholder*="workflow" i]',
      'input[placeholder*="describe" i]',
      'input[placeholder*="tell me" i]',
      'input[placeholder*="what would" i]',
      '[contenteditable="true"]'
    ];

    let foundInput = false;
    for (const selector of inputSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`Found input field with selector: ${selector}`);

          // Get placeholder or aria-label for context
          const placeholder = await element.getAttribute('placeholder');
          const ariaLabel = await element.getAttribute('aria-label');

          if (placeholder) console.log(`  Placeholder: "${placeholder}"`);
          if (ariaLabel) console.log(`  Aria-label: "${ariaLabel}"`);

          foundInput = true;
          break;
        }
      } catch {
        // Try next selector
      }
    }

    if (!foundInput) {
      console.log('Could not find input field. Page structure:');
      const pageText = await page.locator('body').innerText();
      console.log(pageText.substring(0, 500) + '...');
    }

    // Look for send button
    console.log('6. Looking for send button...');
    const buttonSelectors2 = [
      'button:has-text("Send")',
      'button:has-text("Build")',
      'button:has-text("Create")',
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]'
    ];

    let foundButton = false;
    for (const selector of buttonSelectors2) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Found button with selector: ${selector}`);
          const buttonText = await button.innerText();
          console.log(`  Button text: "${buttonText}"`);
          foundButton = true;
          break;
        }
      } catch {
        // Try next selector
      }
    }

    if (!foundButton) {
      console.log('Could not find send button');
    }

    // Take screenshot
    await page.screenshot({ path: 'ai-agent-page.png', fullPage: true });
    console.log('\n✅ Screenshot saved as ai-agent-page.png');

    console.log('\n✅ AI Agent page is open and ready!');
    console.log('The page will stay open for you to interact with.');

    // Keep the browser open for manual testing
    console.log('\nKeeping browser open for manual testing...');
    console.log('Press Ctrl+C to close when done.');

    // Keep the test running
    await page.waitForTimeout(300000); // Wait 5 minutes
  });
});
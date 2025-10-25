import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Login and Open AI Agent', () => {
  test('should login and open AI agent page', async ({ page }) => {
    // Set longer timeout
    test.setTimeout(180000);

    // Read test credentials
    const credsPath = './.test-credentials.json';
    const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    console.log('Loaded test credentials for:', credentials.email);

    // Start at login page directly
    console.log('1. Navigating to login page...');
    await page.goto('http://localhost:3001/auth/login');

    // Wait for the page to fully load and hydrate
    console.log('2. Waiting for page to hydrate...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Give React time to hydrate

    // Check current URL
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // Take screenshot to see what's on the page
    await page.screenshot({ path: 'login-page-initial.png', fullPage: true });
    console.log('Screenshot saved: login-page-initial.png');

    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      console.log('3. On login page - looking for form fields...');

      // Wait for the form to be visible
      try {
        // Try to wait for any input field first
        await page.waitForSelector('input', { timeout: 10000 });
        console.log('Found input fields on page');
      } catch (e) {
        console.log('No input fields found, page might still be loading');
      }

      // Look for email field with more specific selectors
      let emailFilled = false;
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
        'input[autocomplete="email"]',
        'input:first-of-type'
      ];

      for (const selector of emailSelectors) {
        try {
          const element = page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 1000 });
          if (isVisible) {
            console.log(`Found email field with selector: ${selector}`);
            await element.fill(credentials.email);
            emailFilled = true;
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (!emailFilled) {
        console.log('Could not find email field with specific selectors');
        // Try to find any text input that's not password
        const inputs = await page.locator('input:not([type="password"])').all();
        if (inputs.length > 0) {
          console.log(`Found ${inputs.length} non-password input(s), using first one for email`);
          await inputs[0].fill(credentials.email);
          emailFilled = true;
        }
      }

      // Look for password field
      let passwordFilled = false;
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[id="password"]',
        'input[placeholder*="password" i]',
        'input[placeholder*="Password" i]',
        'input[autocomplete="current-password"]'
      ];

      for (const selector of passwordSelectors) {
        try {
          const element = page.locator(selector).first();
          const isVisible = await element.isVisible({ timeout: 1000 });
          if (isVisible) {
            console.log(`Found password field with selector: ${selector}`);
            await element.fill(credentials.password);
            passwordFilled = true;
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (!passwordFilled) {
        console.log('Could not find password field');
      }

      // Take screenshot after filling
      await page.screenshot({ path: 'login-page-filled.png', fullPage: true });
      console.log('Screenshot saved: login-page-filled.png');

      // Look for login button
      const buttonSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Sign In")',
        'button:has-text("Continue")',
        'input[type="submit"]',
        'button'  // Last resort - any button
      ];

      let loginClicked = false;
      for (const selector of buttonSelectors) {
        try {
          const buttons = await page.locator(selector).all();
          for (const button of buttons) {
            const isVisible = await button.isVisible();
            if (isVisible) {
              const text = await button.innerText().catch(() => '');
              console.log(`Found button with text: "${text}"`);

              // Check if it's likely a submit button
              if (text.toLowerCase().includes('log') ||
                  text.toLowerCase().includes('sign') ||
                  text.toLowerCase().includes('continue') ||
                  text.toLowerCase().includes('submit')) {
                console.log('Clicking login button...');
                await button.click();
                loginClicked = true;
                break;
              }
            }
          }
          if (loginClicked) break;
        } catch {
          // Try next selector
        }
      }

      if (!loginClicked) {
        // Try pressing Enter in the password field
        console.log('No login button found, trying Enter key in password field...');
        if (passwordFilled) {
          await page.keyboard.press('Enter');
        }
      }

      // Wait for navigation or error
      console.log('4. Waiting for login result...');
      try {
        await Promise.race([
          page.waitForURL(/\/workflows/, { timeout: 15000 }),
          page.waitForSelector('.error, .alert, [role="alert"]', { timeout: 15000 })
        ]);

        const newUrl = page.url();
        if (newUrl.includes('/workflows')) {
          console.log('Login successful! Redirected to:', newUrl);
        } else {
          console.log('Login might have failed. Current URL:', newUrl);
          const errorText = await page.locator('.error, .alert, [role="alert"]').first().innerText().catch(() => '');
          if (errorText) {
            console.log('Error message:', errorText);
          }
        }
      } catch (e) {
        console.log('Login timeout or error:', e.message);
        console.log('Current URL after wait:', page.url());
      }
    }

    // Navigate to AI agent page if not there
    const currentUrlAfterLogin = page.url();
    if (!currentUrlAfterLogin.includes('/workflows/ai-agent')) {
      console.log('5. Navigating to AI agent page...');
      await page.goto('http://localhost:3001/workflows/ai-agent');
      await page.waitForLoadState('networkidle');
    }

    console.log('6. Final URL:', page.url());

    // Take final screenshot
    await page.screenshot({ path: 'final-page.png', fullPage: true });
    console.log('Screenshot saved: final-page.png');

    // Look for AI input field
    console.log('7. Looking for AI input field...');
    const aiInputSelectors = [
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      'input',
      '[role="textbox"]'
    ];

    for (const selector of aiInputSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            const placeholder = await element.getAttribute('placeholder').catch(() => '');
            const ariaLabel = await element.getAttribute('aria-label').catch(() => '');

            console.log(`Found input: ${selector}`);
            if (placeholder) console.log(`  Placeholder: "${placeholder}"`);
            if (ariaLabel) console.log(`  Aria-label: "${ariaLabel}"`);

            // Check if this looks like the AI input
            if (placeholder?.toLowerCase().includes('workflow') ||
                placeholder?.toLowerCase().includes('describe') ||
                placeholder?.toLowerCase().includes('what') ||
                ariaLabel?.toLowerCase().includes('workflow')) {
              console.log('  ✅ This appears to be the AI input field!');

              // Try to type in it
              await element.fill('when I get an email, send it to Slack');
              console.log('  ✅ Successfully entered test prompt!');
              break;
            }
          }
        }
      } catch {
        // Try next selector
      }
    }

    console.log('\n✅ Test complete!');
    console.log('Browser will stay open for manual inspection.');

    // Keep browser open
    await page.waitForTimeout(300000); // 5 minutes
  });
});
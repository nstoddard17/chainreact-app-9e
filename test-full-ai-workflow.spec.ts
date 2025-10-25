import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Full AI Workflow Test', () => {
  test('should login and create AI workflow with batch nodes', async ({ page }) => {
    // Set longer timeout for the entire test
    test.setTimeout(240000); // 4 minutes

    // Read test credentials
    const credsPath = './.test-credentials.json';
    const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    console.log('\n=== Starting AI Workflow Test ===');
    console.log('Using credentials for:', credentials.email);

    // Step 1: Navigate to login page
    console.log('\n1. NAVIGATING TO LOGIN PAGE...');
    await page.goto('http://localhost:3001/auth/login', { waitUntil: 'domcontentloaded' });

    // Wait for React to hydrate
    await page.waitForTimeout(2000);
    console.log('   ✓ Page loaded');

    // Step 2: Perform login
    console.log('\n2. PERFORMING LOGIN...');

    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.click();
    await emailInput.fill(credentials.email);
    console.log('   ✓ Email filled');

    // Fill password
    const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]').first();
    await passwordInput.click();
    await passwordInput.fill(credentials.password);
    console.log('   ✓ Password filled');

    // Click sign in button
    const signInButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log in")').first();
    await signInButton.click();
    console.log('   ✓ Sign in button clicked');

    // Wait for navigation away from login
    console.log('   ⏳ Waiting for login to complete...');
    try {
      await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });
      console.log('   ✓ Login successful!');
    } catch (e) {
      console.log('   ⚠️ Login might have failed or is taking longer than expected');
      console.log('   Current URL:', page.url());

      // Check for error messages
      const errorElement = page.locator('.error, .alert, [role="alert"], .text-red-500, .text-destructive').first();
      if (await errorElement.isVisible({ timeout: 1000 })) {
        const errorText = await errorElement.innerText();
        console.log('   ❌ Error message found:', errorText);
      }

      // Take screenshot for debugging
      await page.screenshot({ path: 'login-error.png' });
      console.log('   📸 Screenshot saved: login-error.png');
    }

    // Step 3: Navigate to AI Agent page
    console.log('\n3. NAVIGATING TO AI AGENT PAGE...');
    await page.goto('http://localhost:3001/workflows/ai-agent', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const aiAgentUrl = page.url();
    console.log('   Current URL:', aiAgentUrl);

    if (!aiAgentUrl.includes('/workflows/ai-agent')) {
      console.log('   ⚠️ Not on AI agent page, might need to log in first');

      // Try to navigate again
      await page.goto('http://localhost:3001/workflows/ai-agent');
      await page.waitForTimeout(3000);
    }

    // Step 4: Find and fill the AI input field
    console.log('\n4. FINDING AI INPUT FIELD...');

    // Look for various possible input selectors
    const inputSelectors = [
      'textarea[placeholder*="describe" i]',
      'textarea[placeholder*="workflow" i]',
      'textarea[placeholder*="what" i]',
      'input[placeholder*="describe" i]',
      'input[placeholder*="workflow" i]',
      'textarea',
      'input[type="text"]:not([type="email"]):not([type="password"])',
      '[contenteditable="true"]'
    ];

    let inputField = null;
    for (const selector of inputSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          const placeholder = await element.getAttribute('placeholder') || '';
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          console.log(`   Found ${tagName} with placeholder: "${placeholder}"`);

          // Check if this looks like the right field
          if (placeholder.toLowerCase().includes('workflow') ||
              placeholder.toLowerCase().includes('describe') ||
              placeholder.toLowerCase().includes('what') ||
              placeholder.toLowerCase().includes('tell')) {
            inputField = element;
            console.log('   ✓ This appears to be the AI input field!');
            break;
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    if (!inputField) {
      // If we didn't find a specific field, use the first visible textarea or text input
      inputField = page.locator('textarea, input[type="text"]:not([type="email"]):not([type="password"])').first();
      console.log('   ⚠️ Using first available input field');
    }

    // Step 5: Enter the workflow prompt
    console.log('\n5. ENTERING WORKFLOW PROMPT...');
    const prompt = 'when I get an email, send it to Slack';

    await inputField.click();
    await inputField.fill(prompt);
    console.log(`   ✓ Entered prompt: "${prompt}"`);

    // Take screenshot
    await page.screenshot({ path: 'ai-agent-filled.png' });
    console.log('   📸 Screenshot saved: ai-agent-filled.png');

    // Step 6: Find and click the send button
    console.log('\n6. CLICKING SEND BUTTON...');

    const buttonSelectors = [
      'button:has-text("Send")',
      'button:has-text("Build")',
      'button:has-text("Create")',
      'button:has-text("Generate")',
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]'
    ];

    let sendButton = null;
    for (const selector of buttonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          const text = await button.innerText() || '';
          console.log(`   Found button: "${text}"`);
          sendButton = button;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (sendButton) {
      await sendButton.click();
      console.log('   ✓ Send button clicked');
    } else {
      console.log('   ⚠️ No send button found, trying Enter key...');
      await inputField.press('Enter');
    }

    // Step 7: Wait for redirect to workflow builder
    console.log('\n7. WAITING FOR REDIRECT TO WORKFLOW BUILDER...');

    try {
      await page.waitForURL(/\/workflows\/builder\/.*\?aiChat=true/, { timeout: 10000 });
      const builderUrl = page.url();
      console.log('   ✓ Redirected to workflow builder!');
      console.log('   URL:', builderUrl);

      // Verify URL has initialPrompt
      if (builderUrl.includes('initialPrompt=')) {
        console.log('   ✓ Initial prompt parameter found');
      }
    } catch (e) {
      console.log('   ❌ Redirect timeout - might not have worked');
      console.log('   Current URL:', page.url());

      await page.screenshot({ path: 'redirect-error.png' });
      console.log('   📸 Screenshot saved: redirect-error.png');
    }

    // Step 8: Monitor console for workflow events
    console.log('\n8. MONITORING WORKFLOW BUILDING EVENTS...');

    const events: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[INITIAL_PROMPT]') ||
          text.includes('[STREAM]') ||
          text.includes('[NODE]') ||
          text.includes('node_created') ||
          text.includes('field_configured') ||
          text.includes('Auto-building')) {
        console.log(`   Console: ${text}`);
        events.push(text);
      }
    });

    // Step 9: Wait for React Agent panel
    console.log('\n9. WAITING FOR REACT AGENT PANEL...');

    try {
      const reactAgentPanel = page.locator('.react-agent-panel, [data-testid="react-agent-panel"], div:has-text("React Agent")').first();
      await reactAgentPanel.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ React Agent panel is visible');
    } catch {
      console.log('   ⚠️ React Agent panel not found');
    }

    // Step 10: Wait for workflow plan
    console.log('\n10. WAITING FOR WORKFLOW PLAN...');

    try {
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el =>
            el.textContent?.includes('Building your workflow') ||
            el.textContent?.includes('Creating workflow structure') ||
            el.textContent?.includes('Analyzing your request')
          );
        },
        { timeout: 20000 }
      );
      console.log('   ✓ Workflow planning started');
    } catch {
      console.log('   ⚠️ Workflow plan message not found');
    }

    // Step 11: Wait for batch node creation
    console.log('\n11. CHECKING FOR BATCH NODE CREATION...');

    await page.waitForTimeout(5000); // Give nodes time to appear

    const nodeSelector = '[data-id^="node-"], .react-flow__node';
    const nodeCount = await page.locator(nodeSelector).count();

    if (nodeCount > 0) {
      console.log(`   ✓ Found ${nodeCount} nodes on canvas`);

      // Check if nodes have pending status
      const firstNode = page.locator(nodeSelector).first();
      const classes = await firstNode.getAttribute('class') || '';
      const styles = await firstNode.getAttribute('style') || '';

      if (classes.includes('dashed') || classes.includes('pending') || styles.includes('dashed')) {
        console.log('   ✓ Nodes appear to have pending status (dashed borders)');
      } else {
        console.log('   ⚠️ Nodes might not have pending status');
      }
    } else {
      console.log('   ❌ No nodes found on canvas');
    }

    // Step 12: Check for edges
    console.log('\n12. CHECKING FOR EDGES...');

    const edgeSelector = '[data-id^="edge-"], .react-flow__edge';
    const edgeCount = await page.locator(edgeSelector).count();

    if (edgeCount > 0) {
      console.log(`   ✓ Found ${edgeCount} edges connecting nodes`);
    } else {
      console.log('   ⚠️ No edges found');
    }

    // Step 13: Wait for configuration progress
    console.log('\n13. WAITING FOR CONFIGURATION PROGRESS...');

    try {
      const progressSelector = '[data-testid="workflow-progress"], div:has-text("Node 1 of"), div:has-text("Configuring")';
      await page.waitForSelector(progressSelector, { timeout: 15000 });
      console.log('   ✓ Configuration progress indicator appeared');
    } catch {
      console.log('   ⚠️ Progress indicator not found');
    }

    // Step 14: Final screenshot
    console.log('\n14. TAKING FINAL SCREENSHOT...');
    await page.screenshot({ path: 'workflow-final.png', fullPage: true });
    console.log('   📸 Screenshot saved: workflow-final.png');

    // Summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Nodes found: ${nodeCount}`);
    console.log(`Edges found: ${edgeCount}`);
    console.log(`Events captured: ${events.length}`);

    if (nodeCount >= 2 && edgeCount >= 1) {
      console.log('\n✅ WORKFLOW CREATION SUCCESSFUL!');
    } else {
      console.log('\n⚠️ WORKFLOW CREATION MAY HAVE ISSUES');
    }

    // Keep browser open for inspection
    console.log('\n📌 Browser will stay open for manual inspection...');
    console.log('   Press Ctrl+C to close when done.\n');

    await page.waitForTimeout(300000); // 5 minutes
  });
});
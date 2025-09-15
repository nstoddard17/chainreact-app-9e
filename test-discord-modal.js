import { chromium } from 'playwright';
import path from 'path';

async function testDiscordModal() {
  console.log('🚀 Starting Discord modal test with Google Chrome...');

  // Launch Google Chrome (not Chromium)
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Force Google Chrome
    slowMo: 1000, // Slow down for better visibility
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null // Use full screen
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`🖥️  CONSOLE [${msg.type()}]:`, msg.text());
  });

  // Enable error logging
  page.on('pageerror', error => {
    console.error('❌ PAGE ERROR:', error.message);
  });

  try {
    console.log('📍 Step 1: Navigating to home page first...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('📍 Step 1a: Checking if user is logged in...');
    const isLoginPage = await page.locator('text=Sign In').isVisible();

    if (isLoginPage) {
      console.log('🔐 Login required. Waiting for user to login manually...');
      console.log('👆 Please login in the browser window that opened.');
      console.log('⏳ The script will wait up to 5 minutes for login to complete...');

      // Wait up to 5 minutes for login to complete
      await page.waitForFunction(
        () => !document.querySelector('button:has-text("Sign In")'),
        { timeout: 300000 } // 5 minutes
      );

      console.log('✅ Login detected! Continuing with test...');
      await page.waitForTimeout(2000);
    }

    console.log('📍 Step 2: Navigating to workflows builder...');
    await page.goto('http://localhost:3000/workflows/builder');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Extra wait for any async loading

    console.log('📍 Step 3: Taking initial screenshot...');
    await page.screenshot({ path: 'discord-test-01-initial.png', fullPage: true });

    console.log('📍 Step 4: Looking for existing workflow or creating new one...');

    // Check if there are existing workflows or nodes
    const existingNodes = await page.locator('[data-testid*="node"], .react-flow__node').count();
    console.log(`Found ${existingNodes} existing nodes`);

    if (existingNodes === 0) {
      console.log('📍 Step 4a: No existing nodes, creating new workflow...');
      // Look for "Create Workflow" or similar button
      const createButton = page.locator('button').filter({ hasText: /create|new|add/i }).first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.waitForTimeout(2000);
      }
    }

    console.log('📍 Step 5: Looking for Add Action button...');
    await page.waitForTimeout(2000);

    // Look for Add Action button - try multiple selectors
    const addActionSelectors = [
      'button:has-text("Add Action")',
      '[data-testid="add-action"]',
      'button:has-text("+")',
      '.add-action-button',
      'button[aria-label*="add"]'
    ];

    let addActionButton = null;
    for (const selector of addActionSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        addActionButton = button;
        console.log(`✅ Found Add Action button with selector: ${selector}`);
        break;
      }
    }

    if (!addActionButton) {
      console.log('❌ Add Action button not found. Taking screenshot for debugging...');
      await page.screenshot({ path: 'discord-test-debug-no-add-button.png', fullPage: true });

      // Try to find any buttons on the page
      const allButtons = await page.locator('button').all();
      console.log(`Found ${allButtons.length} buttons on page:`);
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const text = await allButtons[i].textContent();
        console.log(`  Button ${i}: "${text}"`);
      }

      throw new Error('Add Action button not found');
    }

    console.log('📍 Step 6: Clicking Add Action button...');
    await addActionButton.click();
    await page.waitForTimeout(2000);

    console.log('📍 Step 7: Taking screenshot after clicking Add Action...');
    await page.screenshot({ path: 'discord-test-02-add-action-clicked.png', fullPage: true });

    console.log('📍 Step 8: Looking for Discord integration...');

    // Look for Discord in the integration selection
    const discordSelectors = [
      'button:has-text("Discord")',
      '[data-testid*="discord"]',
      '.integration-option:has-text("Discord")',
      'div:has-text("Discord")'
    ];

    let discordOption = null;
    for (const selector of discordSelectors) {
      const option = page.locator(selector).first();
      if (await option.isVisible()) {
        discordOption = option;
        console.log(`✅ Found Discord option with selector: ${selector}`);
        break;
      }
    }

    if (!discordOption) {
      console.log('❌ Discord option not found. Taking screenshot...');
      await page.screenshot({ path: 'discord-test-debug-no-discord.png', fullPage: true });
      throw new Error('Discord integration option not found');
    }

    console.log('📍 Step 9: Clicking Discord integration...');
    await discordOption.click();
    await page.waitForTimeout(2000);

    console.log('📍 Step 10: Looking for Send Channel Message action...');

    // Look for "Send Channel Message" action
    const sendMessageSelectors = [
      'button:has-text("Send Channel Message")',
      '[data-testid*="send-channel-message"]',
      'div:has-text("Send Channel Message")',
      'button:has-text("Send Message")'
    ];

    let sendMessageAction = null;
    for (const selector of sendMessageSelectors) {
      const action = page.locator(selector).first();
      if (await action.isVisible()) {
        sendMessageAction = action;
        console.log(`✅ Found Send Channel Message action with selector: ${selector}`);
        break;
      }
    }

    if (!sendMessageAction) {
      console.log('❌ Send Channel Message action not found. Taking screenshot...');
      await page.screenshot({ path: 'discord-test-debug-no-send-message.png', fullPage: true });
      throw new Error('Send Channel Message action not found');
    }

    console.log('📍 Step 11: Clicking Send Channel Message action...');
    await sendMessageAction.click();
    await page.waitForTimeout(3000); // Wait for modal to open

    console.log('📍 Step 12: Taking screenshot with configuration modal open...');
    await page.screenshot({ path: 'discord-test-03-modal-opened.png', fullPage: true });

    console.log('📍 Step 13: Configuring Discord action...');

    // Look for server/guild dropdown
    console.log('📍 Step 13a: Looking for server/guild dropdown...');
    const guildSelectors = [
      'select[name="guildId"]',
      '[data-testid*="guild"]',
      'select:has-option',
      'input[placeholder*="server"]',
      'input[placeholder*="guild"]'
    ];

    let guildDropdown = null;
    for (const selector of guildSelectors) {
      const dropdown = page.locator(selector).first();
      if (await dropdown.isVisible()) {
        guildDropdown = dropdown;
        console.log(`✅ Found guild dropdown with selector: ${selector}`);
        break;
      }
    }

    if (guildDropdown) {
      console.log('📍 Step 13b: Selecting a server...');
      await guildDropdown.click();
      await page.waitForTimeout(1000);

      // Try to select the first available option
      const firstOption = page.locator('option').nth(1); // Skip the first "Select..." option
      if (await firstOption.isVisible()) {
        const optionText = await firstOption.textContent();
        console.log(`Selecting server: ${optionText}`);
        await firstOption.click();
        await page.waitForTimeout(2000);
      }
    }

    // Look for channel dropdown
    console.log('📍 Step 13c: Looking for channel dropdown...');
    const channelSelectors = [
      'select[name="channelId"]',
      '[data-testid*="channel"]',
      'input[placeholder*="channel"]'
    ];

    let channelDropdown = null;
    for (const selector of channelSelectors) {
      const dropdown = page.locator(selector).first();
      if (await dropdown.isVisible()) {
        channelDropdown = dropdown;
        console.log(`✅ Found channel dropdown with selector: ${selector}`);
        break;
      }
    }

    if (channelDropdown) {
      console.log('📍 Step 13d: Selecting a channel...');
      await channelDropdown.click();
      await page.waitForTimeout(1000);

      // Try to select the first available channel
      const firstChannelOption = page.locator('option').nth(1);
      if (await firstChannelOption.isVisible()) {
        const channelText = await firstChannelOption.textContent();
        console.log(`Selecting channel: ${channelText}`);
        await firstChannelOption.click();
        await page.waitForTimeout(2000);
      }
    }

    // Look for message input
    console.log('📍 Step 13e: Looking for message input...');
    const messageSelectors = [
      'textarea[name="content"]',
      'input[name="message"]',
      'textarea[placeholder*="message"]',
      'input[placeholder*="message"]'
    ];

    let messageInput = null;
    for (const selector of messageSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible()) {
        messageInput = input;
        console.log(`✅ Found message input with selector: ${selector}`);
        break;
      }
    }

    if (messageInput) {
      console.log('📍 Step 13f: Entering test message...');
      await messageInput.fill('Test message from automated testing - Discord config persistence test');
      await page.waitForTimeout(1000);
    }

    console.log('📍 Step 14: Taking screenshot with configured values...');
    await page.screenshot({ path: 'discord-test-04-configured.png', fullPage: true });

    console.log('📍 Step 15: Saving configuration...');

    // Look for Save button
    const saveSelectors = [
      'button:has-text("Save")',
      'button[type="submit"]',
      '[data-testid*="save"]',
      'button:has-text("Done")',
      'button:has-text("Apply")'
    ];

    let saveButton = null;
    for (const selector of saveSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible()) {
        saveButton = button;
        console.log(`✅ Found save button with selector: ${selector}`);
        break;
      }
    }

    if (saveButton) {
      await saveButton.click();
      await page.waitForTimeout(3000); // Wait for save to complete
      console.log('✅ Configuration saved!');
    } else {
      console.log('❌ Save button not found');
      await page.screenshot({ path: 'discord-test-debug-no-save.png', fullPage: true });
    }

    console.log('📍 Step 16: Taking screenshot after saving...');
    await page.screenshot({ path: 'discord-test-05-saved.png', fullPage: true });

    console.log('📍 Step 17: Reopening configuration modal...');

    // Try to find and click the Discord node to reopen the modal
    const discordNodeSelectors = [
      '[data-testid*="discord"]',
      '.react-flow__node:has-text("Discord")',
      'div:has-text("Discord")',
      '.workflow-node:has-text("Discord")'
    ];

    let discordNode = null;
    for (const selector of discordNodeSelectors) {
      const node = page.locator(selector).first();
      if (await node.isVisible()) {
        discordNode = node;
        console.log(`✅ Found Discord node with selector: ${selector}`);
        break;
      }
    }

    if (discordNode) {
      await discordNode.dblclick(); // Double-click to open configuration
      await page.waitForTimeout(3000);
      console.log('✅ Discord configuration modal reopened!');

      console.log('📍 Step 18: Taking screenshot with reopened modal...');
      await page.screenshot({ path: 'discord-test-06-reopened.png', fullPage: true });

      console.log('📍 Step 19: Checking if values persisted...');

      // Check if the values are still there
      if (messageInput) {
        const messageValue = await page.locator('textarea[name="content"], input[name="message"], textarea[placeholder*="message"], input[placeholder*="message"]').first().inputValue();
        console.log(`💾 Message value after reopening: "${messageValue}"`);

        if (messageValue.includes('Test message from automated testing')) {
          console.log('✅ SUCCESS: Message value persisted!');
        } else {
          console.log('❌ ISSUE: Message value did not persist properly');
        }
      }

      // Check dropdowns
      const guildValue = await page.locator('select[name="guildId"]').first().inputValue().catch(() => 'not found');
      const channelValue = await page.locator('select[name="channelId"]').first().inputValue().catch(() => 'not found');

      console.log(`💾 Guild value after reopening: "${guildValue}"`);
      console.log(`💾 Channel value after reopening: "${channelValue}"`);

      console.log('📍 Step 20: Taking final screenshot...');
      await page.screenshot({ path: 'discord-test-07-final.png', fullPage: true });

    } else {
      console.log('❌ Could not find Discord node to reopen modal');
      await page.screenshot({ path: 'discord-test-debug-no-node.png', fullPage: true });
    }

    console.log('🎉 Test completed! Check the screenshots and console logs above.');
    console.log('📸 Screenshots saved:');
    console.log('  - discord-test-01-initial.png');
    console.log('  - discord-test-02-add-action-clicked.png');
    console.log('  - discord-test-03-modal-opened.png');
    console.log('  - discord-test-04-configured.png');
    console.log('  - discord-test-05-saved.png');
    console.log('  - discord-test-06-reopened.png');
    console.log('  - discord-test-07-final.png');

    // Keep browser open for manual inspection
    console.log('🔍 Browser will remain open for manual inspection...');
    console.log('Press Ctrl+C to close when done.');

    // Wait indefinitely
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'discord-test-error.png', fullPage: true });
    console.log('📸 Error screenshot saved as discord-test-error.png');
  }
}

// Run the test
testDiscordModal().catch(console.error);
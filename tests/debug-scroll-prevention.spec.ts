import { test, expect } from '@playwright/test';

test.describe('Scroll Prevention Debug', () => {
  test('should NOT scroll when workflow completes', async ({ page }) => {
    // Listen to console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('FlowV2AgentPanel') || text.includes('scroll') || text.includes('COMPLETE')) {
        consoleLogs.push(text);
        console.log('📋', text);
      }
    });

    // Go to workflows page - try port 3000 first, then 3001
    let connected = false;
    for (const port of [3000, 3001]) {
      try {
        await page.goto(`http://localhost:${port}/workflows`, { timeout: 5000 });
        connected = true;
        console.log(`✅ Connected on port ${port}`);
        break;
      } catch (e) {
        console.log(`❌ Port ${port} not available`);
      }
    }

    if (!connected) {
      throw new Error('Dev server not running on port 3000 or 3001. Run: npm run dev');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Open agent panel
    const agentButton = page.locator('button').filter({ hasText: /agent|sparkles/i }).first();
    if (await agentButton.isVisible()) {
      await agentButton.click();
      await page.waitForTimeout(500);
    }

    // Get the chat messages container
    const chatContainer = page.locator('.overflow-y-auto').filter({ hasText: /prompt|help/i }).first();
    await expect(chatContainer).toBeVisible({ timeout: 5000 });

    // Type a prompt to create a workflow
    const input = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();
    await input.fill('Send a Slack message when I get a new email');
    await input.press('Enter');

    console.log('🚀 Prompt submitted, waiting for workflow build...');
    await page.waitForTimeout(3000);

    // Click Build button if it appears
    const buildButton = page.locator('button').filter({ hasText: /build/i }).first();
    if (await buildButton.isVisible({ timeout: 2000 })) {
      await buildButton.click();
      console.log('🔨 Build button clicked');
    }

    // Wait for building to start
    await page.waitForTimeout(2000);

    // Monitor scroll position BEFORE completion
    let initialScrollTop = await chatContainer.evaluate((el: HTMLElement) => el.scrollTop);
    console.log('📍 Initial scroll position:', initialScrollTop);

    // Create a scroll monitor
    const scrollEvents: Array<{ time: number, scrollTop: number, source: string }> = [];

    await chatContainer.evaluate((el: HTMLElement) => {
      const originalScrollTop = el.scrollTop;
      let eventCount = 0;

      // Monitor scroll changes
      const checkScroll = () => {
        if (el.scrollTop !== originalScrollTop) {
          console.log(`🔴 SCROLL DETECTED! From ${originalScrollTop} to ${el.scrollTop}`);
          eventCount++;
        }
      };

      // Check every 100ms
      const interval = setInterval(checkScroll, 100);

      // Stop monitoring after 15 seconds
      setTimeout(() => {
        clearInterval(interval);
        console.log(`📊 Total scroll changes detected: ${eventCount}`);
      }, 15000);

      // Also listen to scroll events
      el.addEventListener('scroll', () => {
        console.log(`📍 Scroll event fired! scrollTop: ${el.scrollTop}`);
      });
    });

    // Wait for "Flow ready" or "complete" message
    console.log('⏳ Waiting for workflow completion...');

    // Wait up to 20 seconds for completion
    const completionMessage = page.locator('text=/flow.*ready|complete|success/i').first();
    await completionMessage.waitFor({ timeout: 20000, state: 'visible' }).catch(() => {
      console.log('⚠️ Completion message not found, continuing anyway...');
    });

    // Wait a bit more to see if scroll happens after completion
    await page.waitForTimeout(2000);

    // Check final scroll position
    const finalScrollTop = await chatContainer.evaluate((el: HTMLElement) => el.scrollTop);
    console.log('📍 Final scroll position:', finalScrollTop);

    // Check if scroll moved
    const scrollDelta = Math.abs(finalScrollTop - initialScrollTop);
    console.log('📏 Scroll delta:', scrollDelta);

    // Print console logs
    console.log('\n📋 Console logs captured:');
    consoleLogs.forEach(log => console.log('  ', log));

    // Check for scroll lock messages
    const hasLockMessage = consoleLogs.some(log => log.includes('🔒 Locking scroll'));
    const hasReleaseMessage = consoleLogs.some(log => log.includes('🔓 Releasing scroll'));
    const hasStateChange = consoleLogs.some(log => log.includes('COMPLETE'));

    console.log('\n🔍 Diagnostics:');
    console.log('  - Build state changed to COMPLETE:', hasStateChange);
    console.log('  - Scroll lock activated:', hasLockMessage);
    console.log('  - Scroll lock released:', hasReleaseMessage);
    console.log('  - Scroll moved:', scrollDelta > 10);

    // Take screenshot
    await page.screenshot({ path: 'scroll-debug.png', fullPage: true });

    if (scrollDelta > 10 && !hasLockMessage) {
      throw new Error(`❌ Scroll moved by ${scrollDelta}px but scroll lock was never activated! Check if BuildState.COMPLETE is being reached.`);
    } else if (scrollDelta > 10 && hasLockMessage) {
      throw new Error(`❌ Scroll moved by ${scrollDelta}px DESPITE scroll lock being activated! The scroll lock isn't working.`);
    } else {
      console.log('✅ Scroll prevention working correctly!');
    }
  });
});

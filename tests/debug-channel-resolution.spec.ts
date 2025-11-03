import { test, expect } from '@playwright/test';

test.describe('Channel ID Resolution Debug', () => {
  test('should show friendly channel name, not raw ID', async ({ page }) => {
    // Go to workflows page
    await page.goto('http://localhost:3001/workflows');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Find a workflow with Slack Send Message node
    // Or create one by clicking the agent button

    // Click on agent panel to open
    const agentButton = page.locator('button').filter({ hasText: /agent/i }).first();
    if (await agentButton.isVisible()) {
      await agentButton.click();
      await page.waitForTimeout(500);
    }

    // Type a prompt to create a Slack workflow
    const input = page.locator('input[placeholder*="help"]').first();
    await input.fill('Send a message to Slack when I get a new email');
    await input.press('Enter');

    // Wait for planning
    await page.waitForTimeout(3000);

    // Click build if needed
    const buildButton = page.locator('button').filter({ hasText: /build/i }).first();
    if (await buildButton.isVisible()) {
      await buildButton.click();
    }

    // Wait for workflow to build
    await page.waitForTimeout(5000);

    // Find Slack Send Message node
    const slackNode = page.locator('[data-testid*="node"]').filter({ hasText: /send message/i }).first();
    await expect(slackNode).toBeVisible({ timeout: 10000 });

    // Take screenshot of the node
    await slackNode.screenshot({ path: 'slack-node-debug.png' });

    // Check if AUTO-CONFIGURED FIELDS section exists
    const autoConfigSection = slackNode.locator('text=AUTO-CONFIGURED FIELDS');
    await expect(autoConfigSection).toBeVisible({ timeout: 5000 });

    // Look for CHANNEL field
    const channelLabel = slackNode.locator('text=CHANNEL').first();
    await expect(channelLabel).toBeVisible({ timeout: 5000 });

    // Get the channel value (should be friendly name, not raw ID)
    const channelValueBox = slackNode.locator('.border.px-3.py-1').filter({ hasText: /C0\w+|#/ }).first();
    const channelValue = await channelValueBox.textContent();

    console.log('🔍 Channel value found:', channelValue);

    // Check if it's a raw ID (starts with C and has numbers)
    if (channelValue && /^C0[A-Z0-9]+$/.test(channelValue.trim())) {
      console.error('❌ Channel is showing raw ID:', channelValue);

      // Debug: Check node data
      const nodeData = await page.evaluate(() => {
        const nodes = (window as any).reactFlowInstance?.getNodes();
        const slackNode = nodes?.find((n: any) => n.data?.type === 'slack_action_send_message');
        return {
          config: slackNode?.data?.config,
          savedDynamicOptions: slackNode?.data?.savedDynamicOptions,
        };
      });

      console.log('🔍 Node config:', JSON.stringify(nodeData.config, null, 2));
      console.log('🔍 SavedDynamicOptions:', JSON.stringify(nodeData.savedDynamicOptions, null, 2));

      throw new Error(`Channel showing raw ID instead of friendly name: ${channelValue}`);
    } else if (channelValue && channelValue.includes('#')) {
      console.log('✅ Channel showing friendly name:', channelValue);
    } else {
      console.warn('⚠️ Unexpected channel value:', channelValue);
    }
  });
});

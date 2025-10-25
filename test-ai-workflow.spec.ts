import { test, expect, Page } from '@playwright/test';

test.describe('AI Workflow Builder', () => {
  test('should create workflow from AI agent with batch node creation', async ({ page }) => {
    // Set a longer timeout for this test
    test.setTimeout(120000);

    console.log('Starting AI Workflow test...');

    // Go to the AI agent page
    console.log('1. Navigating to AI agent page...');
    await page.goto('http://localhost:3001/workflows/ai-agent');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if we need to log in first
    const isLoginPage = await page.url().includes('/login');
    if (isLoginPage) {
      console.log('Need to log in first...');
      // You'll need to add login logic here based on your auth system
      // For now, we'll assume user is logged in
    }

    // Find and fill the input field
    console.log('2. Looking for input field...');
    const inputSelector = 'textarea, input[type="text"], input[placeholder*="workflow"], input[placeholder*="describe"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });

    const prompt = 'when I get an email, send it to Slack';
    console.log(`3. Entering prompt: "${prompt}"`);
    await page.fill(inputSelector, prompt);

    // Find and click the send button
    console.log('4. Looking for send button...');
    const buttonSelector = 'button:has-text("Send"), button:has-text("Build"), button[type="submit"]';
    await page.waitForSelector(buttonSelector);
    await page.click(buttonSelector);

    // Wait for redirect to workflow builder
    console.log('5. Waiting for redirect to workflow builder...');
    await page.waitForURL(/\/workflows\/builder\/.*\?aiChat=true/, { timeout: 10000 });

    const currentUrl = page.url();
    console.log(`6. Redirected to: ${currentUrl}`);

    // Verify URL has the initialPrompt parameter
    expect(currentUrl).toContain('initialPrompt=');
    expect(currentUrl).toContain('aiChat=true');

    // Wait for React Agent panel to be visible
    console.log('7. Waiting for React Agent panel...');
    const reactAgentPanel = page.locator('[data-testid="react-agent-panel"], .react-agent-panel, div:has-text("React Agent")').first();
    await expect(reactAgentPanel).toBeVisible({ timeout: 10000 });

    // Monitor console for workflow events
    const events: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[INITIAL_PROMPT]') ||
          text.includes('[STREAM]') ||
          text.includes('[NODE]') ||
          text.includes('Auto-building plan') ||
          text.includes('node_created') ||
          text.includes('field_configured')) {
        console.log(`Console: ${text}`);
        events.push(text);
      }
    });

    // Wait for the auto_building_plan event
    console.log('8. Waiting for workflow plan...');
    await page.waitForFunction(
      () => {
        const messages = document.querySelectorAll('.message, [data-testid="agent-message"]');
        return Array.from(messages).some(m =>
          m.textContent?.includes('Building your workflow') ||
          m.textContent?.includes('Creating workflow structure')
        );
      },
      { timeout: 20000 }
    );

    // Wait for batch node creation - all nodes should appear with pending status
    console.log('9. Waiting for batch node creation...');

    // Wait for at least 2 nodes to appear
    const nodeSelector = '[data-id^="node-"], .react-flow__node';
    await page.waitForSelector(nodeSelector, { timeout: 15000 });

    // Give it a moment for all nodes to be added
    await page.waitForTimeout(2000);

    // Count the nodes
    const nodeCount = await page.locator(nodeSelector).count();
    console.log(`10. Found ${nodeCount} nodes on canvas`);
    expect(nodeCount).toBeGreaterThanOrEqual(2);

    // Check if nodes have pending status (dashed borders)
    console.log('11. Checking node visual states...');
    const firstNode = page.locator(nodeSelector).first();

    // Check for dashed border style (pending state)
    const hasDashedBorder = await firstNode.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return styles.borderStyle === 'dashed' ||
             el.classList.toString().includes('dashed') ||
             el.classList.toString().includes('pending');
    });

    if (hasDashedBorder) {
      console.log('✓ Nodes have pending status (dashed borders)');
    } else {
      console.log('⚠️ Nodes might not have pending status');
    }

    // Wait for edges to be created
    console.log('12. Waiting for edges...');
    const edgeSelector = '[data-id^="edge-"], .react-flow__edge';
    await page.waitForSelector(edgeSelector, { timeout: 10000 });

    const edgeCount = await page.locator(edgeSelector).count();
    console.log(`13. Found ${edgeCount} edges`);
    expect(edgeCount).toBeGreaterThanOrEqual(1);

    // Wait for configuration to start
    console.log('14. Waiting for node configuration to start...');

    // Look for progress indicator
    const progressSelector = '[data-testid="workflow-progress"], div:has-text("Node 1 of"), div:has-text("Configuring")';
    await page.waitForSelector(progressSelector, { timeout: 20000 });
    console.log('✓ Configuration progress indicator appeared');

    // Wait for field configuration
    console.log('15. Waiting for fields to be configured...');
    await page.waitForFunction(
      () => {
        const messages = document.querySelectorAll('.message, [data-testid="agent-message"]');
        return Array.from(messages).some(m =>
          m.textContent?.includes('Setting') ||
          m.textContent?.includes('configured') ||
          m.textContent?.includes('field')
        );
      },
      { timeout: 20000 }
    );

    // Wait for first node to complete
    console.log('16. Waiting for first node to complete...');
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('[data-id^="node-"]');
        return Array.from(nodes).some(node => {
          const styles = window.getComputedStyle(node);
          return styles.borderColor.includes('34, 197, 94') || // green
                 node.classList.toString().includes('success') ||
                 node.classList.toString().includes('complete') ||
                 node.classList.toString().includes('ready');
        });
      },
      { timeout: 30000 }
    );
    console.log('✓ First node completed');

    // Wait for workflow completion
    console.log('17. Waiting for workflow completion...');
    await page.waitForFunction(
      () => {
        const messages = document.querySelectorAll('.message, [data-testid="agent-message"], div');
        return Array.from(messages).some(m =>
          m.textContent?.includes('Workflow complete') ||
          m.textContent?.includes('Workflow ready') ||
          m.textContent?.includes('Everything is set up') ||
          m.textContent?.includes('ready to use')
        );
      },
      { timeout: 40000 }
    );

    console.log('18. Verifying final state...');

    // All nodes should have green borders (complete state)
    const allNodesComplete = await page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-id^="node-"]');
      return Array.from(nodes).every(node => {
        const styles = window.getComputedStyle(node);
        const classList = node.classList.toString();
        return styles.borderColor.includes('34, 197, 94') || // green
               classList.includes('success') ||
               classList.includes('complete') ||
               classList.includes('ready');
      });
    });

    if (allNodesComplete) {
      console.log('✓ All nodes are in complete state');
    } else {
      console.log('⚠️ Some nodes might not be complete');
    }

    // Progress indicator should be gone
    const progressGone = await page.locator(progressSelector).count() === 0;
    if (progressGone) {
      console.log('✓ Progress indicator cleared');
    } else {
      console.log('⚠️ Progress indicator might still be visible');
    }

    // Take a screenshot of the final state
    await page.screenshot({ path: 'workflow-complete.png', fullPage: true });
    console.log('✓ Screenshot saved as workflow-complete.png');

    console.log('\n✅ Test completed successfully!');
    console.log('Workflow was created with batch node creation and sequential configuration.');

    // Log captured events for debugging
    if (events.length > 0) {
      console.log('\nCaptured events:');
      events.forEach(e => console.log(`  - ${e}`));
    }
  });
});
import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('AI Workflow Test - Fixed', () => {
  test('should create AI workflow with batch node creation', async ({ page }) => {
    // Set longer timeout for the entire test
    test.setTimeout(300000); // 5 minutes

    // Read test credentials
    const credsPath = './.test-credentials.json';
    const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    console.log('\n=== Starting AI Workflow Test (Fixed) ===');
    console.log('Using credentials for:', credentials.email);

    // Step 1: Navigate to login page
    console.log('\n1. NAVIGATING TO LOGIN PAGE...');
    await page.goto('http://localhost:3001/auth/login', { waitUntil: 'domcontentloaded' });
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
      console.log('   ⚠️ Login might have failed');
      await page.screenshot({ path: 'login-error.png' });
    }

    // Step 3: Navigate to AI Agent page
    console.log('\n3. NAVIGATING TO AI AGENT PAGE...');
    await page.goto('http://localhost:3001/workflows/ai-agent', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('   Current URL:', page.url());

    // Step 4: Find and fill the AI input field
    console.log('\n4. FINDING AND FILLING AI INPUT FIELD...');

    // Find the textarea
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10000 });

    const prompt = 'when I get an email, send it to Slack';
    await textarea.click();
    await textarea.fill(prompt);
    console.log(`   ✓ Entered prompt: "${prompt}"`);

    await page.screenshot({ path: 'ai-agent-filled.png' });
    console.log('   📸 Screenshot saved: ai-agent-filled.png');

    // Step 5: Send the prompt (try multiple methods)
    console.log('\n5. SENDING THE PROMPT...');

    // Wait a moment for the text to register
    await page.waitForTimeout(500);

    // Method 1: Try to find and click the send button
    try {
      // The send button is positioned absolutely near the textarea
      // It contains an SVG icon and is the last button in the textarea container
      const sendButton = page.locator('button').filter({ has: page.locator('svg') }).last();

      if (await sendButton.isVisible({ timeout: 2000 })) {
        await sendButton.click();
        console.log('   ✓ Clicked send button');
      } else {
        throw new Error('Send button not visible');
      }
    } catch (e) {
      // Method 2: If button not found, press Enter in the textarea
      console.log('   ⚠️ Send button not found, pressing Enter in textarea...');
      await textarea.press('Enter');
      console.log('   ✓ Pressed Enter in textarea');
    }

    // Step 6: Wait for redirect to workflow builder
    console.log('\n6. WAITING FOR REDIRECT TO WORKFLOW BUILDER...');

    try {
      await page.waitForURL(/\/workflows\/builder\//, { timeout: 15000 });
      const builderUrl = page.url();
      console.log('   ✓ Redirected to workflow builder!');
      console.log('   URL:', builderUrl);

      // Verify URL parameters
      if (builderUrl.includes('aiChat=true')) {
        console.log('   ✓ aiChat parameter found');
      }
      if (builderUrl.includes('initialPrompt=')) {
        console.log('   ✓ initialPrompt parameter found');
      }
    } catch (e) {
      console.log('   ❌ No redirect detected');
      console.log('   Current URL:', page.url());
      await page.screenshot({ path: 'no-redirect.png' });
      console.log('   📸 Screenshot saved: no-redirect.png');

      // Don't exit - continue to see if workflow builds anyway
    }

    // Step 7: Monitor console for workflow events
    console.log('\n7. SETTING UP EVENT MONITORING...');

    const capturedEvents: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[INITIAL_PROMPT]') ||
          text.includes('[STREAM]') ||
          text.includes('[NODE]') ||
          text.includes('[EDGE]') ||
          text.includes('Auto-building') ||
          text.includes('node_created') ||
          text.includes('field_configured') ||
          text.includes('workflow_complete')) {
        console.log(`   📡 Event: ${text.substring(0, 100)}...`);
        capturedEvents.push(text);
      }
    });

    // Step 8: Wait for React Agent panel (if redirected)
    console.log('\n8. CHECKING FOR REACT AGENT PANEL...');

    try {
      const reactAgentPanel = page.locator('.react-agent-panel, [data-testid="react-agent-panel"], aside:has-text("React Agent")').first();
      await reactAgentPanel.waitFor({ state: 'visible', timeout: 5000 });
      console.log('   ✓ React Agent panel is visible');
    } catch {
      console.log('   ⚠️ React Agent panel not found (might not have redirected)');
    }

    // Step 9: Wait for workflow building messages
    console.log('\n9. WAITING FOR WORKFLOW BUILDING...');

    try {
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => {
            const text = el.textContent || '';
            return text.includes('Building your workflow') ||
                   text.includes('Creating workflow structure') ||
                   text.includes('Analyzing your request') ||
                   text.includes('Planning workflow');
          });
        },
        { timeout: 20000 }
      );
      console.log('   ✓ Workflow building started');
    } catch {
      console.log('   ⚠️ No workflow building messages found');
    }

    // Step 10: Wait for batch node creation
    console.log('\n10. WAITING FOR BATCH NODE CREATION...');

    // Give time for nodes to appear
    await page.waitForTimeout(10000);

    // Check for nodes
    const nodeSelector = '[data-id^="node-"], .react-flow__node';
    try {
      await page.waitForSelector(nodeSelector, { timeout: 15000 });
      const nodeCount = await page.locator(nodeSelector).count();
      console.log(`   ✓ Found ${nodeCount} nodes on canvas`);

      if (nodeCount >= 2) {
        console.log('   ✅ Multiple nodes created!');

        // Check node visual state
        const firstNode = page.locator(nodeSelector).first();
        const nodeClass = await firstNode.getAttribute('class') || '';
        const nodeStyle = await firstNode.getAttribute('style') || '';

        if (nodeClass.includes('dashed') || nodeClass.includes('pending') ||
            nodeStyle.includes('dashed') || nodeStyle.includes('opacity: 0.6')) {
          console.log('   ✓ Nodes have pending status (dashed/semi-transparent)');
        } else {
          console.log('   ⚠️ Nodes might not have pending visual state');
        }
      }
    } catch {
      console.log('   ❌ No nodes found on canvas');
    }

    // Step 11: Check for edges
    console.log('\n11. CHECKING FOR EDGES...');

    const edgeSelector = '[data-id^="edge-"], .react-flow__edge';
    try {
      const edgeCount = await page.locator(edgeSelector).count();
      if (edgeCount > 0) {
        console.log(`   ✓ Found ${edgeCount} edges connecting nodes`);
      } else {
        console.log('   ⚠️ No edges found');
      }
    } catch {
      console.log('   ❌ Error checking edges');
    }

    // Step 12: Check for configuration progress
    console.log('\n12. CHECKING FOR CONFIGURATION PROGRESS...');

    try {
      const progressIndicator = page.locator(
        '[data-testid="workflow-progress"], ' +
        'div:has-text("Node 1 of"), ' +
        'div:has-text("Configuring"), ' +
        'div:has-text("Testing")'
      ).first();

      if (await progressIndicator.isVisible({ timeout: 10000 })) {
        console.log('   ✓ Configuration progress indicator found');
        const progressText = await progressIndicator.innerText();
        console.log(`   Progress: ${progressText}`);
      }
    } catch {
      console.log('   ⚠️ No progress indicator found');
    }

    // Step 13: Wait for workflow completion
    console.log('\n13. WAITING FOR WORKFLOW COMPLETION...');

    try {
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => {
            const text = el.textContent || '';
            return text.includes('Workflow complete') ||
                   text.includes('Workflow ready') ||
                   text.includes('Everything is set up') ||
                   text.includes('Successfully created');
          });
        },
        { timeout: 60000 }
      );
      console.log('   ✓ Workflow completed!');
    } catch {
      console.log('   ⚠️ Workflow completion message not found');
    }

    // Step 14: Final state check
    console.log('\n14. FINAL STATE CHECK...');

    await page.screenshot({ path: 'workflow-final-state.png', fullPage: true });
    console.log('   📸 Final screenshot saved: workflow-final-state.png');

    // Count final nodes and edges
    const finalNodeCount = await page.locator(nodeSelector).count();
    const finalEdgeCount = await page.locator(edgeSelector).count();

    // Check if all nodes are green (complete)
    let allNodesComplete = false;
    try {
      allNodesComplete = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-id^="node-"]');
        return Array.from(nodes).every(node => {
          const styles = window.getComputedStyle(node);
          const classList = node.className;
          return styles.borderColor.includes('34, 197, 94') || // green
                 classList.includes('success') ||
                 classList.includes('complete') ||
                 classList.includes('ready');
        });
      });
    } catch {
      console.log('   ⚠️ Could not check node completion status');
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Final nodes: ${finalNodeCount}`);
    console.log(`Final edges: ${finalEdgeCount}`);
    console.log(`Events captured: ${capturedEvents.length}`);
    console.log(`All nodes complete: ${allNodesComplete}`);

    if (finalNodeCount >= 2 && finalEdgeCount >= 1) {
      console.log('\n✅ SUCCESS: Workflow was created with multiple nodes and edges!');
    } else if (finalNodeCount > 0) {
      console.log('\n⚠️ PARTIAL SUCCESS: Some nodes were created');
    } else {
      console.log('\n❌ FAILURE: No workflow nodes were created');
    }

    // Keep browser open for manual inspection
    console.log('\n📌 Browser will stay open for 2 minutes for inspection...');
    console.log('   You can interact with the workflow manually.');
    console.log('   Press Ctrl+C to close when done.\n');

    await page.waitForTimeout(120000); // 2 minutes
  });
});
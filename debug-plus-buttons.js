/**
 * Debug script to investigate why plus buttons aren't showing on edges
 *
 * This script will:
 * 1. Navigate to a workflow builder
 * 2. Check if edges exist
 * 3. Check if plus buttons are rendered in the DOM
 * 4. Check if PhantomEdgeOverlay is rendered
 * 5. Take screenshots for debugging
 */

import { chromium } from 'playwright';

async function debugPlusButtons() {
  console.log('🚀 Starting plus buttons debug session...\n');

  // Launch Chrome browser
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 1000 // Slow down by 1 second for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    // Navigate to workflows page
    console.log('📍 Navigating to http://localhost:3001/workflows');
    await page.goto('http://localhost:3001/workflows', { waitUntil: 'networkidle' });

    console.log('\n⏳ Waiting for authentication/page load...');
    console.log('👉 Please sign in if needed. Press Enter when ready to continue...');

    // Wait for user to authenticate manually
    await page.waitForTimeout(5000);

    // Look for workflow links or create new workflow
    console.log('\n🔍 Looking for existing workflows or creating new one...');

    // Wait for workflows list to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Try to find a workflow link or create new workflow button
    const workflowLinks = await page.$$('a[href*="/workflows/"]');

    if (workflowLinks.length > 0) {
      console.log(`✅ Found ${workflowLinks.length} workflow(s)`);
      console.log('📍 Clicking first workflow...');
      await workflowLinks[0].click();
    } else {
      console.log('⚠️  No workflows found, looking for "New Workflow" button...');
      const newWorkflowButton = await page.$('button:has-text("New Workflow"), a:has-text("New Workflow")');
      if (newWorkflowButton) {
        await newWorkflowButton.click();
      } else {
        console.log('❌ Could not find workflow or new workflow button');
        console.log('🔍 Current URL:', page.url());
        await page.screenshot({ path: 'debug-workflows-page.png' });
        return;
      }
    }

    // Wait for workflow builder to load
    console.log('\n⏳ Waiting for workflow builder to load...');
    await page.waitForTimeout(3000);

    // Check for ReactFlow container
    const reactFlowExists = await page.$('.react-flow');
    console.log(`\n📊 ReactFlow container: ${reactFlowExists ? '✅ Found' : '❌ Not found'}`);

    if (!reactFlowExists) {
      console.log('❌ ReactFlow not loaded. Taking screenshot...');
      await page.screenshot({ path: 'debug-no-reactflow.png' });
      return;
    }

    // Check for nodes
    const nodes = await page.$$('.react-flow__node');
    console.log(`📦 Nodes found: ${nodes.length}`);

    // Check for edges
    const edges = await page.$$('.react-flow__edge');
    console.log(`🔗 Edges found: ${edges.length}`);

    // Check for edge labels (where plus buttons should be)
    const edgeLabels = await page.$$('[class*="EdgeLabelRenderer"]');
    console.log(`🏷️  EdgeLabelRenderer elements: ${edgeLabels.length}`);

    // Check for plus buttons on edges
    const plusButtons = await page.$$('.react-flow__edge button, [class*="EdgeLabelRenderer"] button');
    console.log(`➕ Plus buttons on edges: ${plusButtons.length}`);

    if (plusButtons.length > 0) {
      console.log('✅ Plus buttons ARE rendered!');
      for (let i = 0; i < plusButtons.length; i++) {
        const btn = plusButtons[i];
        const isVisible = await btn.isVisible();
        const box = await btn.boundingBox();
        console.log(`   Button ${i + 1}: Visible=${isVisible}, Position=${box ? `x:${box.x}, y:${box.y}` : 'null'}`);
      }
    } else {
      console.log('❌ No plus buttons found on edges');
    }

    // Check for PhantomEdgeOverlay
    const phantomEdge = await page.$('svg line[stroke-dasharray="5,5"]');
    console.log(`\n👻 PhantomEdgeOverlay (dashed line): ${phantomEdge ? '✅ Found' : '❌ Not found'}`);

    if (phantomEdge) {
      const phantomButton = await page.$('svg foreignObject button');
      console.log(`   Phantom edge button: ${phantomButton ? '✅ Found' : '❌ Not found'}`);
    }

    // Check edge data for onInsertNode handler
    const edgeData = await page.evaluate(() => {
      const reactFlow = document.querySelector('.react-flow');
      if (!reactFlow) return null;

      // Try to get ReactFlow instance from window (if exposed)
      if (window.__REACT_FLOW_INSTANCE__) {
        const edges = window.__REACT_FLOW_INSTANCE__.getEdges();
        return edges.map(edge => ({
          id: edge.id,
          hasData: !!edge.data,
          hasOnInsertNode: !!(edge.data && edge.data.onInsertNode)
        }));
      }

      return null;
    });

    console.log('\n📋 Edge data check:');
    if (edgeData) {
      edgeData.forEach(edge => {
        console.log(`   ${edge.id}: hasData=${edge.hasData}, hasOnInsertNode=${edge.hasOnInsertNode}`);
      });
    } else {
      console.log('   ⚠️  Could not access ReactFlow instance');
    }

    // Take screenshots
    console.log('\n📸 Taking screenshots...');
    await page.screenshot({ path: 'debug-workflow-builder.png', fullPage: true });
    console.log('   Saved: debug-workflow-builder.png');

    // Highlight edges for debugging
    await page.evaluate(() => {
      document.querySelectorAll('.react-flow__edge path').forEach(edge => {
        edge.style.stroke = 'red';
        edge.style.strokeWidth = '4px';
      });
    });

    await page.screenshot({ path: 'debug-edges-highlighted.png' });
    console.log('   Saved: debug-edges-highlighted.png (edges highlighted in red)');

    // Try to find any buttons in the ReactFlow area
    const allButtons = await page.$$('.react-flow button');
    console.log(`\n🔘 Total buttons in ReactFlow area: ${allButtons.length}`);

    for (let i = 0; i < Math.min(5, allButtons.length); i++) {
      const btn = allButtons[i];
      const text = await btn.textContent();
      const classes = await btn.getAttribute('class');
      const isVisible = await btn.isVisible();
      console.log(`   Button ${i + 1}: text="${text}", visible=${isVisible}, classes="${classes}"`);
    }

    console.log('\n✅ Debug session complete!');
    console.log('📂 Check the screenshots for visual debugging.');
    console.log('\n👉 Browser will stay open for manual inspection. Press Ctrl+C to exit.');

    // Keep browser open for manual inspection
    await page.waitForTimeout(300000); // 5 minutes

  } catch (error) {
    console.error('\n❌ Error during debugging:', error);
    await page.screenshot({ path: 'debug-error.png' });
    console.log('📸 Error screenshot saved: debug-error.png');
  } finally {
    await browser.close();
    console.log('\n👋 Browser closed.');
  }
}

debugPlusButtons().catch(console.error);

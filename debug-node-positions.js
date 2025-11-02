import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('Navigating to workflow builder...');
    await page.goto('http://localhost:3000/workflows/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Looking for existing workflow or build button...');

    // Check if nodes already exist, if not wait longer
    const existingNodes = await page.$$('.react-flow__node');
    if (existingNodes.length === 0) {
      console.log('No nodes found, waiting 8 more seconds for build to complete...');
      await page.waitForTimeout(8000);
    }

    // Wait for nodes to appear
    console.log('Waiting for nodes...');
    await page.waitForSelector('.react-flow__node', { timeout: 15000 });

    // Get all nodes
    const nodes = await page.$$('.react-flow__node');
    console.log(`Found ${nodes.length} nodes`);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const transform = await node.evaluate(el => window.getComputedStyle(el).transform);
      const position = await node.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      });

      console.log(`\nNode ${i + 1}:`);
      console.log(`  Transform: ${transform}`);
      console.log(`  Position: top=${position.top}, left=${position.left}`);
      console.log(`  Size: width=${position.width}, height=${position.height}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n\nPress Ctrl+C to close browser...');
  await page.waitForTimeout(30000);
  await browser.close();
})();

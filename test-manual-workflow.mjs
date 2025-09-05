import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:3000';

async function createAndTestManualWorkflow() {
  console.log('🚀 Starting manual workflow test with execution visualization...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    
    // Navigate to the app
    console.log('📍 Navigating to application...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    
    // Wait for the page to load
    await new Promise(r => setTimeout(r, 2000));
    
    // Check if we're on the login page
    const isLoginPage = await page.$('input[type="email"]') !== null;
    
    if (isLoginPage) {
      console.log('🔐 Logging in...');
      // Fill in email
      await page.type('input[type="email"]', 'test@example.com');
      
      // Fill in password
      await page.type('input[type="password"]', 'testpassword123');
      
      // Click login button
      await page.click('button[type="submit"]');
      
      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
    }
    
    // Navigate to workflows page
    console.log('📋 Navigating to workflows...');
    await page.goto(`${BASE_URL}/workflows`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    
    // Create new workflow
    console.log('➕ Creating new workflow...');
    const newWorkflowButton = await page.$('button:has-text("Create Workflow"), button:has-text("New Workflow"), a[href*="/workflows/new"]');
    if (newWorkflowButton) {
      await newWorkflowButton.click();
    } else {
      // Try clicking the + button or any create button
      await page.click('button[aria-label*="create" i], button[aria-label*="new" i], button:has(svg[class*="plus" i])').catch(() => {
        console.log('Could not find create button, trying alternative...');
      });
    }
    
    await new Promise(r => setTimeout(r, 3000))
    
    // Check if we're in the workflow builder
    const isInBuilder = await page.$('.react-flow, #workflow-builder, [data-testid="workflow-canvas"]') !== null;
    
    if (!isInBuilder) {
      console.log('⚠️ Not in workflow builder, trying to navigate directly...');
      // Create a new workflow via API or direct navigation
      await page.goto(`${BASE_URL}/workflows/new`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('🎯 In workflow builder, adding Manual trigger...');
    
    // Add Manual trigger
    await page.click('button:has-text("Add Trigger"), button:has-text("+ Trigger"), button[aria-label*="trigger" i]').catch(async () => {
      // Try right-clicking on canvas to add trigger
      const canvas = await page.$('.react-flow__viewport, [data-testid="workflow-canvas"]');
      if (canvas) {
        const box = await canvas.boundingBox();
        await page.mouse.click(box.x + 100, box.y + 100, { button: 'right' });
        await new Promise(r => setTimeout(r, 500))
      }
    });
    
    await new Promise(r => setTimeout(r, 1000))
    
    // Select Manual trigger from the list
    const manualTrigger = await page.$('div:has-text("Manual"), button:has-text("Manual"), [data-integration="manual"]');
    if (manualTrigger) {
      await manualTrigger.click();
      console.log('✅ Manual trigger selected');
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Add an action node
    console.log('➕ Adding an action node...');
    await page.click('button:has-text("Add Action"), button:has-text("+ Action"), button[aria-label*="action" i]').catch(async () => {
      // Try right-clicking on canvas to add action
      const canvas = await page.$('.react-flow__viewport, [data-testid="workflow-canvas"]');
      if (canvas) {
        const box = await canvas.boundingBox();
        await page.mouse.click(box.x + 300, box.y + 100, { button: 'right' });
        await new Promise(r => setTimeout(r, 500))
      }
    });
    
    await new Promise(r => setTimeout(r, 1000))
    
    // Select a simple action (e.g., Logic > Delay)
    const logicCategory = await page.$('div:has-text("Logic"), button:has-text("Logic"), [data-category="logic"]');
    if (logicCategory) {
      await logicCategory.click();
      await new Promise(r => setTimeout(r, 500))
      
      const delayAction = await page.$('div:has-text("Delay"), button:has-text("Delay"), [data-action="delay"]');
      if (delayAction) {
        await delayAction.click();
        console.log('✅ Delay action added');
      }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Save the workflow
    console.log('💾 Saving workflow...');
    const saveButton = await page.$('button:has-text("Save"), button[aria-label*="save" i]');
    if (saveButton) {
      await saveButton.click();
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Now test the execution
    console.log('🎬 Testing workflow execution...');
    
    // Find and click the Execute/Test button
    const executeButton = await page.$('button:has-text("Execute"), button:has-text("Test"), button[aria-label*="execute" i], button[aria-label*="test" i]');
    if (executeButton) {
      console.log('🔄 Clicking Execute/Test button...');
      await executeButton.click();
      
      // Monitor node color changes
      console.log('👀 Monitoring node execution status colors...');
      
      // Set up monitoring for node state changes
      const checkNodeColors = async () => {
        const nodes = await page.$$('[data-node-id], .react-flow__node, [class*="workflow-node"]');
        
        for (const node of nodes) {
          const classList = await node.evaluate(el => el.className);
          const styles = await node.evaluate(el => window.getComputedStyle(el));
          
          // Check for execution status classes or styles
          if (classList.includes('executing') || classList.includes('running') || classList.includes('in-progress')) {
            console.log('🟡 Node is executing (yellow/blue state)');
          } else if (classList.includes('completed') || classList.includes('success')) {
            console.log('🟢 Node completed successfully (green state)');
          } else if (classList.includes('error') || classList.includes('failed')) {
            console.log('🔴 Node failed (red state)');
          } else if (classList.includes('pending') || classList.includes('waiting')) {
            console.log('⚪ Node is pending (gray state)');
          }
        }
      };
      
      // Monitor for 10 seconds
      let monitoringTime = 0;
      const monitorInterval = setInterval(async () => {
        await checkNodeColors();
        monitoringTime += 1000;
        
        if (monitoringTime >= 10000) {
          clearInterval(monitorInterval);
          console.log('✅ Execution monitoring complete');
        }
      }, 1000);
      
      // Wait for execution to complete
      await new Promise(r => setTimeout(r, 10000))
      
    } else {
      console.log('⚠️ Execute/Test button not found');
    }
    
    // Check for History button
    console.log('🔍 Checking for History button...');
    const historyButton = await page.$('button:has-text("History"), button[aria-label*="history" i]');
    if (historyButton) {
      console.log('✅ History button found!');
      await historyButton.click();
      await new Promise(r => setTimeout(r, 2000));
      
      // Check if execution history modal opened
      const historyModal = await page.$('[role="dialog"]:has-text("Execution History"), .execution-history-modal');
      if (historyModal) {
        console.log('✅ Execution history modal opened successfully');
        
        // Look for the execution we just ran
        const latestExecution = await page.$('.execution-item:first-child, [data-execution]:first-child');
        if (latestExecution) {
          console.log('✅ Latest execution found in history');
          
          // Check for AI field resolutions if any
          const aiResolutions = await page.$('.ai-field-resolution, [data-ai-resolution]');
          if (aiResolutions) {
            console.log('✅ AI field resolutions displayed');
          }
        }
      }
    } else {
      console.log('⚠️ History button not found');
    }
    
    console.log('🎉 Manual workflow test complete!');
    
    // Keep browser open for manual inspection
    console.log('Browser will remain open for inspection. Close it manually when done.');
    
  } catch (error) {
    console.error('❌ Error during test:', error);
    await browser.close();
  }
}

// Run the test
createAndTestManualWorkflow().catch(console.error);
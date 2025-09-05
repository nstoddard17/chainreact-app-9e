import { chromium } from 'playwright';

async function testWorkflowExecutionFeedback() {
  console.log('🚀 Starting workflow execution visual feedback test...');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to the application
    console.log('📍 Navigating to application...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Take initial screenshot
    await page.screenshot({ 
      path: '.playwright-mcp/initial-page.png', 
      fullPage: true 
    });
    console.log('📸 Screenshot saved: initial-page.png');
    
    // Check if we're on login page
    const emailInput = page.locator('input[type="email"]');
    const isLoginPage = await emailInput.count() > 0;
    
    if (isLoginPage) {
      console.log('🔐 Login page detected');
      await page.screenshot({ 
        path: '.playwright-mcp/login-page.png', 
        fullPage: true 
      });
      console.log('📸 Screenshot saved: login-page.png');
      console.log('⚠️ Authentication required - cannot proceed with full test');
      
      // Document what we see on login page
      const loginElements = await page.locator('button, input, a').all();
      console.log(`\nFound ${loginElements.length} interactive elements on login page:`);
      
      for (let i = 0; i < Math.min(10, loginElements.length); i++) {
        const text = await loginElements[i].textContent();
        const tagName = await loginElements[i].evaluate(el => el.tagName.toLowerCase());
        const type = await loginElements[i].getAttribute('type');
        if (text?.trim()) {
          console.log(`  - ${tagName}${type ? `[type="${type}"]` : ''}: ${text.trim()}`);
        } else if (type) {
          console.log(`  - ${tagName}[type="${type}"]`);
        }
      }
      
    } else {
      console.log('✅ Direct access to application');
      
      // Navigate to workflows
      console.log('📋 Navigating to workflows page...');
      await page.goto('http://localhost:3000/workflows', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      // Take screenshot of workflows page
      await page.screenshot({ 
        path: '.playwright-mcp/workflows-page.png', 
        fullPage: true 
      });
      console.log('📸 Screenshot saved: workflows-page.png');
      
      // Look for create workflow button
      console.log('🔍 Looking for workflow creation options...');
      const createButtons = await page.locator('button').filter({ hasText: /create|new/i }).all();
      const createLinks = await page.locator('a').filter({ hasText: /create|new/i }).all();
      const allButtons = await page.locator('button').all();
      
      console.log(`Found ${createButtons.length} create buttons, ${createLinks.length} create links, ${allButtons.length} total buttons`);
      
      // List all buttons on the page
      console.log('\nAll buttons found:');
      for (let i = 0; i < Math.min(10, allButtons.length); i++) {
        const text = await allButtons[i].textContent();
        const ariaLabel = await allButtons[i].getAttribute('aria-label');
        const className = await allButtons[i].getAttribute('class');
        
        console.log(`  - Button ${i + 1}: "${text?.trim()}" ${ariaLabel ? `(aria: ${ariaLabel})` : ''} ${className ? `(class: ${className})` : ''}`);
      }
      
      // Try to create a workflow or navigate to existing workflow
      let workflowUrl = null;
      
      if (createButtons.length > 0 || createLinks.length > 0) {
        console.log('➕ Attempting to create new workflow...');
        
        if (createButtons.length > 0) {
          await createButtons[0].click();
        } else if (createLinks.length > 0) {
          await createLinks[0].click();
        }
        
        await page.waitForTimeout(3000);
        workflowUrl = page.url();
        
        await page.screenshot({ 
          path: '.playwright-mcp/workflow-creation.png', 
          fullPage: true 
        });
        console.log('📸 Screenshot saved: workflow-creation.png');
        
      } else {
        // Try to find existing workflows
        console.log('🔍 Looking for existing workflows...');
        const workflowLinks = await page.locator('a[href*="/workflows/"]').all();
        
        if (workflowLinks.length > 0) {
          console.log(`Found ${workflowLinks.length} workflow links`);
          await workflowLinks[0].click();
          await page.waitForTimeout(2000);
          workflowUrl = page.url();
        }
      }
      
      if (workflowUrl && workflowUrl.includes('/workflows/')) {
        console.log(`✅ In workflow builder/editor: ${workflowUrl}`);
        
        // Take screenshot of workflow builder
        await page.screenshot({ 
          path: '.playwright-mcp/workflow-builder.png', 
          fullPage: true 
        });
        console.log('📸 Screenshot saved: workflow-builder.png');
        
        // Look for workflow execution elements
        console.log('🔍 Searching for execution controls...');
        
        // Look for Test button (not Listen)
        const testButtons = await page.locator('button').filter({ hasText: /test|execute/i }).all();
        console.log(`Found ${testButtons.length} test/execute buttons`);
        
        for (let i = 0; i < testButtons.length; i++) {
          const text = await testButtons[i].textContent();
          console.log(`  - Test Button ${i + 1}: "${text?.trim()}"`);
        }
        
        // Look for History button
        const historyButtons = await page.locator('button').filter({ hasText: /history/i }).all();
        console.log(`Found ${historyButtons.length} history buttons`);
        
        for (let i = 0; i < historyButtons.length; i++) {
          const text = await historyButtons[i].textContent();
          const ariaLabel = await historyButtons[i].getAttribute('aria-label');
          console.log(`  - History Button ${i + 1}: "${text?.trim()}" ${ariaLabel ? `(aria: ${ariaLabel})` : ''}`);
        }
        
        // Look for workflow nodes to monitor color changes
        const nodeElements = await page.locator('[data-node-id], .react-flow__node, [class*="node"]').all();
        console.log(`Found ${nodeElements.length} potential workflow nodes`);
        
        if (nodeElements.length > 0) {
          console.log('🎯 Analyzing node elements for state classes...');
          
          for (let i = 0; i < Math.min(5, nodeElements.length); i++) {
            const className = await nodeElements[i].getAttribute('class');
            const nodeId = await nodeElements[i].getAttribute('data-node-id');
            const styles = await nodeElements[i].evaluate(el => {
              const computed = window.getComputedStyle(el);
              return {
                backgroundColor: computed.backgroundColor,
                borderColor: computed.borderColor,
                color: computed.color
              };
            });
            
            console.log(`  - Node ${i + 1}${nodeId ? ` (id: ${nodeId})` : ''}: 
                Classes: ${className}
                Styles: bg=${styles.backgroundColor}, border=${styles.borderColor}, color=${styles.color}`);
          }
        }
        
        // Test execution if Test button exists
        if (testButtons.length > 0) {
          console.log('🎬 Testing workflow execution...');
          
          // Take before execution screenshot
          await page.screenshot({ 
            path: '.playwright-mcp/before-execution.png', 
            fullPage: true 
          });
          console.log('📸 Screenshot saved: before-execution.png');
          
          // Click the first test button
          await testButtons[0].click();
          console.log('🔄 Clicked Test button');
          
          // Monitor for visual changes
          console.log('👀 Monitoring execution state changes...');
          
          // Wait a moment and take screenshot during execution
          await page.waitForTimeout(1000);
          await page.screenshot({ 
            path: '.playwright-mcp/during-execution.png', 
            fullPage: true 
          });
          console.log('📸 Screenshot saved: during-execution.png');
          
          // Continue monitoring for a few more seconds
          for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);
            
            // Check node states
            const nodes = await page.locator('[data-node-id], .react-flow__node, [class*="node"]').all();
            for (const node of nodes) {
              const className = await node.getAttribute('class');
              
              // Check for execution state classes
              if (className?.includes('executing') || className?.includes('running')) {
                console.log('🟡 Node in executing state detected');
              } else if (className?.includes('completed') || className?.includes('success')) {
                console.log('🟢 Node in completed state detected');
              } else if (className?.includes('error') || className?.includes('failed')) {
                console.log('🔴 Node in error state detected');
              } else if (className?.includes('pending')) {
                console.log('⚪ Node in pending state detected');
              }
            }
          }
          
          // Take final screenshot
          await page.screenshot({ 
            path: '.playwright-mcp/after-execution.png', 
            fullPage: true 
          });
          console.log('📸 Screenshot saved: after-execution.png');
          
          // Test History button if it exists
          if (historyButtons.length > 0) {
            console.log('📜 Testing History button...');
            await historyButtons[0].click();
            await page.waitForTimeout(2000);
            
            // Take screenshot of history
            await page.screenshot({ 
              path: '.playwright-mcp/execution-history.png', 
              fullPage: true 
            });
            console.log('📸 Screenshot saved: execution-history.png');
            
            // Look for execution history entries
            const historyEntries = await page.locator('[class*="execution"], [data-execution], .history-item').all();
            console.log(`Found ${historyEntries.length} potential execution history entries`);
          }
        }
        
      } else {
        console.log('⚠️ Could not access workflow builder');
      }
    }
    
    console.log('\n🎉 Test completed successfully!');
    console.log('📁 Screenshots saved in .playwright-mcp/ directory');
    console.log('🖥️ Browser will remain open for manual inspection');
    
    // Keep browser open for manual inspection
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('❌ Error during test:', error);
    await page.screenshot({ 
      path: '.playwright-mcp/error-screenshot.png', 
      fullPage: true 
    });
    console.log('📸 Error screenshot saved: error-screenshot.png');
    
  } finally {
    // Don't close browser automatically - keep it open for inspection
    console.log('Browser remaining open for manual inspection...');
  }
}

// Run the test
testWorkflowExecutionFeedback().catch(console.error);
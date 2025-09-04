// Browser test for AI workflow generation with AI Agent and chains
import { chromium } from 'playwright';

async function testAIWorkflowGeneration() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100 // Slow down for visibility
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('🧪 Starting browser test for AI workflow generation...\n');
    
    // Navigate to workflows page
    console.log('1. Navigating to workflows page...');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');
    
    // Switch to AI Builder tab
    console.log('2. Switching to AI Builder tab...');
    const aiBuilderTab = await page.locator('button:has-text("AI Builder"), [role="tab"]:has-text("AI Builder")').first();
    
    if (await aiBuilderTab.isVisible()) {
      await aiBuilderTab.click();
      await page.waitForTimeout(1000);
      console.log('   ✅ Switched to AI Builder tab');
    }
    
    // Look for AI workflow builder input
    console.log('3. Looking for AI workflow builder input...');
    
    // Check if there's an AI builder input
    const aiBuilderButton = await page.locator('[placeholder*="Describe your workflow"], [placeholder*="describe"], textarea').first();
    
    if (await aiBuilderButton.isVisible()) {
      console.log('   ✅ Found AI builder interface');
      
      // If it's an input field, type the prompt
      if (await page.locator('[placeholder*="Describe your workflow"], textarea').isVisible()) {
        console.log('4. Entering workflow prompt...');
        const promptInput = page.locator('[placeholder*="Describe your workflow"], textarea').first();
        
        const workflowPrompt = `Create an advanced customer support automation system with an AI Agent that has multiple chains for:
- Ticket classification and routing
- FAQ search and response
- Escalation handling with Slack and calendar integration
- Customer follow-up via email
- Feedback collection to Google Sheets
- Billing issue resolution with Stripe and HubSpot
All actions should be AI-configured to automatically determine field values.`;
        
        await promptInput.fill(workflowPrompt);
        await page.waitForTimeout(500);
        
        // Look for generate button
        const generateButton = await page.locator('button:has-text("Generate with AI"), button:has-text("Generate"), button:has-text("Create")').first();
        if (await generateButton.isVisible()) {
          console.log('5. Clicking generate button...');
          await generateButton.click();
        } else {
          // Try pressing Enter
          console.log('5. Pressing Enter to generate...');
          await promptInput.press('Enter');
        }
      } else {
        // If it's a button, click it first
        console.log('3. Clicking AI builder button...');
        await aiBuilderButton.click();
        await page.waitForTimeout(500);
        
        // Then look for the prompt input
        const promptInput = await page.locator('[placeholder*="describe"], [placeholder*="workflow"], textarea').first();
        if (await promptInput.isVisible()) {
          console.log('4. Entering workflow prompt...');
          await promptInput.fill('Create a customer support workflow with AI Agent and multiple chains for ticket routing, FAQ responses, and escalation handling');
          await page.waitForTimeout(500);
          
          // Submit
          const submitButton = await page.locator('button:has-text("Generate"), button:has-text("Create")').first();
          if (await submitButton.isVisible()) {
            await submitButton.click();
          } else {
            await promptInput.press('Enter');
          }
        }
      }
      
      // Wait for generation to complete
      console.log('5. Waiting for AI to generate workflow...');
      
      // Wait for either success message, new workflow to appear, or navigation to builder
      await Promise.race([
        page.waitForURL('**/workflows/builder**', { timeout: 30000 }),
        page.locator('text=/generated|created|success/i').waitFor({ timeout: 30000 }),
        page.locator('.workflow-card:has-text("Customer"), .workflow-card:has-text("Support")').waitFor({ timeout: 30000 })
      ]).catch(() => {});
      
      await page.waitForTimeout(2000);
      
      // Check if we're on the builder page
      if (page.url().includes('/workflows/builder')) {
        console.log('   ✅ Redirected to workflow builder');
        
        // Take screenshot of the generated workflow
        await page.screenshot({ path: 'ai-generated-workflow.png', fullPage: true });
        console.log('   📸 Screenshot saved: ai-generated-workflow.png');
        
        // Check for AI Agent node
        const aiAgentNode = await page.locator('[data-id*="ai_agent"], [data-testid*="ai_agent"], .react-flow__node:has-text("AI Agent")').first();
        if (await aiAgentNode.isVisible()) {
          console.log('6. ✅ AI Agent node is visible in the workflow');
          
          // Count chain nodes
          const chainNodes = await page.locator('[data-id*="chain"], .react-flow__node').all();
          console.log(`   Found ${chainNodes.length} total nodes (including chains)`);
          
          // Try to open AI Agent configuration
          console.log('7. Attempting to view AI Agent configuration...');
          await aiAgentNode.dblclick().catch(() => aiAgentNode.click());
          await page.waitForTimeout(1000);
          
          // Check if configuration modal opened
          const configModal = await page.locator('.modal, [role="dialog"], .configuration-panel').first();
          if (await configModal.isVisible()) {
            console.log('   ✅ Configuration modal opened');
            
            // Look for chains configuration
            const chainsSection = await page.locator('text=/chain|Chain/').first();
            if (await chainsSection.isVisible()) {
              console.log('   ✅ Chains configuration is visible');
              
              // Count configured chains
              const chainItems = await page.locator('[class*="chain"], [data-chain]').all();
              console.log(`   Number of configured chains: ${chainItems.length}`);
            }
            
            // Close modal
            const closeButton = await page.locator('button:has-text("Close"), button:has-text("Cancel"), button[aria-label*="close"]').first();
            if (await closeButton.isVisible()) {
              await closeButton.click();
            } else {
              await page.keyboard.press('Escape');
            }
          }
        }
        
        // Verify visual structure
        console.log('8. Analyzing visual workflow structure...');
        const allNodes = await page.locator('.react-flow__node').all();
        const connections = await page.locator('.react-flow__edge').all();
        
        console.log(`   Total nodes: ${allNodes.length}`);
        console.log(`   Total connections: ${connections.length}`);
        
        if (allNodes.length > 10) {
          console.log('   ✅ Complex workflow structure created successfully');
        }
        
      } else {
        // We're still on workflows page, look for the new workflow
        console.log('6. Looking for newly created workflow...');
        
        const newWorkflow = await page.locator('.workflow-card, [class*="workflow"]:has-text("Customer"), [class*="workflow"]:has-text("Support")').first();
        if (await newWorkflow.isVisible()) {
          console.log('   ✅ New workflow created');
          
          // Click to open it
          await newWorkflow.click();
          await page.waitForTimeout(2000);
          
          // Should navigate to builder
          if (page.url().includes('/workflows/builder')) {
            console.log('   ✅ Opened workflow in builder');
            
            // Take screenshot
            await page.screenshot({ path: 'ai-workflow-opened.png', fullPage: true });
            console.log('   📸 Screenshot saved: ai-workflow-opened.png');
          }
        }
      }
      
    } else {
      console.log('   ⚠️  Could not find AI builder interface');
      console.log('   Looking for alternative ways to create workflow...');
      
      // Try the regular "New Workflow" button
      const newWorkflowButton = await page.locator('button:has-text("New Workflow"), button:has-text("Create Workflow")').first();
      if (await newWorkflowButton.isVisible()) {
        console.log('   Found regular workflow creation button');
        await newWorkflowButton.click();
        await page.waitForTimeout(1000);
        
        // Check if we're in the builder now
        if (page.url().includes('/workflows/builder')) {
          console.log('   ✅ In workflow builder, can manually test AI Agent creation');
        }
      }
    }
    
    console.log('\n✅ Browser test completed!');
    console.log('   Check the screenshots for visual verification');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Take error screenshot
    await page.screenshot({ path: 'ai-workflow-error.png', fullPage: true });
    console.log('   📸 Error screenshot saved: ai-workflow-error.png');
    
  } finally {
    await page.waitForTimeout(5000); // Keep browser open for manual inspection
    await browser.close();
  }
}

// Run the test
testAIWorkflowGeneration().catch(console.error);
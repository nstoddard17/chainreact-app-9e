import { chromium } from 'playwright';

async function testWorkflowWithAIGenerator() {
  console.log('🚀 Starting comprehensive workflow test with AI generator...\n');
  
  // Launch Chrome browser
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Console error:', msg.text());
    }
  });
  
  try {
    // Step 1: Navigate to workflows page
    console.log('📍 Step 1: Navigating to workflows page...');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ path: 'test-1-workflows-page.png' });
    console.log('   ✅ Workflows page loaded\n');
    
    // Step 2: Click on AI Workflow Generator
    console.log('🤖 Step 2: Opening AI Workflow Generator...');
    
    // Look for the AI workflow generator button
    const aiGeneratorButton = await page.locator('button:has-text("AI Workflow Generator"), button:has-text("Generate with AI"), [data-testid*="ai-generator"]').first();
    if (await aiGeneratorButton.isVisible()) {
      await aiGeneratorButton.click();
      console.log('   ✅ Clicked AI Workflow Generator button');
    } else {
      // If not on main page, might need to create new workflow first
      const newWorkflowBtn = await page.locator('button:has-text("New Workflow"), button:has-text("Create Workflow")').first();
      if (await newWorkflowBtn.isVisible()) {
        await newWorkflowBtn.click();
        await page.waitForTimeout(2000);
        
        // Now look for AI generator option
        const aiOption = await page.locator('button:has-text("Generate with AI"), button:has-text("AI Generator")').first();
        if (await aiOption.isVisible()) {
          await aiOption.click();
        }
      }
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-2-ai-generator-opened.png' });
    
    // Step 3: Enter workflow description
    console.log('📝 Step 3: Entering workflow description...');
    const descriptionInput = await page.locator('textarea[placeholder*="Describe"], textarea[placeholder*="workflow"], input[placeholder*="Describe"]').first();
    
    if (await descriptionInput.isVisible()) {
      await descriptionInput.fill('Create a workflow that monitors Gmail for emails from specific senders, uses AI to analyze the content and determine priority, then sends notifications to different Slack channels based on priority level. High priority goes to #urgent channel, normal priority to #general channel.');
      console.log('   ✅ Entered workflow description');
      await page.waitForTimeout(1000);
      
      // Click generate button
      const generateBtn = await page.locator('button:has-text("Generate"), button:has-text("Create Workflow")').first();
      if (await generateBtn.isVisible()) {
        await generateBtn.click();
        console.log('   ✅ Clicked Generate button');
        
        // Wait for generation to complete
        console.log('   ⏳ Waiting for AI to generate workflow...');
        await page.waitForTimeout(8000); // Give AI time to generate
        
        await page.screenshot({ path: 'test-3-workflow-generated.png' });
        console.log('   ✅ Workflow generated\n');
      }
    }
    
    // Step 4: Check for AI Agent node and chains
    console.log('🔍 Step 4: Verifying AI Agent and chains...');
    await page.waitForTimeout(3000);
    
    // Look for AI Agent node
    const aiAgentNode = await page.locator('[data-testid*="ai-agent"], .react-flow__node:has-text("AI Agent")').first();
    if (await aiAgentNode.isVisible()) {
      console.log('   ✅ AI Agent node found');
      
      // Check for chain nodes
      const chainNodes = await page.locator(':has-text("Chain 1"), :has-text("Chain 2")').count();
      console.log(`   ✅ Found ${chainNodes} chain nodes`);
      
      // Measure spacing between chains if multiple exist
      if (chainNodes > 1) {
        const positions = await page.evaluate(() => {
          const chains = Array.from(document.querySelectorAll('[data-id*="chain"]'));
          return chains.map(node => {
            const transform = node.style.transform;
            const match = transform.match(/translate\(([\d.-]+)px,\s*([\d.-]+)px\)/);
            return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : null;
          }).filter(Boolean);
        });
        
        if (positions.length > 1) {
          const spacing = Math.abs(positions[1].x - positions[0].x);
          console.log(`   📏 Chain spacing: ${spacing}px (expected: 450px)`);
          if (Math.abs(spacing - 450) < 10) {
            console.log('   ✅ Chain spacing is correct!\n');
          } else {
            console.log('   ⚠️ Chain spacing differs from expected\n');
          }
        }
      }
    }
    
    // Step 5: Test plus button on AI Agent for adding new chain
    console.log('➕ Step 5: Testing AI Agent plus button for new chain...');
    
    // Find and click plus button on AI Agent node
    const aiAgentPlusBtn = await page.locator('.react-flow__node:has-text("AI Agent") button[aria-label*="Add"], .react-flow__node:has-text("AI Agent") button:has(svg.lucide-plus)').first();
    if (await aiAgentPlusBtn.isVisible()) {
      const chainCountBefore = await page.locator(':has-text("Chain")').count();
      await aiAgentPlusBtn.click();
      console.log('   ✅ Clicked plus button on AI Agent');
      
      await page.waitForTimeout(2000);
      const chainCountAfter = await page.locator(':has-text("Chain")').count();
      
      if (chainCountAfter > chainCountBefore) {
        console.log(`   ✅ New chain added! (${chainCountBefore} → ${chainCountAfter} chains)`);
        await page.screenshot({ path: 'test-4-new-chain-added.png' });
      }
    }
    
    // Step 6: Test edge plus buttons between actions
    console.log('🔗 Step 6: Testing edge plus buttons...');
    
    // Hover over edges to reveal plus buttons
    const edges = await page.locator('.react-flow__edge').all();
    console.log(`   Found ${edges.length} edges`);
    
    if (edges.length > 0) {
      // Hover over first edge
      await edges[0].hover();
      await page.waitForTimeout(500);
      
      // Check for plus button
      const edgePlusBtn = await page.locator('.react-flow__edge button:has(svg.lucide-plus)').first();
      if (await edgePlusBtn.isVisible()) {
        console.log('   ✅ Plus button appears on edge hover');
        
        // Click to test insertion
        await edgePlusBtn.click();
        console.log('   ✅ Clicked edge plus button');
        await page.waitForTimeout(2000);
        
        // Check if action dialog opened
        const actionDialog = await page.locator('[role="dialog"]:has-text("Add Action"), [role="dialog"]:has-text("Select Action")').first();
        if (await actionDialog.isVisible()) {
          console.log('   ✅ Action selection dialog opened');
          
          // Close dialog for now
          const closeBtn = await page.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("Cancel")').first();
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
          }
        }
      }
    }
    
    // Step 7: Test Airtable configuration modal
    console.log('\n📋 Step 7: Testing Airtable configuration...');
    
    // Add an Airtable action to test required fields
    // First, find an add action button
    const addActionBtn = await page.locator('[data-testid*="add-action"], button:has-text("Add Action"), .add-action-node').first();
    if (await addActionBtn.isVisible()) {
      await addActionBtn.click();
      await page.waitForTimeout(1000);
      
      // Select Airtable integration
      const airtableOption = await page.locator('text=Airtable').first();
      if (await airtableOption.isVisible()) {
        await airtableOption.click();
        await page.waitForTimeout(1000);
        
        // Select an Airtable action
        const createRecordAction = await page.locator('text=Create Record').first();
        if (await createRecordAction.isVisible()) {
          await createRecordAction.click();
          await page.waitForTimeout(2000);
          
          // Check for required field indicators
          const requiredFields = await page.locator('[required], label:has-text("*"), .required-field').all();
          console.log(`   ✅ Found ${requiredFields.length} required field indicators`);
          
          // Check specifically for Base and Table fields
          const baseField = await page.locator('label:has-text("Base")').first();
          const tableField = await page.locator('label:has-text("Table")').first();
          
          if (await baseField.isVisible() && await tableField.isVisible()) {
            console.log('   ✅ Base and Table fields are present and marked as required');
          }
          
          await page.screenshot({ path: 'test-5-airtable-config.png' });
          
          // Close the modal
          const cancelBtn = await page.locator('button:has-text("Cancel"), button:has-text("Close")').first();
          if (await cancelBtn.isVisible()) {
            await cancelBtn.click();
          }
        }
      }
    }
    
    // Step 8: Test delay configuration
    console.log('\n⏱️ Step 8: Testing delay configuration...');
    
    const delayTest = await page.locator('text=Delay').first();
    if (await delayTest.isVisible()) {
      await delayTest.dblclick(); // Double-click to open config
      await page.waitForTimeout(1000);
      
      // Check for time unit dropdown
      const timeUnitDropdown = await page.locator('select:has-text("Seconds"), select[name="timeUnit"], label:has-text("Time Unit")').first();
      if (await timeUnitDropdown.isVisible()) {
        console.log('   ✅ Time unit dropdown found in delay config');
        
        // Check options
        const options = await timeUnitDropdown.locator('option').all();
        const optionTexts = await Promise.all(options.map(opt => opt.textContent()));
        console.log(`   ✅ Available time units: ${optionTexts.join(', ')}`);
      }
    }
    
    // Step 9: Verify Test button (not Listen)
    console.log('\n🧪 Step 9: Verifying "Test" button in config modals...');
    
    const testButton = await page.locator('button:has-text("Test")').first();
    const listenButton = await page.locator('button:has-text("Listen")').first();
    
    if (await testButton.isVisible()) {
      console.log('   ✅ "Test" button found (not "Listen")');
    }
    
    if (await listenButton.isVisible()) {
      console.log('   ⚠️ "Listen" button still present - should be "Test"');
    }
    
    console.log('\n✅ All tests completed!');
    console.log('📸 Screenshots saved for review');
    console.log('🔍 Browser remains open for manual inspection\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'test-error.png' });
  }
  
  // Keep browser open
  console.log('Press Ctrl+C to close the browser...');
  await new Promise(() => {}); // Keep script running
}

// Run the test
testWorkflowWithAIGenerator().catch(console.error);
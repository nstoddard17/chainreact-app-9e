import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Starting AI Agent workflow builder test...');
  
  // Launch browser (using chromium for now)
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down for better visibility
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser Console Error:', msg.text());
    } else if (msg.type() === 'warn') {
      console.log('⚠️  Browser Console Warning:', msg.text());
    } else {
      console.log('📝 Browser Console:', msg.text());
    }
  });
  
  try {
    console.log('🔗 Navigating to localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Check if we need to login
    const currentUrl = page.url();
    console.log('📍 Current URL:', currentUrl);
    
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      console.log('🔑 Login page detected, attempting to login...');
      
      // Try to find login form elements
      const emailInput = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
      const passwordInput = await page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]').first();
      const signInButton = await page.locator('button:has-text("Sign In")').first();
      
      if (await emailInput.isVisible()) {
        console.log('📧 Filling in login credentials...');
        await emailInput.fill('admin@chainreact.com');
        await passwordInput.fill('password123');
        console.log('🔐 Clicking Sign In button...');
        await signInButton.click();
        await page.waitForLoadState('networkidle');
        console.log('✅ Login attempted');
        
        // Wait a bit more for auth to complete
        await page.waitForTimeout(3000);
        
        // Check if still on login page
        const newUrl = page.url();
        if (newUrl.includes('/login') || newUrl.includes('/auth')) {
          console.log('⚠️  Still on login page, trying to sign up instead...');
          
          // Look for sign up link
          const signUpLink = await page.locator('a:has-text("Sign up"), button:has-text("Sign up")').first();
          if (await signUpLink.isVisible()) {
            await signUpLink.click();
            await page.waitForTimeout(2000);
            
            // Fill in sign up form
            const signUpEmail = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
            const signUpPassword = await page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]').first();
            const signUpButton = await page.locator('button:has-text("Sign Up"), button[type="submit"]').first();
            
            if (await signUpEmail.isVisible()) {
              console.log('📝 Creating new account...');
              await signUpEmail.fill('testuser@playwright.com');
              await signUpPassword.fill('testpassword123');
              await signUpButton.click();
              await page.waitForLoadState('networkidle');
              await page.waitForTimeout(3000);
            }
          } else {
            console.log('⚠️  Could not find sign up option');
          }
        }
      } else {
        console.log('⚠️  Could not find login form, proceeding anyway...');
      }
    }
    
    // Navigate to workflows page
    console.log('🔄 Navigating to workflows page...');
    
    // Look for workflows navigation link
    const workflowsLink = await page.locator('a[href*="workflow"], nav a:has-text("Workflow"), [data-testid*="workflow"], .nav-item:has-text("Workflow")').first();
    
    if (await workflowsLink.isVisible({ timeout: 5000 })) {
      await workflowsLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation
      await page.goto('http://localhost:3000/workflows');
      await page.waitForLoadState('networkidle');
    }
    
    console.log('📍 Current URL after navigation:', page.url());
    
    // Look for create workflow button or existing workflow
    console.log('🔍 Looking for workflow creation options...');
    
    const createButton = await page.locator('button:has-text("Create"), button:has-text("New Workflow"), [data-testid*="create"]').first();
    const existingWorkflow = await page.locator('.workflow-item, [data-testid*="workflow-item"]').first();
    
    if (await createButton.isVisible({ timeout: 5000 })) {
      console.log('➕ Creating new workflow...');
      await createButton.click();
      await page.waitForLoadState('networkidle');
    } else if (await existingWorkflow.isVisible({ timeout: 5000 })) {
      console.log('📂 Opening existing workflow...');
      await existingWorkflow.click();
      await page.waitForLoadState('networkidle');
    } else {
      console.log('⚠️  No workflow creation options found, trying direct workflow builder URL...');
      await page.goto('http://localhost:3000/workflows/builder');
      await page.waitForLoadState('networkidle');
    }
    
    // Wait for workflow builder to load
    console.log('⏳ Waiting for workflow builder to load...');
    await page.waitForTimeout(2000);
    
    // Look for AI Agent node or add node button
    console.log('🤖 Looking for AI Agent node options...');
    
    // Try to find add node button or AI Agent in sidebar
    const addNodeButton = await page.locator('button:has-text("Add Node"), button:has-text("+"), [data-testid*="add-node"]').first();
    const aiAgentOption = await page.locator('[data-testid*="ai-agent"], .node-option:has-text("AI Agent"), button:has-text("AI Agent")').first();
    
    if (await addNodeButton.isVisible({ timeout: 5000 })) {
      console.log('➕ Found add node button, clicking...');
      await addNodeButton.click();
      await page.waitForTimeout(1000);
      
      // Look for AI Agent in the options
      const aiAgentInList = await page.locator('li:has-text("AI Agent"), .option:has-text("AI Agent"), button:has-text("AI Agent")').first();
      if (await aiAgentInList.isVisible()) {
        await aiAgentInList.click();
        console.log('✅ AI Agent node added');
      }
    } else if (await aiAgentOption.isVisible({ timeout: 5000 })) {
      console.log('🤖 Found AI Agent option directly, clicking...');
      await aiAgentOption.click();
    }
    
    // Wait for AI Agent node to be added to the canvas
    await page.waitForTimeout(1500);
    
    // Click on AI Agent node to configure it
    console.log('⚙️  Looking for AI Agent node to configure...');
    const aiAgentNode = await page.locator('[data-testid*="ai-agent-node"], .react-flow__node:has-text("AI Agent"), .workflow-node:has-text("AI Agent")').first();
    
    if (await aiAgentNode.isVisible({ timeout: 5000 })) {
      console.log('🎯 Found AI Agent node, clicking to configure...');
      await aiAgentNode.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('⚠️  AI Agent node not found, looking for any configurable node...');
      const anyNode = await page.locator('.react-flow__node, .workflow-node').first();
      if (await anyNode.isVisible()) {
        await anyNode.click();
      }
    }
    
    // Look for AI Agent configuration modal
    console.log('🔧 Looking for AI Agent configuration modal...');
    const configModal = await page.locator('[data-testid*="modal"], .modal, [role="dialog"]').first();
    
    if (await configModal.isVisible({ timeout: 5000 })) {
      console.log('✅ Configuration modal opened');
      
      // Look for chains section
      console.log('🔗 Looking for chains section in modal...');
      
      // Wait a bit for the modal content to load
      await page.waitForTimeout(2000);
      
      // Look for Add Action button on a chain
      const addActionButton = await page.locator('button:has-text("Add Action"), [data-testid*="add-action"]').first();
      
      if (await addActionButton.isVisible({ timeout: 5000 })) {
        console.log('➕ Found Add Action button, testing multiple actions...');
        
        // FIRST ACTION: Add Gmail Send Email
        console.log('📧 Adding first action: Gmail Send Email...');
        await addActionButton.click();
        await page.waitForTimeout(1000);
        
        // Look for Gmail option
        const gmailOption = await page.locator('li:has-text("Gmail"), .integration-option:has-text("Gmail"), button:has-text("Gmail")').first();
        if (await gmailOption.isVisible()) {
          await gmailOption.click();
          await page.waitForTimeout(500);
          
          // Look for Send Email action
          const sendEmailAction = await page.locator('li:has-text("Send Email"), .action-option:has-text("Send Email")').first();
          if (await sendEmailAction.isVisible()) {
            await sendEmailAction.click();
            console.log('✅ Selected Gmail Send Email');
            
            // Fill in basic configuration
            const subjectInput = await page.locator('input[name="subject"], input[placeholder*="subject"]').first();
            if (await subjectInput.isVisible()) {
              await subjectInput.fill('Test Email Subject');
            }
            
            // Save the action
            const saveButton = await page.locator('button:has-text("Save"), button:has-text("Add Action")').first();
            if (await saveButton.isVisible()) {
              await saveButton.click();
              await page.waitForTimeout(1000);
              console.log('✅ First action saved');
            }
          }
        }
        
        // Verify first action appears in the chain
        console.log('🔍 Verifying first action appears in chain...');
        const firstActionInChain = await page.locator('.chain-action:has-text("Gmail"), .action-item:has-text("Send Email")').first();
        if (await firstActionInChain.isVisible()) {
          console.log('✅ First action (Gmail Send Email) appears in chain');
        } else {
          console.log('⚠️  First action not visible in chain');
        }
        
        // SECOND ACTION: Add another action to the SAME chain
        console.log('💬 Adding second action to the SAME chain: Slack Send Message...');
        
        // Look for Add Action button again (should be on the same chain)
        const addActionButton2 = await page.locator('button:has-text("Add Action"), [data-testid*="add-action"]').first();
        if (await addActionButton2.isVisible()) {
          await addActionButton2.click();
          await page.waitForTimeout(1000);
          
          // Look for Slack option
          const slackOption = await page.locator('li:has-text("Slack"), .integration-option:has-text("Slack"), button:has-text("Slack")').first();
          if (await slackOption.isVisible()) {
            await slackOption.click();
            await page.waitForTimeout(500);
            
            // Look for Send Message action
            const sendMessageAction = await page.locator('li:has-text("Send Message"), .action-option:has-text("Send Message")').first();
            if (await sendMessageAction.isVisible()) {
              await sendMessageAction.click();
              console.log('✅ Selected Slack Send Message');
              
              // Fill in basic configuration
              const messageInput = await page.locator('textarea[name="text"], textarea[placeholder*="message"]').first();
              if (await messageInput.isVisible()) {
                await messageInput.fill('Test Slack Message');
              }
              
              // Save the action
              const saveButton2 = await page.locator('button:has-text("Save"), button:has-text("Add Action")').first();
              if (await saveButton2.isVisible()) {
                await saveButton2.click();
                await page.waitForTimeout(1000);
                console.log('✅ Second action saved');
              }
            }
          }
        }
        
        // Verify BOTH actions appear in the chain
        console.log('🔍 Verifying BOTH actions appear in the same chain...');
        
        const gmailActionInChain = await page.locator('.chain-action:has-text("Gmail"), .action-item:has-text("Gmail")').first();
        const slackActionInChain = await page.locator('.chain-action:has-text("Slack"), .action-item:has-text("Slack")').first();
        
        const gmailVisible = await gmailActionInChain.isVisible();
        const slackVisible = await slackActionInChain.isVisible();
        
        console.log('📊 FINAL RESULTS:');
        console.log('- Gmail Send Email in chain:', gmailVisible ? '✅ YES' : '❌ NO');
        console.log('- Slack Send Message in chain:', slackVisible ? '✅ YES' : '❌ NO');
        
        if (gmailVisible && slackVisible) {
          console.log('🎉 SUCCESS: Multiple actions can be added to the same chain!');
        } else {
          console.log('❌ ISSUE: Not all actions are visible in the chain');
        }
        
        // Check for any errors
        await page.waitForTimeout(2000);
        
      } else {
        console.log('⚠️  Add Action button not found in modal');
      }
      
    } else {
      console.log('⚠️  Configuration modal not found');
    }
    
    // Take a screenshot for reference
    await page.screenshot({ path: 'ai-agent-test-result.png', fullPage: true });
    console.log('📸 Screenshot saved as ai-agent-test-result.png');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await browser.close();
    console.log('🏁 Test completed');
  }
})();
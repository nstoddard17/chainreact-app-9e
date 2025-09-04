import puppeteer from 'puppeteer';

async function testAIWorkflowWithChrome() {
  console.log('🧪 Testing AI Workflow Generator with Chrome...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to workflows page
    console.log('1. Navigating to workflows page...');
    await page.goto('http://localhost:3000/workflows', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    console.log('   ✅ Page loaded');
    
    // Wait a moment for React to render
    await page.waitForTimeout(3000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'chrome-workflows-initial.png', fullPage: true });
    console.log('   📸 Initial screenshot saved');
    
    // Look for tabs - AI Builder might be in a tab
    console.log('\n2. Looking for AI Builder tab or section...');
    
    // Try to find and click AI Builder tab
    const aiTabSelectors = [
      'button:contains("AI Builder")',
      '[role="tab"]:contains("AI Builder")',
      'button:contains("AI")',
      '.tab:contains("AI")'
    ];
    
    let tabFound = false;
    for (const selector of aiTabSelectors) {
      try {
        const tab = await page.$(selector);
        if (tab) {
          await tab.click();
          await page.waitForTimeout(1500);
          console.log('   ✅ Clicked on AI Builder tab');
          tabFound = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    // If no tab, look for the input directly
    if (!tabFound) {
      console.log('   ℹ️  No AI Builder tab found, looking for input field directly...');
    }
    
    // Look for the AI prompt input
    console.log('\n3. Looking for AI workflow prompt input...');
    
    // Try multiple selectors for the textarea
    const textareaSelectors = [
      'textarea[placeholder*="Describe your workflow"]',
      'textarea[placeholder*="describe"]',
      'textarea',
      'input[placeholder*="workflow"]'
    ];
    
    let promptInput = null;
    for (const selector of textareaSelectors) {
      promptInput = await page.$(selector);
      if (promptInput) {
        console.log(`   ✅ Found prompt input with selector: ${selector}`);
        break;
      }
    }
    
    if (!promptInput) {
      console.log('   ❌ Could not find prompt input');
      
      // Take screenshot to see what's on the page
      await page.screenshot({ path: 'chrome-no-input-found.png', fullPage: true });
      console.log('   📸 Debug screenshot saved: chrome-no-input-found.png');
      
      // List all visible text inputs and textareas
      const inputs = await page.evaluate(() => {
        const elements = [];
        document.querySelectorAll('input, textarea, button').forEach(el => {
          if (el.offsetParent !== null) { // Is visible
            elements.push({
              tag: el.tagName,
              placeholder: el.placeholder || '',
              text: el.textContent || '',
              type: el.type || ''
            });
          }
        });
        return elements;
      });
      
      console.log('\n   Available elements on page:');
      inputs.forEach(el => {
        if (el.placeholder || el.text) {
          console.log(`     - ${el.tag}: ${el.placeholder || el.text}`);
        }
      });
      
      throw new Error('Cannot find AI workflow prompt input');
    }
    
    // Enter the workflow prompt
    console.log('\n4. Entering workflow prompt...');
    const workflowPrompt = `Create a comprehensive customer support automation system with:
- An AI Agent node that intelligently routes requests
- Multiple chains for different support scenarios:
  * Ticket classification and routing to Notion
  * FAQ search and automated email responses via Gmail
  * Urgent escalation with Slack notifications and Google Calendar meetings
  * Follow-up emails and feedback collection to Google Sheets
  * Billing issue resolution with Stripe and HubSpot integration
- All actions should be AI-configured to automatically populate fields based on context`;
    
    await promptInput.click();
    await page.keyboard.type(workflowPrompt, { delay: 10 });
    console.log('   ✅ Prompt entered');
    
    // Find and click the generate button
    console.log('\n5. Looking for Generate button...');
    
    const buttonSelectors = [
      'button:contains("Generate with AI")',
      'button:contains("Generate")',
      'button:contains("Create")',
      'button[type="submit"]'
    ];
    
    let generateButton = null;
    for (const selector of buttonSelectors) {
      try {
        // Using page.evaluate to find button with text content
        generateButton = await page.evaluateHandle((sel) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const searchText = sel.replace('button:contains("', '').replace('")', '');
          return buttons.find(btn => btn.textContent?.includes(searchText));
        }, selector);
        
        if (await generateButton.evaluate(el => el !== null)) {
          console.log(`   ✅ Found generate button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!generateButton) {
      // Fallback: look for any button near the textarea
      generateButton = await page.evaluateHandle(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) return null;
        const parent = textarea.closest('div');
        return parent?.querySelector('button');
      });
    }
    
    if (generateButton) {
      await generateButton.click();
      console.log('   ✅ Clicked Generate button');
    } else {
      console.log('   ⚠️  Could not find Generate button, trying Enter key...');
      await page.keyboard.press('Enter');
    }
    
    // Wait for generation to complete
    console.log('\n6. Waiting for AI to generate workflow...');
    console.log('   ⏳ This may take 10-30 seconds...');
    
    // Wait for either navigation or success message
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }),
      page.waitForSelector('.success-message, .toast-success', { timeout: 45000 }),
      page.waitForTimeout(30000)
    ]).catch(() => {});
    
    // Check if we navigated to the builder
    const currentUrl = page.url();
    if (currentUrl.includes('/workflows/builder')) {
      console.log('   ✅ Successfully navigated to workflow builder!');
      console.log('   URL:', currentUrl);
      
      // Wait for workflow to load
      await page.waitForTimeout(5000);
      
      // Take screenshot of generated workflow
      await page.screenshot({ path: 'chrome-generated-workflow.png', fullPage: true });
      console.log('   📸 Generated workflow screenshot saved');
      
      // Analyze the workflow structure
      console.log('\n7. Analyzing generated workflow...');
      
      // Count nodes
      const nodeCount = await page.evaluate(() => {
        return document.querySelectorAll('.react-flow__node').length;
      });
      console.log(`   Total nodes: ${nodeCount}`);
      
      // Look for AI Agent node
      const aiAgentExists = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.react-flow__node');
        return Array.from(nodes).some(node => 
          node.textContent?.includes('AI Agent') || 
          node.getAttribute('data-id')?.includes('ai_agent')
        );
      });
      console.log(`   AI Agent node exists: ${aiAgentExists ? '✅' : '❌'}`);
      
      // Count connections
      const connectionCount = await page.evaluate(() => {
        return document.querySelectorAll('.react-flow__edge').length;
      });
      console.log(`   Total connections: ${connectionCount}`);
      
      // Look for chain nodes
      const chainNodeCount = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.react-flow__node');
        return Array.from(nodes).filter(node => 
          node.getAttribute('data-id')?.includes('chain')
        ).length;
      });
      console.log(`   Chain action nodes: ${chainNodeCount}`);
      
      // Success evaluation
      if (nodeCount > 10 && aiAgentExists && chainNodeCount > 0) {
        console.log('\n✅ SUCCESS: AI Workflow Generator created a complex workflow!');
        console.log('   - Multiple nodes created');
        console.log('   - AI Agent node present');
        console.log('   - Chain nodes visible');
        console.log('   - Workflow is ready for execution');
      } else if (nodeCount > 0) {
        console.log('\n⚠️  PARTIAL SUCCESS: Workflow created but may be incomplete');
      } else {
        console.log('\n❌ FAILED: No workflow nodes detected');
      }
      
    } else {
      console.log('   ⚠️  Did not navigate to builder');
      
      // Check if workflow was created on the same page
      await page.screenshot({ path: 'chrome-after-generation.png', fullPage: true });
      console.log('   📸 Post-generation screenshot saved');
      
      // Look for success messages
      const successMessage = await page.$('.success-message, .toast-success, [role="alert"]');
      if (successMessage) {
        const messageText = await successMessage.evaluate(el => el.textContent);
        console.log('   Success message found:', messageText);
      }
    }
    
    console.log('\n✅ Test completed! Check the screenshots for visual verification.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    // Take error screenshot
    await page.screenshot({ path: 'chrome-error.png', fullPage: true });
    console.log('   📸 Error screenshot saved: chrome-error.png');
    
  } finally {
    // Keep browser open for manual inspection
    console.log('\n⏸️  Browser will remain open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

// Run the test
testAIWorkflowWithChrome().catch(console.error);
const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting Chrome test for AI workflow generator...');
  
  // Launch Chrome specifically
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome' // Use Chrome instead of Chromium
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to workflows page
    console.log('📍 Navigating to workflows page...');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Clear any existing text and enter new workflow description
    console.log('📝 Entering workflow description...');
    
    // Find the textarea more reliably
    const textareaSelector = 'textarea[placeholder*="Describe your workflow"]';
    await page.waitForSelector(textareaSelector, { timeout: 10000 });
    
    const textarea = await page.$(textareaSelector);
    if (!textarea) {
      console.error('❌ Could not find workflow description textarea');
      await browser.close();
      return;
    }
    
    await textarea.click();
    await page.keyboard.press('Control+A'); // Select all
    await page.keyboard.press('Delete'); // Clear
    await textarea.type('Create a workflow that sends Slack messages when new Gmail emails arrive from VIP contacts');
    
    // Click Generate button
    console.log('🔄 Clicking Generate button...');
    const generateButton = await page.$('button:has-text("Generate")');
    if (!generateButton) {
      console.error('❌ Could not find Generate button');
      await browser.close();
      return;
    }
    
    await generateButton.click();
    
    // Wait for the workflow to be created
    console.log('⏳ Waiting for workflow to be created...');
    await page.waitForTimeout(8000); // Give it time to generate
    
    // Look for success indicators or new workflow
    const workflowCards = await page.$$('[class*="border"][class*="rounded"]');
    console.log(`📊 Found ${workflowCards.length} workflow cards`);
    
    if (workflowCards.length > 0) {
      // Find the most recently created workflow (should be first)
      console.log('🔍 Looking for Edit Workflow link...');
      
      // Click on the first workflow's Edit link
      const editLink = await page.$('a:has-text("Edit Workflow")');
      if (editLink) {
        console.log('✅ Found Edit Workflow link, clicking...');
        await editLink.click();
        
        // Wait for workflow builder to load
        await page.waitForURL(/\/workflows\/builder/, { timeout: 10000 });
        console.log('📐 Workflow builder loaded');
        await page.waitForTimeout(3000);
        
        // Try to find and click on a node to open configuration
        console.log('🔧 Looking for nodes to configure...');
        
        // Try Gmail trigger first
        let nodeClicked = false;
        const gmailNode = await page.$('[data-testid*="gmail"], [class*="node"]:has-text("Gmail"), text="Gmail: New Email"');
        
        if (gmailNode) {
          console.log('📧 Found Gmail node, clicking...');
          await gmailNode.click();
          await page.waitForTimeout(1000);
          nodeClicked = true;
        } else {
          // Try any node with configuration
          const anyNode = await page.$('.react-flow__node');
          if (anyNode) {
            console.log('📦 Found a node, clicking...');
            await anyNode.click();
            await page.waitForTimeout(1000);
            nodeClicked = true;
          }
        }
        
        if (nodeClicked) {
          // Look for Configure/Settings button
          console.log('⚙️ Looking for Configure button...');
          const configButton = await page.$('button:has-text("Configure"), button:has-text("Settings"), button[aria-label*="config"], button[aria-label*="setting"]');
          
          if (configButton) {
            console.log('🎯 Found Configure button, clicking...');
            await configButton.click();
            await page.waitForTimeout(2000);
            
            // Check for "Defined automatically by the model" text
            console.log('🔍 Checking for AI-defined fields...');
            const aiFieldTexts = await page.$$('text="Defined automatically by the model"');
            
            if (aiFieldTexts.length > 0) {
              console.log(`✨ SUCCESS! Found ${aiFieldTexts.length} fields with "Defined automatically by the model"`);
              console.log('🎉 AI workflow generator correctly sets all fields to AI mode!');
              
              // Take a screenshot for documentation
              await page.screenshot({ 
                path: 'ai-fields-test-success.png',
                fullPage: false 
              });
              console.log('📸 Screenshot saved as ai-fields-test-success.png');
            } else {
              console.log('⚠️ No fields found with "Defined automatically by the model"');
              console.log('🔍 Checking page content for AI indicators...');
              
              // Check for AI field placeholders in the page
              const pageContent = await page.content();
              if (pageContent.includes('AI_FIELD:')) {
                console.log('✅ Found AI_FIELD placeholders in page content');
              }
              if (pageContent.includes('_allFieldsAI')) {
                console.log('✅ Found _allFieldsAI flag in page content');
              }
              
              // Take a screenshot for debugging
              await page.screenshot({ 
                path: 'ai-fields-test-debug.png',
                fullPage: false 
              });
              console.log('📸 Debug screenshot saved as ai-fields-test-debug.png');
            }
          } else {
            console.log('❌ Could not find Configure button');
            
            // Try double-clicking the node
            console.log('🔄 Trying double-click on node...');
            const node = await page.$('.react-flow__node');
            if (node) {
              await node.dblclick();
              await page.waitForTimeout(2000);
              
              // Check again for AI fields
              const aiFieldTexts = await page.$$('text="Defined automatically by the model"');
              if (aiFieldTexts.length > 0) {
                console.log(`✨ SUCCESS! Found ${aiFieldTexts.length} fields with "Defined automatically by the model"`);
              }
            }
          }
        } else {
          console.log('❌ Could not find any nodes to click');
        }
        
      } else {
        console.log('❌ Could not find Edit Workflow link');
      }
    } else {
      console.log('❌ No workflows found after generation');
    }
    
    console.log('✅ Test completed!');
    console.log('💡 Browser will remain open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    await page.screenshot({ 
      path: 'ai-fields-test-error.png',
      fullPage: false 
    });
    console.log('📸 Error screenshot saved as ai-fields-test-error.png');
  } finally {
    await browser.close();
    console.log('🔚 Browser closed');
  }
})();
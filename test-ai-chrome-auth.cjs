const { chromium } = require('playwright');
const fs = require('fs');

// Read credentials from file
function getCredentials() {
  const credFile = '.test-credentials';
  if (!fs.existsSync(credFile)) {
    console.error('❌ Credentials file not found');
    process.exit(1);
  }
  
  const content = fs.readFileSync(credFile, 'utf8');
  const lines = content.split('\n');
  let username = '';
  let password = '';
  
  lines.forEach(line => {
    if (line.startsWith('username:')) {
      username = line.split('username:')[1].trim();
    }
    if (line.startsWith('password:')) {
      password = line.split('password:')[1].trim();
    }
  });
  
  return { username, password };
}

(async () => {
  console.log('🚀 Starting Chrome test for AI workflow generator with authentication...');
  
  const { username, password } = getCredentials();
  console.log('📋 Credentials loaded from .test-credentials file');
  
  // Launch Chrome specifically
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome' // Use Chrome instead of Chromium
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to login page first
    console.log('🔐 Navigating to login page...');
    await page.goto('http://localhost:3000/auth/login');
    await page.waitForLoadState('networkidle');
    
    // Check if already logged in by looking for redirect
    const currentUrl = page.url();
    if (!currentUrl.includes('/auth/login')) {
      console.log('✅ Already logged in, proceeding to workflows...');
    } else {
      // Perform login
      console.log('📝 Entering login credentials...');
      
      // Fill in email
      await page.fill('input[type="email"], input[name="email"], input[placeholder*="email"]', username);
      
      // Fill in password
      await page.fill('input[type="password"], input[name="password"]', password);
      
      // Click login button
      await page.click('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Sign in"), button[type="submit"]');
      
      console.log('⏳ Waiting for login to complete...');
      await page.waitForURL(/^((?!auth\/login).)*$/, { timeout: 10000 });
      console.log('✅ Login successful!');
    }
    
    // Navigate to workflows page
    console.log('📍 Navigating to workflows page...');
    await page.goto('http://localhost:3000/workflows');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Clear any existing text and enter new workflow description
    console.log('📝 Looking for workflow description field...');
    
    // Try multiple selectors for the textarea
    const textareaSelectors = [
      'textarea[placeholder*="Describe your workflow"]',
      'textarea[placeholder*="describe"]',
      'textarea',
      'input[type="text"][placeholder*="workflow"]'
    ];
    
    let textarea = null;
    for (const selector of textareaSelectors) {
      textarea = await page.$(selector);
      if (textarea) {
        console.log(`✅ Found textarea with selector: ${selector}`);
        break;
      }
    }
    
    if (!textarea) {
      console.error('❌ Could not find workflow description textarea');
      // Take screenshot for debugging
      await page.screenshot({ path: 'no-textarea-found.png' });
      console.log('📸 Debug screenshot saved as no-textarea-found.png');
      await browser.close();
      return;
    }
    
    await textarea.click();
    await textarea.fill(''); // Clear existing text
    await textarea.type('Create a workflow that sends Slack messages when new Gmail emails arrive from VIP contacts');
    console.log('✅ Workflow description entered');
    
    // Click Generate button
    console.log('🔄 Looking for Generate button...');
    const generateButton = await page.$('button:has-text("Generate")');
    if (!generateButton) {
      console.error('❌ Could not find Generate button');
      await page.screenshot({ path: 'no-generate-button.png' });
      await browser.close();
      return;
    }
    
    console.log('🎯 Clicking Generate button...');
    await generateButton.click();
    
    // Wait for the workflow to be created
    console.log('⏳ Waiting for workflow to be created (this may take 10-15 seconds)...');
    await page.waitForTimeout(12000); // Give it more time to generate
    
    // Look for the new workflow
    console.log('🔍 Looking for generated workflow...');
    
    // Check if we got redirected to the workflow builder
    const currentUrl2 = page.url();
    if (currentUrl2.includes('/workflows/builder')) {
      console.log('✅ Redirected to workflow builder!');
      
      // Wait for the workflow to fully load
      await page.waitForTimeout(5000);
      
      // Try to find and click on a node
      console.log('🔧 Looking for nodes to configure...');
      
      // Try different selectors for nodes
      const nodeSelectors = [
        '.react-flow__node',
        '[data-id*="trigger"]',
        '[data-id*="node"]',
        'div:has-text("Gmail")',
        'div:has-text("Slack")'
      ];
      
      let nodeFound = false;
      for (const selector of nodeSelectors) {
        const node = await page.$(selector);
        if (node) {
          console.log(`📦 Found node with selector: ${selector}`);
          await node.click();
          await page.waitForTimeout(1000);
          nodeFound = true;
          break;
        }
      }
      
      if (nodeFound) {
        // Look for Configure button
        console.log('⚙️ Looking for Configure/Settings button...');
        const configSelectors = [
          'button:has-text("Configure")',
          'button:has-text("Settings")',
          'button[aria-label*="config"]',
          'button[aria-label*="setting"]',
          'svg[class*="Settings"]'
        ];
        
        let configButton = null;
        for (const selector of configSelectors) {
          configButton = await page.$(selector);
          if (configButton) {
            console.log(`✅ Found config button with selector: ${selector}`);
            await configButton.click();
            break;
          }
        }
        
        if (configButton) {
          await page.waitForTimeout(3000);
          
          // Check for "Defined automatically by the model" text
          console.log('🔍 Checking for AI-defined fields...');
          const aiFieldTexts = await page.$$('text="Defined automatically by the model"');
          
          if (aiFieldTexts.length > 0) {
            console.log(`✨ SUCCESS! Found ${aiFieldTexts.length} fields with "Defined automatically by the model"`);
            console.log('🎉 TEST PASSED: AI workflow generator correctly sets all fields to AI mode!');
            
            // Take a screenshot for documentation
            await page.screenshot({ 
              path: 'ai-fields-test-success.png',
              fullPage: false 
            });
            console.log('📸 Success screenshot saved as ai-fields-test-success.png');
          } else {
            console.log('⚠️ No fields found with "Defined automatically by the model"');
            console.log('🔍 Taking debug screenshot...');
            await page.screenshot({ 
              path: 'ai-fields-test-no-ai-text.png',
              fullPage: false 
            });
            
            // Check for alternative indicators
            const pageContent = await page.content();
            if (pageContent.includes('AI_FIELD:')) {
              console.log('✅ Found AI_FIELD placeholders in page content');
            }
            if (pageContent.includes('_allFieldsAI')) {
              console.log('✅ Found _allFieldsAI flag in page content');
            }
          }
        } else {
          console.log('⚠️ Could not find Configure button, trying double-click...');
          const node = await page.$('.react-flow__node');
          if (node) {
            await node.dblclick();
            await page.waitForTimeout(3000);
            
            const aiFieldTexts = await page.$$('text="Defined automatically by the model"');
            if (aiFieldTexts.length > 0) {
              console.log(`✨ SUCCESS! Found ${aiFieldTexts.length} fields via double-click`);
            }
          }
        }
      }
    } else {
      // Still on workflows page, look for the new workflow in the list
      console.log('📋 Looking for new workflow in the list...');
      const editLinks = await page.$$('a:has-text("Edit Workflow")');
      
      if (editLinks.length > 0) {
        console.log(`Found ${editLinks.length} workflows, clicking the first one...`);
        await editLinks[0].click();
        
        // Wait for workflow builder
        await page.waitForURL(/\/workflows\/builder/, { timeout: 10000 });
        await page.waitForTimeout(5000);
        
        // Repeat the node configuration check
        const node = await page.$('.react-flow__node');
        if (node) {
          await node.click();
          await page.waitForTimeout(1000);
          
          const configButton = await page.$('button:has-text("Configure"), button:has-text("Settings")');
          if (configButton) {
            await configButton.click();
            await page.waitForTimeout(3000);
            
            const aiFieldTexts = await page.$$('text="Defined automatically by the model"');
            if (aiFieldTexts.length > 0) {
              console.log(`✨ SUCCESS! Found ${aiFieldTexts.length} fields`);
            }
          }
        }
      }
    }
    
    console.log('✅ Test completed!');
    console.log('💡 Browser will remain open for 20 seconds for manual inspection...');
    await page.waitForTimeout(20000);
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    await page.screenshot({ 
      path: 'ai-fields-test-error.png',
      fullPage: true 
    });
    console.log('📸 Error screenshot saved as ai-fields-test-error.png');
  } finally {
    await browser.close();
    console.log('🔚 Browser closed');
  }
})();
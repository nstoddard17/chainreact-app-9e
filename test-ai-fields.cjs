const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🚀 Starting AI workflow generator test...');
  
  // Navigate to workflows page
  await page.goto('http://localhost:3000/workflows');
  await page.waitForLoadState('networkidle');
  
  console.log('📝 Entering workflow description...');
  
  // Clear any existing text and enter new workflow description
  const textbox = page.locator('textarea[placeholder*="Describe your workflow"]');
  await textbox.click();
  await textbox.fill('');
  await textbox.fill('Send Discord messages when Gmail emails arrive from important contacts');
  
  // Click Generate button
  console.log('🔄 Generating workflow...');
  await page.locator('button:has-text("Generate")').click();
  
  // Wait for workflow to be created
  await page.waitForTimeout(5000);
  
  // Look for the new workflow in the list
  console.log('🔍 Looking for the generated workflow...');
  
  // Find the most recent workflow (should be at the top)
  const workflowCard = page.locator('[class*="border"][class*="rounded"]').first();
  
  // Click Edit Workflow link
  const editLink = workflowCard.locator('a:has-text("Edit Workflow")');
  await editLink.click();
  
  // Wait for workflow builder to load
  await page.waitForURL(/\/workflows\/builder/);
  await page.waitForTimeout(3000);
  
  console.log('🔧 Opening configuration modal...');
  
  // Click on a trigger or action node to open configuration
  // Try to find and click on the Gmail trigger node
  const gmailNode = page.locator('text="Gmail: New Email"').first();
  if (await gmailNode.isVisible()) {
    await gmailNode.click();
    await page.waitForTimeout(1000);
    
    // Look for the settings/configure button
    const configButton = page.locator('button:has-text("Configure"), button:has-text("Settings")').first();
    if (await configButton.isVisible()) {
      await configButton.click();
      await page.waitForTimeout(2000);
      
      console.log('✅ Configuration modal opened!');
      
      // Check for AI-defined fields
      const aiFields = await page.locator('text="Defined automatically by the model"').all();
      console.log(`📊 Found ${aiFields.length} fields set to "Defined automatically by the model"`);
      
      if (aiFields.length > 0) {
        console.log('✨ SUCCESS: Fields are set to AI mode by default!');
      } else {
        console.log('⚠️  WARNING: No AI-defined fields found. Checking for other indicators...');
        
        // Check if _allFieldsAI is in the config
        const pageContent = await page.content();
        if (pageContent.includes('_allFieldsAI')) {
          console.log('✅ Found _allFieldsAI in configuration');
        }
      }
    }
  }
  
  // Try clicking on an action node as well
  const discordNode = page.locator('text="Discord: Send Message"').first();
  if (await discordNode.isVisible()) {
    await discordNode.click();
    await page.waitForTimeout(1000);
    
    const configButton = page.locator('button:has-text("Configure"), button:has-text("Settings")').first();
    if (await configButton.isVisible()) {
      await configButton.click();
      await page.waitForTimeout(2000);
      
      const aiFields = await page.locator('text="Defined automatically by the model"').all();
      console.log(`📊 Discord node: Found ${aiFields.length} AI-defined fields`);
    }
  }
  
  console.log('🎉 Test completed!');
  console.log('Keep browser open to inspect the results...');
  
  // Keep browser open for inspection
  await page.waitForTimeout(300000); // 5 minutes
  
  await browser.close();
})();
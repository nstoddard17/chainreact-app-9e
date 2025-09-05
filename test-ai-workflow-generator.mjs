import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '.playwright-test-ai-workflow';

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function testAIWorkflowGenerator() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000  // Slow down for visibility
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Enable console logging to catch any errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser Console Error:', msg.text());
      }
    });
    
    console.log('1. Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
    
    // Take screenshot of landing page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-1-landing-page.png'),
      fullPage: true 
    });
    
    console.log('2. Checking if login is required...');
    
    // Look for login elements or workflows section
    const isLoggedIn = await page.locator('text=Workflows').isVisible().catch(() => false);
    
    if (!isLoggedIn) {
      console.log('Login required - looking for login options...');
      
      // Look for login button or form
      const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), a:has-text("Sign In"), a:has-text("Login")').first();
      if (await loginButton.isVisible()) {
        await loginButton.click();
        await page.waitForTimeout(2000);
        
        // Take screenshot of login page
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, 'step-2-login-page.png'),
          fullPage: true 
        });
        
        // Try to find test credentials or create account option
        // This might vary based on your auth setup
        console.log('Please handle login manually or provide test credentials');
        await page.waitForTimeout(10000); // Wait for manual login
      }
    }
    
    console.log('3. Navigating to Workflows section...');
    
    // Wait for and click on Workflows
    await page.waitForSelector('text=Workflows', { timeout: 10000 });
    await page.click('text=Workflows');
    await page.waitForTimeout(2000);
    
    // Take screenshot of workflows page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-3-workflows-page.png'),
      fullPage: true 
    });
    
    console.log('4. Creating new workflow with AI generator...');
    
    // Look for "New Workflow" or similar button
    const newWorkflowButton = page.locator('button:has-text("New Workflow"), button:has-text("Create Workflow"), button:has-text("Add Workflow")').first();
    await newWorkflowButton.click();
    await page.waitForTimeout(2000);
    
    // Look for AI generator option
    const aiGeneratorOption = page.locator('text=AI Generator, text=Generate with AI, button:has-text("AI")').first();
    if (await aiGeneratorOption.isVisible()) {
      await aiGeneratorOption.click();
      await page.waitForTimeout(2000);
    }
    
    // Take screenshot of AI generator modal
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-4-ai-generator-opened.png'),
      fullPage: true 
    });
    
    console.log('5. Entering customer support workflow prompt...');
    
    const prompt = `Create a customer support workflow that receives a webhook with customer complaint data, uses an AI agent to analyze the sentiment and categorize the issue, then based on the category, either sends an email to support for urgent issues or creates a task in a project management system for non-urgent issues. Add a second AI agent that drafts a response to the customer.`;
    
    // Find the prompt input field
    const promptInput = page.locator('textarea, input[type="text"]').first();
    await promptInput.fill(prompt);
    
    // Take screenshot of prompt entered
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-5-prompt-entered.png'),
      fullPage: true 
    });
    
    // Submit the prompt
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create"), button:has-text("Submit")').first();
    await generateButton.click();
    
    console.log('6. Waiting for workflow generation...');
    await page.waitForTimeout(10000); // Wait for AI generation
    
    // Take screenshot of generated workflow
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-6-workflow-generated.png'),
      fullPage: true 
    });
    
    console.log('7. Verifying workflow structure...');
    
    // Check for key components
    const hasWebhook = await page.locator('text=Webhook, text=webhook').isVisible().catch(() => false);
    const hasAIAgent = await page.locator('text=AI Agent, text=ai agent').isVisible().catch(() => false);
    const hasEmail = await page.locator('text=Email, text=email').isVisible().catch(() => false);
    
    console.log('Workflow structure verification:');
    console.log(`- Has Webhook trigger: ${hasWebhook}`);
    console.log(`- Has AI Agent: ${hasAIAgent}`);
    console.log(`- Has Email action: ${hasEmail}`);
    
    console.log('8. Saving the workflow...');
    
    // Look for save button
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Save Workflow")').first();
    if (await saveButton.isVisible()) {
      await saveButton.click();
      await page.waitForTimeout(3000);
    }
    
    // Take screenshot of saved workflow
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-8-workflow-saved.png'),
      fullPage: true 
    });
    
    console.log('9. Testing workflow execution...');
    
    // Look for test button
    const testButton = page.locator('button:has-text("Test"), button:has-text("Run"), button:has-text("Execute")').first();
    if (await testButton.isVisible()) {
      await testButton.click();
      await page.waitForTimeout(5000); // Wait for execution
      
      // Take screenshot during/after execution
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'step-9-workflow-execution.png'),
        fullPage: true 
      });
    }
    
    console.log('10. Opening execution history...');
    
    // Look for history button (clock icon or "History" text)
    const historyButton = page.locator('button:has-text("History"), [data-testid*="history"], .history-button, button[title*="history"]').first();
    if (await historyButton.isVisible()) {
      await historyButton.click();
      await page.waitForTimeout(3000);
      
      // Take screenshot of execution history modal
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'step-10-execution-history.png'),
        fullPage: true 
      });
      
      console.log('11. Examining execution logs...');
      
      // Look for log details
      const logEntries = await page.locator('.log-entry, .execution-log, .history-item').count().catch(() => 0);
      console.log(`Found ${logEntries} log entries`);
      
      // Try to expand details if available
      const expandButtons = page.locator('button:has-text("Details"), button:has-text("Expand"), .expand-button');
      const expandCount = await expandButtons.count().catch(() => 0);
      
      if (expandCount > 0) {
        await expandButtons.first().click();
        await page.waitForTimeout(2000);
        
        // Take screenshot of expanded details
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, 'step-11-execution-details.png'),
          fullPage: true 
        });
      }
    }
    
    console.log('12. Final screenshot and summary...');
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'step-12-final-state.png'),
      fullPage: true 
    });
    
    console.log('\\nTest completed! Screenshots saved to:', SCREENSHOTS_DIR);
    console.log('\\nPlease check the screenshots to verify:');
    console.log('- Workflow generation worked correctly');
    console.log('- All required nodes are present (webhook, AI agents, actions)');
    console.log('- Execution history shows detailed logs');
    console.log('- No console errors occurred');
    
  } catch (error) {
    console.error('Test failed:', error);
    
    // Take error screenshot
    try {
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'error-screenshot.png'),
        fullPage: true 
      });
    } catch (screenshotError) {
      console.error('Could not take error screenshot:', screenshotError);
    }
  } finally {
    await browser.close();
  }
}

// Run the test
testAIWorkflowGenerator().catch(console.error);
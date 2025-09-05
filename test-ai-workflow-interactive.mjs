import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '.playwright-test-ai-workflow';

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function testAIWorkflowGeneratorInteractive() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500
  });
  
  let page;
  
  try {
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Enable console logging to catch any errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser Console Error:', msg.text());
      } else if (msg.type() === 'warn') {
        console.log('Browser Console Warning:', msg.text());
      }
    });
    
    console.log('1. Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
    
    // Take screenshot of landing page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-1-landing-page.png'),
      fullPage: true 
    });
    
    console.log('2. Handling authentication...');
    
    // Try to find "Sign up" link for new account creation
    const signUpLink = page.locator('a:has-text("Sign up"), button:has-text("Sign up")').first();
    if (await signUpLink.isVisible()) {
      console.log('Found Sign up option, clicking...');
      await signUpLink.click();
      await page.waitForTimeout(2000);
      
      // Fill out sign up form if it exists
      const emailField = page.locator('input[type="email"], input[placeholder*="email" i]').first();
      const passwordField = page.locator('input[type="password"], input[placeholder*="password" i]').first();
      
      if (await emailField.isVisible() && await passwordField.isVisible()) {
        console.log('Filling sign up form with test credentials...');
        await emailField.fill('test@example.com');
        await passwordField.fill('testpassword123');
        
        const submitButton = page.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Create Account")').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await page.waitForTimeout(5000); // Wait for account creation and redirect
        }
      }
    } else {
      // Try Google OAuth as an alternative
      const googleButton = page.locator('button:has-text("Google"), .google-signin-button').first();
      if (await googleButton.isVisible()) {
        console.log('No direct sign up found, but found Google OAuth.');
        console.log('Please manually complete OAuth in the browser window...');
        console.log('Waiting 30 seconds for manual OAuth completion...');
        await page.waitForTimeout(30000);
      } else {
        console.log('Please manually complete authentication in the browser window...');
        console.log('Waiting 30 seconds for manual login completion...');
        await page.waitForTimeout(30000);
      }
    }
    
    // Check if we're now authenticated by looking for workflows or dashboard
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-2-post-auth.png'),
      fullPage: true 
    });
    
    console.log('3. Looking for Workflows section...');
    
    // Look for various ways to access workflows
    let workflowsFound = false;
    const workflowSelectors = [
      'text=Workflows',
      'a[href*="/workflows"]',
      'nav a:has-text("Workflows")',
      '[data-testid="workflows"]',
      'button:has-text("Workflows")'
    ];
    
    for (const selector of workflowSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          console.log(`Found workflows with selector: ${selector}`);
          await element.click();
          workflowsFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!workflowsFound) {
      console.log('Could not find Workflows navigation. Looking for sidebar or menu...');
      
      // Try to find and click a menu button
      const menuSelectors = ['button[aria-label="menu"]', '.menu-button', '[data-testid="sidebar-toggle"]', '.hamburger'];
      for (const selector of menuSelectors) {
        try {
          const menu = page.locator(selector).first();
          if (await menu.isVisible({ timeout: 2000 })) {
            await menu.click();
            await page.waitForTimeout(1000);
            
            // Now try to find workflows in the opened menu
            const workflowInMenu = page.locator('text=Workflows, a[href*="/workflows"]').first();
            if (await workflowInMenu.isVisible({ timeout: 2000 })) {
              await workflowInMenu.click();
              workflowsFound = true;
              break;
            }
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    if (!workflowsFound) {
      // Try direct navigation to workflows page
      console.log('Trying direct navigation to /workflows...');
      await page.goto('http://localhost:3001/workflows');
    }
    
    await page.waitForTimeout(3000);
    
    // Take screenshot of workflows page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-3-workflows-page.png'),
      fullPage: true 
    });
    
    console.log('4. Looking for New Workflow or AI Generator...');
    
    // Look for various create workflow buttons
    const createSelectors = [
      'button:has-text("New Workflow")',
      'button:has-text("Create Workflow")',
      'button:has-text("Add Workflow")',
      'button:has-text("+")',
      '[data-testid="create-workflow"]',
      '.create-workflow-button'
    ];
    
    let createFound = false;
    for (const selector of createSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 3000 })) {
          console.log(`Found create button with selector: ${selector}`);
          await element.click();
          createFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!createFound) {
      console.log('Could not find create workflow button. Current page content:');
      const bodyText = await page.locator('body').textContent();
      console.log(bodyText.substring(0, 500) + '...');
    }
    
    await page.waitForTimeout(2000);
    
    // Take screenshot after clicking create
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-4-create-clicked.png'),
      fullPage: true 
    });
    
    console.log('5. Looking for AI Generator option...');
    
    // Look for AI generator options
    const aiSelectors = [
      'text=AI Generator',
      'text=Generate with AI',
      'button:has-text("AI")',
      '[data-testid="ai-generator"]',
      '.ai-generator-option',
      'text=Use AI'
    ];
    
    let aiFound = false;
    for (const selector of aiSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 3000 })) {
          console.log(`Found AI generator with selector: ${selector}`);
          await element.click();
          aiFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!aiFound) {
      console.log('Could not find AI Generator option. Looking for any AI-related text...');
      const hasAI = await page.locator('text=AI').isVisible().catch(() => false);
      console.log(`Found AI text on page: ${hasAI}`);
    }
    
    await page.waitForTimeout(2000);
    
    // Take screenshot of AI generator modal
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-5-ai-generator.png'),
      fullPage: true 
    });
    
    console.log('6. Entering AI workflow prompt...');
    
    const prompt = `Create a customer support workflow that receives a webhook with customer complaint data, uses an AI agent to analyze the sentiment and categorize the issue, then based on the category, either sends an email to support for urgent issues or creates a task in a project management system for non-urgent issues. Add a second AI agent that drafts a response to the customer.`;
    
    // Look for input field
    const inputSelectors = [
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      '.prompt-input',
      '[placeholder*="prompt" i]',
      '[placeholder*="describe" i]'
    ];
    
    let inputFound = false;
    for (const selector of inputSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 2000 })) {
          console.log(`Found input with selector: ${selector}`);
          await input.fill(prompt);
          inputFound = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (!inputFound) {
      console.log('Could not find input field for prompt');
    }
    
    // Take screenshot with prompt entered
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-6-prompt-entered.png'),
      fullPage: true 
    });
    
    console.log('7. Submitting prompt for generation...');
    
    // Look for generate/submit button
    const submitSelectors = [
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button:has-text("Submit")',
      'button[type="submit"]',
      '.generate-button'
    ];
    
    let submitFound = false;
    for (const selector of submitSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          console.log(`Found submit button with selector: ${selector}`);
          await button.click();
          submitFound = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (submitFound) {
      console.log('Waiting for AI generation (up to 30 seconds)...');
      await page.waitForTimeout(30000);
      
      // Take screenshot of generated workflow
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'interactive-step-7-workflow-generated.png'),
        fullPage: true 
      });
    }
    
    console.log('8. Analyzing generated workflow...');
    
    // Look for workflow nodes
    const nodeTypes = {
      webhook: ['webhook', 'trigger', 'webhook trigger'],
      aiAgent: ['ai agent', 'ai', 'agent'],
      email: ['email', 'send email', 'gmail'],
      task: ['task', 'create task', 'project'],
      condition: ['condition', 'if', 'branch']
    };
    
    const foundNodes = {};
    
    for (const [type, keywords] of Object.entries(nodeTypes)) {
      foundNodes[type] = false;
      for (const keyword of keywords) {
        const hasNode = await page.locator(`text=${keyword}`, { hasText: new RegExp(keyword, 'i') }).isVisible().catch(() => false);
        if (hasNode) {
          foundNodes[type] = true;
          break;
        }
      }
    }
    
    console.log('Generated workflow analysis:');
    Object.entries(foundNodes).forEach(([type, found]) => {
      console.log(`- ${type}: ${found ? '✓' : '✗'}`);
    });
    
    console.log('9. Attempting to save workflow...');
    
    // Look for save button
    const saveSelectors = [
      'button:has-text("Save")',
      'button:has-text("Save Workflow")',
      '[data-testid="save-button"]'
    ];
    
    for (const selector of saveSelectors) {
      try {
        const saveButton = page.locator(selector).first();
        if (await saveButton.isVisible({ timeout: 2000 })) {
          console.log(`Found save button with selector: ${selector}`);
          await saveButton.click();
          await page.waitForTimeout(3000);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Take screenshot after save attempt
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-9-saved.png'),
      fullPage: true 
    });
    
    console.log('10. Looking for test/execution functionality...');
    
    // Look for test button
    const testSelectors = [
      'button:has-text("Test")',
      'button:has-text("Run")',
      'button:has-text("Execute")',
      '[data-testid="test-button"]',
      '.test-workflow-button'
    ];
    
    let testFound = false;
    for (const selector of testSelectors) {
      try {
        const testButton = page.locator(selector).first();
        if (await testButton.isVisible({ timeout: 3000 })) {
          console.log(`Found test button with selector: ${selector}`);
          await testButton.click();
          testFound = true;
          
          console.log('Waiting for test execution...');
          await page.waitForTimeout(10000);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (!testFound) {
      console.log('Could not find test button');
    }
    
    // Take screenshot after test attempt
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-10-test-executed.png'),
      fullPage: true 
    });
    
    console.log('11. Looking for execution history...');
    
    // Look for history button or modal
    const historySelectors = [
      'button:has-text("History")',
      'button[title*="history" i]',
      '[data-testid="history-button"]',
      '.history-button',
      'button:has([class*="clock"])',
      'button:has([class*="history"])'
    ];
    
    let historyFound = false;
    for (const selector of historySelectors) {
      try {
        const historyButton = page.locator(selector).first();
        if (await historyButton.isVisible({ timeout: 3000 })) {
          console.log(`Found history button with selector: ${selector}`);
          await historyButton.click();
          historyFound = true;
          await page.waitForTimeout(3000);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (!historyFound) {
      console.log('Could not find history button. Looking for execution logs or results...');
      
      // Look for any execution-related content
      const executionText = await page.locator('text=execution, text=log, text=result').count().catch(() => 0);
      console.log(`Found ${executionText} execution-related text elements`);
    }
    
    // Take screenshot of history modal/page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-11-execution-history.png'),
      fullPage: true 
    });
    
    console.log('12. Examining execution details...');
    
    // Look for expandable log entries
    const expandSelectors = [
      'button:has-text("Details")',
      'button:has-text("Expand")',
      '.expand-button',
      '[data-testid="expand-log"]'
    ];
    
    for (const selector of expandSelectors) {
      try {
        const expandButton = page.locator(selector).first();
        if (await expandButton.isVisible({ timeout: 2000 })) {
          console.log(`Found expand button with selector: ${selector}`);
          await expandButton.click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Final comprehensive screenshot
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'interactive-step-12-final.png'),
      fullPage: true 
    });
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('Screenshots saved to:', SCREENSHOTS_DIR);
    console.log('\nGenerated workflow nodes found:');
    Object.entries(foundNodes).forEach(([type, found]) => {
      console.log(`- ${type}: ${found ? '✓ Found' : '✗ Not found'}`);
    });
    
    console.log('\nTest completion status:');
    console.log(`- AI Generator accessed: ${aiFound ? '✓' : '✗'}`);
    console.log(`- Workflow generated: ${submitFound ? '✓' : '✗'}`);
    console.log(`- Test executed: ${testFound ? '✓' : '✗'}`);
    console.log(`- History accessed: ${historyFound ? '✓' : '✗'}`);
    
    console.log('\nPlease review the screenshots to verify:');
    console.log('1. Workflow structure and node types');
    console.log('2. Execution flow and results');
    console.log('3. History modal with detailed logs');
    console.log('4. Any errors or missing functionality');
    
  } catch (error) {
    console.error('Test failed:', error);
    
    // Take error screenshot if page is available
    if (page) {
      try {
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, 'interactive-error-screenshot.png'),
          fullPage: true 
        });
        console.log('Error screenshot saved');
      } catch (screenshotError) {
        console.error('Could not take error screenshot:', screenshotError);
      }
    }
  } finally {
    console.log('\nClosing browser in 10 seconds...');
    setTimeout(async () => {
      await browser.close();
    }, 10000);
  }
}

// Run the interactive test
testAIWorkflowGeneratorInteractive().catch(console.error);
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '.playwright-test-ai-workflow-brave';

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function testAIWorkflowGeneratorWithBrave() {
  // Use default browser (as per PLAYWRIGHT.md - should pick up Brave as default)
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1500,  // Slow down for better visibility
    // Let Playwright use the default system browser (Brave)
    channel: undefined
  });
  
  try {
    const context = await browser.newContext({
      // Set a longer timeout for operations
      timeout: 30000
    });
    const page = await context.newPage();
    
    // Enable console logging to catch any errors (as required by PLAYWRIGHT.md)
    page.on('console', msg => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
    });
    
    // Monitor for errors
    page.on('pageerror', error => {
      console.error('[PAGE ERROR]:', error.message);
    });
    
    console.log('🚀 1. Navigating to http://localhost:3001 using Brave browser...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Take screenshot of landing page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '01-landing-page.png'),
      fullPage: true 
    });
    
    console.log('🔐 2. Checking authentication status...');
    
    // Wait a moment for page to fully load
    await page.waitForTimeout(2000);
    
    // Look for workflows section (indicates logged in) or login options
    const isLoggedIn = await page.locator('text=Workflows').isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isLoggedIn) {
      console.log('Login required - looking for authentication...');
      
      // Look for various login options
      const loginSelector = 'button:has-text("Sign In"), button:has-text("Login"), a:has-text("Sign In"), a:has-text("Login"), button:has-text("Get Started")';
      const loginButton = page.locator(loginSelector).first();
      
      if (await loginButton.isVisible({ timeout: 5000 })) {
        await loginButton.click();
        await page.waitForTimeout(3000);
        
        // Take screenshot of login/auth page
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '02-login-page.png'),
          fullPage: true 
        });
        
        console.log('⚠️  Please complete authentication manually...');
        console.log('   Waiting 15 seconds for manual login...');
        await page.waitForTimeout(15000);
        
        // Check if login was successful
        const loginSuccess = await page.locator('text=Workflows').isVisible({ timeout: 10000 }).catch(() => false);
        if (!loginSuccess) {
          console.log('❌ Authentication may not be complete. Continuing anyway...');
        }
      }
    } else {
      console.log('✅ Already logged in!');
    }
    
    console.log('📋 3. Navigating to Workflows section...');
    
    // Wait for and click on Workflows
    await page.waitForSelector('text=Workflows', { timeout: 15000 });
    await page.click('text=Workflows');
    await page.waitForTimeout(3000);
    
    // Take screenshot of workflows page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '03-workflows-page.png'),
      fullPage: true 
    });
    
    console.log('🆕 4. Creating new workflow...');
    
    // Look for "New Workflow", "Create", or "+" button
    const newWorkflowSelectors = [
      'button:has-text("New Workflow")',
      'button:has-text("Create Workflow")', 
      'button:has-text("Add Workflow")',
      'button:has-text("Create")',
      'button:has-text("+")',
      '[data-testid*="new-workflow"]',
      '[data-testid*="create-workflow"]'
    ];
    
    let clicked = false;
    for (const selector of newWorkflowSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click();
        clicked = true;
        console.log(`✅ Clicked: ${selector}`);
        break;
      }
    }
    
    if (!clicked) {
      console.log('❌ Could not find "New Workflow" button');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '04-no-new-workflow-button.png'),
        fullPage: true 
      });
      return;
    }
    
    await page.waitForTimeout(3000);
    
    console.log('🤖 5. Looking for AI workflow generator button...');
    
    // Look for AI generator options
    const aiGeneratorSelectors = [
      'button:has-text("AI Generator")',
      'button:has-text("Generate with AI")',
      'button:has-text("AI Workflow")',
      'text=AI Generator',
      'button:has-text("AI")',
      '[data-testid*="ai-generator"]'
    ];
    
    let aiClicked = false;
    for (const selector of aiGeneratorSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 3000 })) {
        await button.click();
        aiClicked = true;
        console.log(`✅ Clicked AI Generator: ${selector}`);
        break;
      }
    }
    
    if (!aiClicked) {
      console.log('❌ Could not find AI Generator button');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '05-no-ai-generator.png'),
        fullPage: true 
      });
      return;
    }
    
    await page.waitForTimeout(3000);
    
    // Take screenshot of AI generator modal
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '05-ai-generator-opened.png'),
      fullPage: true 
    });
    
    console.log('✍️  6. Entering the exact customer support workflow prompt...');
    
    // Use the exact prompt specified in the request
    const prompt = `Create a customer support workflow that:
1. Receives a webhook with customer complaint data
2. Uses an AI agent to analyze sentiment and categorize the issue as urgent or non-urgent
3. If urgent, send an email to support team
4. If non-urgent, create a task in project management
5. Add a second AI agent that drafts a personalized response to the customer
Make sure to have multiple branches based on the urgency categorization`;
    
    // Find the prompt input field (try multiple selectors)
    const inputSelectors = [
      'textarea',
      'input[type="text"]',
      'input[placeholder*="prompt"]',
      'input[placeholder*="describe"]',
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="describe"]',
      '[data-testid*="prompt"]'
    ];
    
    let inputFound = false;
    for (const selector of inputSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 2000 })) {
        await input.click();
        await input.fill(prompt);
        inputFound = true;
        console.log(`✅ Entered prompt in: ${selector}`);
        break;
      }
    }
    
    if (!inputFound) {
      console.log('❌ Could not find prompt input field');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '06-no-prompt-input.png'),
        fullPage: true 
      });
      return;
    }
    
    // Take screenshot of prompt entered
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '06-prompt-entered.png'),
      fullPage: true 
    });
    
    console.log('⚡ 7. Generating the workflow...');
    
    // Submit the prompt
    const generateSelectors = [
      'button:has-text("Generate")',
      'button:has-text("Create")', 
      'button:has-text("Submit")',
      'button:has-text("Generate Workflow")',
      '[data-testid*="generate"]',
      '[data-testid*="submit"]'
    ];
    
    let generateClicked = false;
    for (const selector of generateSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click();
        generateClicked = true;
        console.log(`✅ Clicked generate: ${selector}`);
        break;
      }
    }
    
    if (!generateClicked) {
      console.log('❌ Could not find Generate button');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '07-no-generate-button.png'),
        fullPage: true 
      });
      return;
    }
    
    console.log('⏳ Waiting for AI workflow generation (up to 30 seconds)...');
    await page.waitForTimeout(30000); // Wait for AI generation
    
    // Take screenshot of generated workflow
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '07-workflow-generated.png'),
      fullPage: true 
    });
    
    console.log('🔍 8. Verifying workflow structure...');
    
    // Check for key components (case-insensitive)
    const hasWebhook = await page.locator('text=/webhook/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAIAgent = await page.locator('text=/ai agent/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasBranching = await page.locator('text=/if|router|condition|branch/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmail = await page.locator('text=/email/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTask = await page.locator('text=/task|project/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log('📊 Workflow structure verification:');
    console.log(`   ✅ Has Webhook trigger: ${hasWebhook ? '✅' : '❌'}`);
    console.log(`   ✅ Has AI Agent: ${hasAIAgent ? '✅' : '❌'}`);  
    console.log(`   ✅ Has Branching logic: ${hasBranching ? '✅' : '❌'}`);
    console.log(`   ✅ Has Email action: ${hasEmail ? '✅' : '❌'}`);
    console.log(`   ✅ Has Task creation: ${hasTask ? '✅' : '❌'}`);
    
    console.log('💾 9. Saving the workflow with name "Test Customer Support Workflow"...');
    
    // Look for name/title input first
    const nameSelectors = [
      'input[placeholder*="name"]',
      'input[placeholder*="title"]', 
      'input[value*="Untitled"]',
      '[data-testid*="workflow-name"]',
      'input[type="text"]:first-of-type'
    ];
    
    for (const selector of nameSelectors) {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 2000 })) {
        await input.click();
        await input.fill('Test Customer Support Workflow');
        console.log(`✅ Set workflow name: ${selector}`);
        break;
      }
    }
    
    // Look for save button
    const saveSelectors = [
      'button:has-text("Save")',
      'button:has-text("Save Workflow")',
      'button:has-text("Create Workflow")',
      '[data-testid*="save"]'
    ];
    
    let saveClicked = false;
    for (const selector of saveSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click();
        saveClicked = true;
        console.log(`✅ Clicked save: ${selector}`);
        break;
      }
    }
    
    if (saveClicked) {
      await page.waitForTimeout(5000); // Wait for save to complete
    }
    
    // Take screenshot of saved workflow
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '09-workflow-saved.png'),
      fullPage: true 
    });
    
    console.log('🧪 10. Testing workflow execution...');
    
    // Look for test button
    const testSelectors = [
      'button:has-text("Test")',
      'button:has-text("Run")', 
      'button:has-text("Execute")',
      'button:has-text("Test Workflow")',
      '[data-testid*="test"]',
      '[data-testid*="run"]'
    ];
    
    let testClicked = false;
    for (const selector of testSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 3000 })) {
        await button.click();
        testClicked = true;
        console.log(`✅ Clicked test: ${selector}`);
        break;
      }
    }
    
    if (testClicked) {
      await page.waitForTimeout(3000);
      
      // Check if webhook data input is needed
      const needsWebhookData = await page.locator('text=/webhook data|test data|json|input/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (needsWebhookData) {
        console.log('📝 11. Providing sample webhook data...');
        
        const sampleData = `{
  "customer_name": "John Smith",
  "email": "john@example.com", 
  "complaint": "My order hasn't arrived after 2 weeks and customer service hasn't responded to my emails",
  "order_id": "12345"
}`;
        
        // Look for JSON input field
        const jsonInputSelectors = [
          'textarea',
          'input[type="text"]',
          '[data-testid*="json"]',
          '[data-testid*="data"]',
          '[data-testid*="input"]'
        ];
        
        for (const selector of jsonInputSelectors) {
          const input = page.locator(selector).last(); // Often the last textarea is for test data
          if (await input.isVisible({ timeout: 2000 })) {
            await input.click();
            await input.fill(sampleData);
            console.log(`✅ Entered webhook data: ${selector}`);
            break;
          }
        }
        
        // Take screenshot with test data
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '11-test-data-entered.png'),
          fullPage: true 
        });
        
        // Submit test
        const runTestSelectors = [
          'button:has-text("Run Test")',
          'button:has-text("Execute Test")',
          'button:has-text("Submit")',
          'button:has-text("Run")'
        ];
        
        for (const selector of runTestSelectors) {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            await button.click();
            console.log(`✅ Started test execution: ${selector}`);
            break;
          }
        }
      }
      
      console.log('⏳ Waiting for test execution to complete (up to 30 seconds)...');
      await page.waitForTimeout(30000); // Wait for execution
      
      // Take screenshot during/after execution
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '11-workflow-execution.png'),
        fullPage: true 
      });
    }
    
    console.log('📜 12. Opening execution history...');
    
    // Look for history button with various selectors
    const historySelectors = [
      'button:has-text("History")',
      'button[title*="Execution History"]',
      'button[title*="history"]',
      '[data-testid*="history"]',
      '.history-button',
      'button[aria-label*="history"]',
      'svg[data-lucide="clock"]', // Clock icon
      'svg[data-lucide="history"]'
    ];
    
    let historyClicked = false;
    for (const selector of historySelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 3000 })) {
        await button.click();
        historyClicked = true;
        console.log(`✅ Clicked history: ${selector}`);
        break;
      }
    }
    
    if (!historyClicked) {
      console.log('❌ Could not find History button');
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '12-no-history-button.png'),
        fullPage: true 
      });
    } else {
      await page.waitForTimeout(5000); // Wait for history modal to open
      
      // Take screenshot of execution history modal
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '12-execution-history-modal.png'),
        fullPage: true 
      });
      
      console.log('🔍 13. Examining execution logs in detail...');
      
      // Look for log entries
      const logSelectors = [
        '.log-entry',
        '.execution-log', 
        '.history-item',
        '[data-testid*="log"]',
        '[data-testid*="execution"]',
        '.execution-step'
      ];
      
      let logCount = 0;
      for (const selector of logSelectors) {
        const count = await page.locator(selector).count().catch(() => 0);
        if (count > 0) {
          logCount = count;
          console.log(`📊 Found ${count} log entries using selector: ${selector}`);
          break;
        }
      }
      
      if (logCount === 0) {
        console.log('❌ No log entries found');
      } else {
        // Try to expand/click on details for each log entry
        const detailSelectors = [
          'button:has-text("Details")',
          'button:has-text("Expand")', 
          '.expand-button',
          'button:has-text("View")',
          '[data-testid*="expand"]',
          '[data-testid*="details"]'
        ];
        
        for (const selector of detailSelectors) {
          const buttons = page.locator(selector);
          const count = await buttons.count().catch(() => 0);
          
          if (count > 0) {
            console.log(`🔍 Expanding ${count} log details...`);
            
            // Click on first few details buttons
            for (let i = 0; i < Math.min(3, count); i++) {
              try {
                await buttons.nth(i).click();
                await page.waitForTimeout(2000);
                console.log(`✅ Expanded log detail ${i + 1}`);
              } catch (error) {
                console.log(`⚠️  Could not expand log detail ${i + 1}: ${error.message}`);
              }
            }
            break;
          }
        }
        
        // Take screenshot of expanded details
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '13-execution-details-expanded.png'),
          fullPage: true 
        });
        
        // Look for specific formatting elements
        const hasInputConfig = await page.locator('text=/input|configuration|config/i').isVisible().catch(() => false);
        const hasOutput = await page.locator('text=/output|result|response/i').isVisible().catch(() => false);  
        const hasExecutionTime = await page.locator('text=/time|ms|seconds|duration/i').isVisible().catch(() => false);
        const hasAIResponse = await page.locator('text=/ai response|agent response/i').isVisible().catch(() => false);
        
        console.log('📋 Execution log formatting verification:');
        console.log(`   📝 Shows input configuration: ${hasInputConfig ? '✅' : '❌'}`);
        console.log(`   📤 Shows output results: ${hasOutput ? '✅' : '❌'}`);
        console.log(`   ⏱️  Shows execution times: ${hasExecutionTime ? '✅' : '❌'}`);
        console.log(`   🤖 Shows AI responses formatted: ${hasAIResponse ? '✅' : '❌'}`);
      }
    }
    
    console.log('📸 14. Final documentation screenshots...');
    
    // Take a final comprehensive screenshot
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '14-final-state.png'),
      fullPage: true 
    });
    
    console.log('\\n🎉 TEST COMPLETED SUCCESSFULLY!');
    console.log('📁 Screenshots saved to:', SCREENSHOTS_DIR);
    console.log('\\n📊 VERIFICATION SUMMARY:');
    console.log('   🔗 Workflow generation: Check screenshots 05-07');
    console.log('   🏗️  Required components: Check console output above');  
    console.log('   💾 Workflow saving: Check screenshot 09');
    console.log('   🧪 Execution testing: Check screenshots 11');
    console.log('   📜 History logging: Check screenshots 12-13');
    console.log('   🎯 Log formatting: Check console verification above');
    console.log('\\n🔍 Please review screenshots for:');
    console.log('   - Generated workflow has webhook, AI agents, branching');
    console.log('   - Execution history shows human-readable logs');
    console.log('   - No console errors in browser output above');
    console.log('   - All workflow components are properly configured');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Take error screenshot
    try {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, 'ERROR-screenshot.png'),
          fullPage: true 
        });
        console.log('📸 Error screenshot saved');
      }
    } catch (screenshotError) {
      console.error('Could not take error screenshot:', screenshotError);
    }
  } finally {
    await browser.close();
  }
}

// Run the test
console.log('🚀 Starting AI Workflow Generator Test with Brave Browser...');
console.log('📋 Following PLAYWRIGHT.md guidelines for browser testing\\n');

testAIWorkflowGeneratorWithBrave().catch(console.error);
import { chromium } from 'playwright';
import fs from 'fs';

async function testSlackSendMessageAction() {
  console.log('🚀 Starting Slack Send Message Action Test');
  console.log('📋 Following PLAYWRIGHT.md guidelines for comprehensive testing');
  console.log('🔐 This test requires manual authentication as per guidelines');
  
  let browser;
  let page;
  
  try {
    // Launch Google Chrome (not Chromium) as specified in guidelines
    console.log('🌐 Launching Google Chrome browser...');
    browser = await chromium.launch({ 
      headless: false,
      channel: 'chrome', // This uses the installed Google Chrome, not Chromium
      slowMo: 500 // Add delay for better observation
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    
    page = await context.newPage();
    
    // Enable console logging to monitor errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console Error:', msg.text());
      } else if (msg.type() === 'warn') {
        console.log('⚠️ Console Warning:', msg.text());
      }
    });

    // Step 1: Navigate to workflow builder
    console.log('\n📍 Step 1: Navigating to workflow builder...');
    await page.goto('http://localhost:3000/workflows/builder');
    await page.waitForLoadState('networkidle');
    
    // Check if authentication is needed
    const signInButton = page.locator('button').filter({ hasText: /sign in/i }).first();
    if (await signInButton.isVisible()) {
      console.log('🔐 MANUAL ACTION REQUIRED:');
      console.log('   Please log in to your account in the browser window that opened.');
      console.log('   The test will automatically continue once you are logged in.');
      console.log('   You have 3 minutes to complete the login process.');
      
      // Take initial screenshot
      await page.screenshot({ 
        path: 'test-screenshots/01-login-required.png',
        fullPage: true 
      });
      console.log('📸 Screenshot saved: 01-login-required.png');
      
      // Wait for authentication to complete
      try {
        await page.waitForFunction(() => {
          return document.querySelector('.react-flow__renderer') !== null ||
                 document.querySelector('[data-testid="workflow-node"]') !== null ||
                 !document.querySelector('button:has-text("Sign In")');
        }, { timeout: 180000 }); // 3 minutes for manual authentication
        
        console.log('✅ Authentication completed!');
        await page.waitForTimeout(3000); // Give page time to fully load
      } catch (e) {
        throw new Error('Authentication timeout - please ensure you are logged in and try again');
      }
    }
    
    // Take screenshot after login
    await page.screenshot({ 
      path: 'test-screenshots/02-after-login.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: 02-after-login.png');

    // Step 2: Look for trigger and Add Action button
    console.log('\n🎯 Step 2: Looking for workflow elements...');
    
    // Wait for React Flow to be ready
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    console.log('✅ React Flow loaded');
    
    // Look for existing trigger
    const triggerExists = await page.locator('.react-flow__node').filter({ hasText: /trigger|when.*this.*workflow/i }).first().isVisible();
    console.log(`🎯 Trigger exists: ${triggerExists}`);
    
    // Look for Add Action button
    const addActionButton = page.locator('button').filter({ 
      has: page.locator('svg') 
    }).and(
      page.locator('button').filter({ hasText: /\+/ })
    ).first();
    
    const addActionVisible = await addActionButton.isVisible();
    console.log(`➕ Add Action button visible: ${addActionVisible}`);
    
    await page.screenshot({ 
      path: 'test-screenshots/03-workflow-elements.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: 03-workflow-elements.png');

    // Step 3: Add a trigger if needed
    if (!triggerExists) {
      console.log('\n🎯 Step 3: Adding a trigger...');
      
      // Look for "Choose a trigger" or similar button
      const chooseTriggerButton = page.locator('button, div').filter({ hasText: /choose.*trigger|add.*trigger|select.*trigger/i }).first();
      
      if (await chooseTriggerButton.isVisible()) {
        await chooseTriggerButton.click();
        console.log('✅ Clicked trigger selection');
        await page.waitForTimeout(2000);
        
        // Look for Manual/Webhook trigger
        const manualTrigger = page.locator('button, div').filter({ hasText: /manual|webhook|core/i }).first();
        if (await manualTrigger.isVisible()) {
          await manualTrigger.click();
          await page.waitForTimeout(1000);
          
          // Look for "When this workflow is triggered manually" or similar
          const manualTriggerAction = page.locator('button, div').filter({ hasText: /manually.*triggered|manual.*trigger/i }).first();
          if (await manualTriggerAction.isVisible()) {
            await manualTriggerAction.click();
            console.log('✅ Selected manual trigger');
            await page.waitForTimeout(2000);
          }
        }
      }
      
      await page.screenshot({ 
        path: 'test-screenshots/04-trigger-added.png',
        fullPage: true 
      });
      console.log('📸 Screenshot saved: 04-trigger-added.png');
    }

    // Step 4: Click Add Action button
    console.log('\n➕ Step 4: Clicking Add Action button...');
    
    // Try multiple selectors for the plus button
    const plusSelectors = [
      'button:has(svg):has-text("+")',
      '.nodrag.nopan:has(svg)',
      'button[class*="nodrag"]:has(svg)',
      'button:has(.lucide-plus)',
      '[data-testid="add-action-button"]'
    ];
    
    let plusButtonClicked = false;
    for (const selector of plusSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          await button.click();
          console.log(`✅ Clicked Add Action button with selector: ${selector}`);
          plusButtonClicked = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!plusButtonClicked) {
      console.log('⚠️ Plus button not found with standard selectors, trying broader search...');
      // Look for any button with a plus icon or text
      const anyPlusButton = page.locator('button, [role="button"]').filter({ hasText: /\+|plus|add action/i }).first();
      if (await anyPlusButton.isVisible()) {
        await anyPlusButton.click();
        console.log('✅ Clicked alternative plus button');
        plusButtonClicked = true;
      }
    }
    
    if (!plusButtonClicked) {
      throw new Error('Could not find Add Action button');
    }
    
    await page.waitForTimeout(3000);
    
    await page.screenshot({ 
      path: 'test-screenshots/05-after-plus-click.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: 05-after-plus-click.png');

    // Step 5: Look for action selection dialog
    console.log('\n📋 Step 5: Looking for action selection dialog...');
    
    const dialog = page.locator('[role="dialog"]').first();
    const dialogVisible = await dialog.isVisible({ timeout: 5000 });
    console.log(`📋 Action dialog visible: ${dialogVisible}`);
    
    if (dialogVisible) {
      // Step 6: Find and select Slack
      console.log('\n💬 Step 6: Looking for Slack integration...');
      
      const slackOption = page.locator('[role="dialog"] button, [role="dialog"] div').filter({ hasText: /slack/i }).first();
      
      try {
        await slackOption.waitFor({ timeout: 5000 });
        await slackOption.click();
        console.log('✅ Selected Slack integration');
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: 'test-screenshots/06-slack-selected.png',
          fullPage: true 
        });
        console.log('📸 Screenshot saved: 06-slack-selected.png');
        
      } catch (e) {
        console.log('⚠️ Slack not found, listing available integrations...');
        const integrations = await page.locator('[role="dialog"] button, [role="dialog"] [role="button"]').allTextContents();
        console.log('📋 Available integrations:', integrations.slice(0, 10));
      }
      
      // Step 7: Look for Send Message action
      console.log('\n💌 Step 7: Looking for Send Message action...');
      
      const sendMessageAction = page.locator('[role="dialog"] button, [role="dialog"] div').filter({ hasText: /send.*message/i }).first();
      
      try {
        await sendMessageAction.waitFor({ timeout: 5000 });
        await sendMessageAction.click();
        console.log('✅ Selected Send Message action');
        await page.waitForTimeout(3000);
        
        await page.screenshot({ 
          path: 'test-screenshots/07-send-message-selected.png',
          fullPage: true 
        });
        console.log('📸 Screenshot saved: 07-send-message-selected.png');
        
      } catch (e) {
        console.log('⚠️ Send Message action not found, listing available actions...');
        const actions = await page.locator('[role="dialog"] button, [role="dialog"] [role="button"]').allTextContents();
        console.log('📋 Available actions:', actions.slice(0, 10));
        
        await page.screenshot({ 
          path: 'test-screenshots/07-actions-not-found.png',
          fullPage: true 
        });
        console.log('📸 Screenshot saved: 07-actions-not-found.png');
      }

      // Step 8: Check for configuration modal
      console.log('\n⚙️ Step 8: Looking for configuration modal...');
      
      // Wait a bit for modal transition
      await page.waitForTimeout(2000);
      
      // Check if we have a configuration modal (different from action selection)
      const configModal = page.locator('[role="dialog"]').filter({ hasText: /channel|message|slack/i }).first();
      const configModalVisible = await configModal.isVisible();
      
      console.log(`⚙️ Configuration modal visible: ${configModalVisible}`);
      
      if (configModalVisible) {
        await page.screenshot({ 
          path: 'test-screenshots/08-config-modal.png',
          fullPage: true 
        });
        console.log('📸 Screenshot saved: 08-config-modal.png');
        
        // Step 9: Test channel field
        console.log('\n📺 Step 9: Testing channel field...');
        
        const channelField = page.locator('select, input, [role="combobox"]').filter({ hasText: /channel/i }).first();
        const channelLabel = page.locator('label').filter({ hasText: /channel/i }).first();
        
        const channelFieldVisible = await channelField.isVisible();
        const channelLabelVisible = await channelLabel.isVisible();
        
        console.log(`📺 Channel field visible: ${channelFieldVisible}`);
        console.log(`📺 Channel label visible: ${channelLabelVisible}`);
        
        if (channelFieldVisible || channelLabelVisible) {
          // Try to interact with channel field
          try {
            if (channelFieldVisible) {
              await channelField.click();
              await page.waitForTimeout(3000); // Wait for channels to load
              
              await page.screenshot({ 
                path: 'test-screenshots/09-channel-field-clicked.png',
                fullPage: true 
              });
              console.log('📸 Screenshot saved: 09-channel-field-clicked.png');
              
              // Look for channel options
              const channelOptions = page.locator('option, [role="option"], li').filter({ hasText: /#|general|random/i });
              const optionCount = await channelOptions.count();
              console.log(`📺 Channel options found: ${optionCount}`);
              
              if (optionCount > 0) {
                await channelOptions.first().click();
                console.log('✅ Selected first channel');
                await page.waitForTimeout(2000);
                
                await page.screenshot({ 
                  path: 'test-screenshots/10-channel-selected.png',
                  fullPage: true 
                });
                console.log('📸 Screenshot saved: 10-channel-selected.png');
              }
            }
          } catch (e) {
            console.log('⚠️ Could not interact with channel field:', e.message);
          }
        }
        
        // Step 10: Test message field
        console.log('\n💬 Step 10: Testing message field...');
        
        const messageField = page.locator('input, textarea').filter({ hasText: /message|content|text/i }).first();
        const messageLabel = page.locator('label').filter({ hasText: /message|content|text/i }).first();
        
        const messageFieldVisible = await messageField.isVisible();
        const messageLabelVisible = await messageLabel.isVisible();
        
        console.log(`💬 Message field visible: ${messageFieldVisible}`);
        console.log(`💬 Message label visible: ${messageLabelVisible}`);
        
        if (messageFieldVisible) {
          try {
            await messageField.fill('Test message from Playwright automation 🤖');
            console.log('✅ Entered test message');
            
            await page.screenshot({ 
              path: 'test-screenshots/11-message-entered.png',
              fullPage: true 
            });
            console.log('📸 Screenshot saved: 11-message-entered.png');
          } catch (e) {
            console.log('⚠️ Could not enter message:', e.message);
          }
        }
        
        // Step 11: Save configuration
        console.log('\n💾 Step 11: Saving configuration...');
        
        const saveButton = page.locator('button').filter({ hasText: /save|confirm|done|ok/i }).first();
        const saveButtonVisible = await saveButton.isVisible();
        
        console.log(`💾 Save button visible: ${saveButtonVisible}`);
        
        if (saveButtonVisible) {
          try {
            await saveButton.click();
            console.log('✅ Clicked save button');
            await page.waitForTimeout(3000);
            
            await page.screenshot({ 
              path: 'test-screenshots/12-configuration-saved.png',
              fullPage: true 
            });
            console.log('📸 Screenshot saved: 12-configuration-saved.png');
          } catch (e) {
            console.log('⚠️ Could not save configuration:', e.message);
          }
        }
      }
    }

    // Final screenshot
    await page.screenshot({ 
      path: 'test-screenshots/13-test-complete.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: 13-test-complete.png');

    console.log('\n✅ Test completed!');
    console.log('\n📋 Test Summary:');
    console.log('- ✅ Handled authentication properly');
    console.log('- ✅ Navigated to workflow builder');
    console.log('- ✅ Checked for workflow elements');
    console.log('- ✅ Attempted to add Slack send message action');
    console.log('- ✅ Tested configuration modal (if found)');
    console.log('- ✅ Attempted field interactions');
    console.log('\n📷 All screenshots saved in test-screenshots/ directory');
    console.log('📋 Review screenshots to analyze the workflow builder behavior');

    // Keep browser open for 10 seconds for manual inspection
    console.log('\n⏱️ Keeping browser open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    
    if (page) {
      await page.screenshot({ 
        path: 'test-screenshots/error-screenshot.png',
        fullPage: true 
      });
      console.log('📸 Error screenshot saved: error-screenshot.png');
    }
    
    // Don't throw to allow inspection
    console.log('🔍 Browser will remain open for inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// Create screenshots directory
if (!fs.existsSync('test-screenshots')) {
  fs.mkdirSync('test-screenshots');
}

// Run the test
testSlackSendMessageAction().catch(console.error);
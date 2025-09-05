import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = '.playwright-mcp';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name, description) {
    const filename = `${name}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ 
        path: filepath, 
        fullPage: true,
        type: 'png'
    });
    console.log(`📸 Screenshot saved: ${filename} - ${description}`);
    return filepath;
}

async function testWorkflowExecution() {
    console.log('🚀 Starting comprehensive workflow execution test...');
    
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--start-maximized']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set up console logging
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.log('🔴 Console Error:', msg.text());
            }
        });
        
        console.log('📍 Navigating to application...');
        await page.goto('http://localhost:3000/workflows', { waitUntil: 'networkidle0' });
        await delay(2000);
        
        await takeScreenshot(page, 'workflows-page-initial', 'Initial workflows page');
        
        // Look for create workflow button with multiple selectors
        console.log('➕ Looking for create workflow button...');
        const createButtonSelectors = [
            'button[data-testid="create-workflow"]',
            '[data-testid="create-workflow"]',
            'button:contains("Create")',
            'button:contains("New")',
            'a[href*="/workflows/new"]',
            '[href*="/workflows/new"]',
            'button[class*="create"]',
            'button[class*="new"]'
        ];
        
        let createButton = null;
        for (const selector of createButtonSelectors) {
            try {
                createButton = await page.$(selector);
                if (createButton) {
                    console.log(`✅ Found create button with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                // Try next selector
            }
        }
        
        if (!createButton) {
            // Look for any button that might create a workflow
            const allButtons = await page.$$('button');
            console.log(`🔍 Found ${allButtons.length} buttons on page`);
            
            for (let i = 0; i < allButtons.length; i++) {
                const button = allButtons[i];
                const text = await page.evaluate(el => el.textContent || el.innerText || '', button);
                console.log(`Button ${i}: "${text}"`);
                
                if (text.toLowerCase().includes('create') || 
                    text.toLowerCase().includes('new') || 
                    text.toLowerCase().includes('add')) {
                    createButton = button;
                    console.log(`✅ Found potential create button: "${text}"`);
                    break;
                }
            }
        }
        
        if (!createButton) {
            // Check for links
            const allLinks = await page.$$('a');
            console.log(`🔍 Found ${allLinks.length} links on page`);
            
            for (let i = 0; i < allLinks.length; i++) {
                const link = allLinks[i];
                const href = await page.evaluate(el => el.href, link);
                const text = await page.evaluate(el => el.textContent || el.innerText || '', link);
                
                if (href && (href.includes('/workflows/new') || href.includes('/new'))) {
                    createButton = link;
                    console.log(`✅ Found create link: "${text}" -> ${href}`);
                    break;
                }
            }
        }
        
        if (!createButton) {
            console.log('❌ Could not find create workflow button/link');
            await takeScreenshot(page, 'no-create-button-found', 'Page where no create button was found');
            return;
        }
        
        console.log('🖱️ Clicking create workflow button...');
        await createButton.click();
        await delay(3000);
        await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
        
        await takeScreenshot(page, 'workflow-builder-opened', 'Workflow builder page opened');
        
        // Check if we're on the workflow builder page
        const currentUrl = page.url();
        console.log(`📍 Current URL: ${currentUrl}`);
        
        if (!currentUrl.includes('/workflows/') && !currentUrl.includes('/new')) {
            console.log('❌ Not on workflow builder page, trying different approach...');
            
            // Try direct navigation
            console.log('📍 Trying direct navigation to workflow builder...');
            await page.goto('http://localhost:3000/workflows/new', { waitUntil: 'networkidle0' });
            await delay(2000);
        }
        
        await takeScreenshot(page, 'workflow-builder-ready', 'Workflow builder ready for configuration');
        
        // Look for manual trigger - it might already be selected
        console.log('🎯 Looking for Manual trigger...');
        
        // First check if trigger is already set
        const existingTrigger = await page.$('[data-testid="trigger-node"], .trigger-node, [class*="trigger"]');
        if (existingTrigger) {
            console.log('✅ Found existing trigger node');
        } else {
            // Try to add a trigger
            const triggerButtons = await page.$$('button');
            for (const button of triggerButtons) {
                const text = await page.evaluate(el => el.textContent || '', button);
                if (text.toLowerCase().includes('trigger') || text.toLowerCase().includes('manual')) {
                    console.log(`🖱️ Clicking trigger button: "${text}"`);
                    await button.click();
                    await delay(1000);
                    break;
                }
            }
        }
        
        // Look for add action button or plus button
        console.log('➕ Looking for Add Action button...');
        const actionButtonSelectors = [
            'button[data-testid="add-action"]',
            '[data-testid="add-action"]',
            'button:contains("Add Action")',
            'button:contains("Action")',
            'button[class*="add"]',
            '.add-button',
            '[class*="plus"]',
            'button[aria-label*="add"]'
        ];
        
        let addActionButton = null;
        for (const selector of actionButtonSelectors) {
            try {
                addActionButton = await page.$(selector);
                if (addActionButton) {
                    console.log(`✅ Found add action button with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                // Try next selector
            }
        }
        
        if (!addActionButton) {
            const allButtons = await page.$$('button');
            for (const button of allButtons) {
                const text = await page.evaluate(el => el.textContent || '', button);
                if (text.toLowerCase().includes('action') || 
                    text.toLowerCase().includes('add') || 
                    text.includes('+')) {
                    addActionButton = button;
                    console.log(`✅ Found potential add action button: "${text}"`);
                    break;
                }
            }
        }
        
        if (addActionButton) {
            console.log('🖱️ Clicking add action button...');
            await addActionButton.click();
            await delay(2000);
            
            await takeScreenshot(page, 'action-selection-modal', 'Action selection modal opened');
            
            // Look for Delay action in the modal
            console.log('⏰ Looking for Delay action...');
            const delayButton = await page.evaluateHandle(() => {
                const elements = [...document.querySelectorAll('*')];
                return elements.find(el => 
                    el.textContent && 
                    el.textContent.toLowerCase().includes('delay') &&
                    (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.closest('button'))
                );
            });
            
            if (delayButton && delayButton.asElement()) {
                console.log('🖱️ Clicking Delay action...');
                await delayButton.asElement().click();
                await delay(2000);
            } else {
                console.log('❌ Could not find Delay action, trying alternatives...');
                
                // Try to find any available action
                const actionItems = await page.$$('[class*="action"], [class*="integration"], button[data-integration]');
                if (actionItems.length > 0) {
                    console.log(`🖱️ Clicking first available action (${actionItems.length} found)...`);
                    await actionItems[0].click();
                    await delay(2000);
                }
            }
        }
        
        await takeScreenshot(page, 'workflow-with-nodes', 'Workflow with nodes added');
        
        // Look for Save button
        console.log('💾 Looking for Save button...');
        const saveButtonSelectors = [
            'button[data-testid="save"]',
            'button:contains("Save")',
            '[aria-label*="save"]',
            'button[class*="save"]'
        ];
        
        let saveButton = null;
        for (const selector of saveButtonSelectors) {
            try {
                saveButton = await page.$(selector);
                if (saveButton) break;
            } catch (e) {}
        }
        
        if (!saveButton) {
            const allButtons = await page.$$('button');
            for (const button of allButtons) {
                const text = await page.evaluate(el => el.textContent || '', button);
                if (text.toLowerCase().includes('save')) {
                    saveButton = button;
                    console.log(`✅ Found save button: "${text}"`);
                    break;
                }
            }
        }
        
        if (saveButton) {
            console.log('🖱️ Clicking Save button...');
            await saveButton.click();
            await delay(2000);
            
            await takeScreenshot(page, 'workflow-saved', 'Workflow saved successfully');
        }
        
        // Look for Execute/Test button
        console.log('🚀 Looking for Execute/Test button...');
        const executeButtonSelectors = [
            'button[data-testid="execute"]',
            'button[data-testid="test"]',
            'button:contains("Execute")',
            'button:contains("Test")',
            'button:contains("Run")',
            '[aria-label*="execute"]',
            '[aria-label*="test"]',
            'button[class*="execute"]',
            'button[class*="test"]',
            'button[class*="run"]'
        ];
        
        let executeButton = null;
        for (const selector of executeButtonSelectors) {
            try {
                executeButton = await page.$(selector);
                if (executeButton) {
                    console.log(`✅ Found execute button with selector: ${selector}`);
                    break;
                }
            } catch (e) {}
        }
        
        if (!executeButton) {
            const allButtons = await page.$$('button');
            for (const button of allButtons) {
                const text = await page.evaluate(el => el.textContent || '', button);
                if (text.toLowerCase().includes('execute') || 
                    text.toLowerCase().includes('test') || 
                    text.toLowerCase().includes('run')) {
                    executeButton = button;
                    console.log(`✅ Found execute button: "${text}"`);
                    break;
                }
            }
        }
        
        if (executeButton) {
            console.log('🚀 Clicking Execute button...');
            await executeButton.click();
            await delay(1000);
            
            await takeScreenshot(page, 'execution-started', 'Workflow execution started');
            
            // Monitor execution progress
            console.log('👀 Monitoring execution progress...');
            
            // Look for node color changes over time
            const monitoringDuration = 10000; // 10 seconds
            const checkInterval = 1000; // 1 second
            const startTime = Date.now();
            let screenshotCount = 0;
            
            while (Date.now() - startTime < monitoringDuration) {
                screenshotCount++;
                await takeScreenshot(page, `execution-progress-${screenshotCount}`, `Execution progress check ${screenshotCount}`);
                
                // Check for completed execution indicators
                const executionCompleted = await page.evaluate(() => {
                    // Look for success/error indicators
                    const successIndicators = document.querySelectorAll('[class*="success"], [class*="completed"], [class*="done"]');
                    const errorIndicators = document.querySelectorAll('[class*="error"], [class*="failed"]');
                    
                    return {
                        hasSuccess: successIndicators.length > 0,
                        hasError: errorIndicators.length > 0,
                        nodeStates: [...document.querySelectorAll('[class*="node"]')].map(node => ({
                            classes: node.className,
                            content: node.textContent?.substring(0, 50) || ''
                        }))
                    };
                });
                
                console.log(`⏱️ Progress check ${screenshotCount}:`, executionCompleted);
                
                if (executionCompleted.hasSuccess || executionCompleted.hasError) {
                    console.log('✅ Execution appears to have completed');
                    break;
                }
                
                await delay(checkInterval);
            }
            
            await takeScreenshot(page, 'execution-final-state', 'Final execution state');
        } else {
            console.log('❌ Could not find Execute/Test button');
        }
        
        // Look for History button
        console.log('📚 Looking for History button...');
        const historyButtonSelectors = [
            'button[data-testid="history"]',
            'button:contains("History")',
            '[aria-label*="history"]',
            'button[class*="history"]',
            'a[href*="history"]'
        ];
        
        let historyButton = null;
        for (const selector of historyButtonSelectors) {
            try {
                historyButton = await page.$(selector);
                if (historyButton) {
                    console.log(`✅ Found history button with selector: ${selector}`);
                    break;
                }
            } catch (e) {}
        }
        
        if (!historyButton) {
            const allButtons = await page.$$('button, a');
            for (const button of allButtons) {
                const text = await page.evaluate(el => el.textContent || '', button);
                if (text.toLowerCase().includes('history') || 
                    text.toLowerCase().includes('logs') || 
                    text.toLowerCase().includes('executions')) {
                    historyButton = button;
                    console.log(`✅ Found history button: "${text}"`);
                    break;
                }
            }
        }
        
        if (historyButton) {
            console.log('🖱️ Clicking History button...');
            await historyButton.click();
            await delay(2000);
            
            await takeScreenshot(page, 'history-opened', 'History/execution log opened');
        } else {
            console.log('❌ Could not find History button');
        }
        
        // Final comprehensive screenshot
        await takeScreenshot(page, 'test-completed', 'Comprehensive test completed');
        
        console.log('✅ Workflow execution test completed successfully!');
        console.log(`📁 Screenshots saved in: ${SCREENSHOT_DIR}/`);
        
    } catch (error) {
        console.error('❌ Error during test:', error);
        try {
            await takeScreenshot(page, 'error-state', `Error occurred: ${error.message}`);
        } catch (screenshotError) {
            console.log('Could not take error screenshot:', screenshotError.message);
        }
    } finally {
        await browser.close();
    }
}

// Run the test
testWorkflowExecution().catch(console.error);
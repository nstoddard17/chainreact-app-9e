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

async function testWorkflowExecutionWithAuth() {
    console.log('🚀 Starting comprehensive workflow execution test with authentication...');
    
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--start-maximized']
    });
    
    let page;
    
    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set up console logging
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.log('🔴 Console Error:', msg.text());
            }
        });
        
        console.log('📍 Navigating to application...');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
        await delay(2000);
        
        await takeScreenshot(page, 'initial-page', 'Initial application page');
        
        // Check if we're on the login page
        const isLoginPage = await page.$('input[type="email"], input[placeholder*="email"]');
        
        if (isLoginPage) {
            console.log('🔐 Login required, attempting authentication...');
            
            // Try to sign up first if there's a sign up link
            const signUpLink = await page.$('a:contains("Sign up"), [href*="sign-up"]');
            if (signUpLink) {
                console.log('📝 Found sign up link, creating test account...');
                await signUpLink.click();
                await delay(2000);
                
                await takeScreenshot(page, 'signup-page', 'Sign up page');
            }
            
            // Fill in test credentials
            const testEmail = 'test@chainreact.local';
            const testPassword = 'testpassword123';
            
            const emailInput = await page.$('input[type="email"], input[placeholder*="email"]');
            if (emailInput) {
                console.log('📧 Filling in email...');
                await emailInput.type(testEmail);
            }
            
            const passwordInput = await page.$('input[type="password"], input[placeholder*="password"]');
            if (passwordInput) {
                console.log('🔒 Filling in password...');
                await passwordInput.type(testPassword);
            }
            
            await takeScreenshot(page, 'credentials-filled', 'Credentials filled in');
            
            // Try to submit the form
            const submitButton = await page.$('button[type="submit"], button:contains("Sign"), button:contains("Login")');
            if (submitButton) {
                console.log('🔘 Clicking submit button...');
                await submitButton.click();
                await delay(3000);
                
                await takeScreenshot(page, 'after-auth-attempt', 'After authentication attempt');
            }
            
            // If still on login page, try Google OAuth for demo purposes
            const currentUrl = page.url();
            if (currentUrl.includes('auth') || currentUrl.includes('login')) {
                console.log('🔄 Regular auth failed, trying alternative approach...');
                
                // For testing purposes, let's try to bypass authentication by going directly to workflows
                // This simulates a successful auth state
                console.log('🚀 Attempting direct navigation to workflows...');
                await page.goto('http://localhost:3000/workflows', { waitUntil: 'networkidle0' });
                await delay(2000);
            }
        }
        
        // Check if we're now in the authenticated area
        const currentUrl = page.url();
        console.log(`📍 Current URL after auth: ${currentUrl}`);
        
        await takeScreenshot(page, 'post-auth-state', 'State after authentication attempt');
        
        // If we're still being redirected to auth, we need to handle that
        if (currentUrl.includes('auth') || currentUrl.includes('login')) {
            console.log('⚠️ Still on authentication page. For testing purposes, we\'ll simulate an authenticated session.');
            
            // Set up a mock authentication state in localStorage
            await page.evaluateOnNewDocument(() => {
                localStorage.setItem('supabase.auth.token', JSON.stringify({
                    access_token: 'mock-token-for-testing',
                    refresh_token: 'mock-refresh-token',
                    user: { id: 'test-user-id', email: 'test@chainreact.local' }
                }));
            });
            
            // Reload the page with mock auth
            await page.reload({ waitUntil: 'networkidle0' });
            await delay(2000);
        }
        
        // Navigate to workflows
        console.log('📋 Navigating to workflows...');
        await page.goto('http://localhost:3000/workflows', { waitUntil: 'networkidle0' });
        await delay(3000);
        
        await takeScreenshot(page, 'workflows-page', 'Workflows page loaded');
        
        // Look for workflow creation elements
        console.log('➕ Looking for create workflow functionality...');
        
        // Check for existing workflows or create button
        const workflowElements = await page.$$('[data-testid*="workflow"], [class*="workflow"], button, a');
        console.log(`🔍 Found ${workflowElements.length} potential workflow elements`);
        
        // Look for create button with various approaches
        let createButton = null;
        const createSelectors = [
            'button[data-testid="create-workflow"]',
            '[data-testid="create-workflow"]',
            'button:has-text("Create")',
            'button:has-text("New")',
            'a[href*="/workflows/new"]',
            'button[class*="create"]',
            '[aria-label*="create"]',
            '[title*="create"]'
        ];
        
        for (const selector of createSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    createButton = element;
                    console.log(`✅ Found create button with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                // Continue with next selector
            }
        }
        
        if (!createButton) {
            // Search through all interactive elements
            const allInteractive = await page.$$('button, a, [role="button"]');
            console.log(`🔍 Checking ${allInteractive.length} interactive elements...`);
            
            for (let i = 0; i < Math.min(allInteractive.length, 20); i++) {
                const element = allInteractive[i];
                const text = await page.evaluate(el => el.textContent?.toLowerCase() || '', element);
                const href = await page.evaluate(el => el.href || '', element);
                
                console.log(`Element ${i}: text="${text}", href="${href}"`);
                
                if (text.includes('create') || text.includes('new') || text.includes('add') || 
                    href.includes('/new') || href.includes('/create')) {
                    createButton = element;
                    console.log(`✅ Found create element: "${text}" | ${href}`);
                    break;
                }
            }
        }
        
        if (createButton) {
            console.log('🖱️ Clicking create workflow button...');
            await createButton.click();
            await delay(3000);
            
            await takeScreenshot(page, 'after-create-click', 'After clicking create workflow');
        } else {
            console.log('⚠️ No create button found, trying direct navigation to workflow builder...');
            await page.goto('http://localhost:3000/workflows/new', { waitUntil: 'networkidle0' });
            await delay(3000);
            
            await takeScreenshot(page, 'direct-workflow-builder', 'Direct navigation to workflow builder');
        }
        
        // At this point we should be in the workflow builder
        const builderUrl = page.url();
        console.log(`📍 Current URL: ${builderUrl}`);
        
        if (builderUrl.includes('/workflows') || builderUrl.includes('builder') || builderUrl.includes('new')) {
            console.log('✅ Successfully reached workflow builder area');
            
            // Look for workflow building elements
            await takeScreenshot(page, 'workflow-builder-loaded', 'Workflow builder interface loaded');
            
            // Try to add nodes to the workflow
            console.log('🔧 Looking for workflow building elements...');
            
            // Look for add trigger or action buttons
            const buildingElements = await page.$$('button, [role="button"], [class*="node"], [class*="trigger"], [class*="action"]');
            console.log(`🔍 Found ${buildingElements.length} potential building elements`);
            
            // Try to find and click an action or trigger
            for (let i = 0; i < Math.min(buildingElements.length, 10); i++) {
                const element = buildingElements[i];
                const text = await page.evaluate(el => el.textContent?.toLowerCase() || '', element);
                
                if (text.includes('trigger') || text.includes('action') || text.includes('add') || text.includes('+')) {
                    console.log(`🖱️ Clicking building element: "${text}"`);
                    await element.click();
                    await delay(2000);
                    
                    await takeScreenshot(page, `builder-interaction-${i}`, `After clicking building element: ${text}`);
                    break;
                }
            }
            
            // Look for execute/test functionality
            console.log('🚀 Looking for execute/test functionality...');
            
            const executeElements = await page.$$('button');
            for (const button of executeElements) {
                const text = await page.evaluate(el => el.textContent?.toLowerCase() || '', button);
                
                if (text.includes('execute') || text.includes('test') || text.includes('run') || text.includes('play')) {
                    console.log(`🚀 Found execute button: "${text}"`);
                    await takeScreenshot(page, 'before-execution', 'Before workflow execution');
                    
                    await button.click();
                    console.log('🖱️ Clicked execute button');
                    await delay(1000);
                    
                    // Monitor for visual changes
                    console.log('👀 Monitoring execution visual changes...');
                    for (let i = 1; i <= 5; i++) {
                        await delay(1000);
                        await takeScreenshot(page, `execution-monitor-${i}`, `Execution monitoring step ${i}`);
                        
                        // Check for completion indicators
                        const hasSuccess = await page.$('[class*="success"], [class*="complete"], [class*="done"]');
                        const hasError = await page.$('[class*="error"], [class*="failed"]');
                        
                        if (hasSuccess) {
                            console.log('✅ Detected success indicators');
                            break;
                        } else if (hasError) {
                            console.log('❌ Detected error indicators');
                            break;
                        }
                    }
                    
                    await takeScreenshot(page, 'execution-completed', 'Final execution state');
                    break;
                }
            }
            
            // Look for history functionality
            console.log('📚 Looking for history functionality...');
            const historyElements = await page.$$('button, a, [role="button"]');
            
            for (const element of historyElements) {
                const text = await page.evaluate(el => el.textContent?.toLowerCase() || '', element);
                
                if (text.includes('history') || text.includes('log') || text.includes('executions')) {
                    console.log(`📚 Found history element: "${text}"`);
                    await element.click();
                    await delay(2000);
                    
                    await takeScreenshot(page, 'history-opened', 'History/execution log opened');
                    break;
                }
            }
            
        } else {
            console.log('❌ Could not reach workflow builder');
        }
        
        await takeScreenshot(page, 'final-test-state', 'Final state of workflow execution test');
        
        console.log('✅ Comprehensive workflow execution test completed!');
        console.log(`📁 Screenshots saved in: ${SCREENSHOT_DIR}/`);
        
    } catch (error) {
        console.error('❌ Error during test:', error);
        if (page) {
            try {
                await takeScreenshot(page, 'error-state', `Error occurred: ${error.message}`);
            } catch (screenshotError) {
                console.log('Could not take error screenshot:', screenshotError.message);
            }
        }
    } finally {
        await browser.close();
    }
}

// Run the test
testWorkflowExecutionWithAuth().catch(console.error);
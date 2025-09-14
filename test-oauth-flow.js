import { chromium } from 'playwright';
import path from 'path';

async function testOAuthConnectionFlow() {
    console.log('Starting OAuth connection flow test...');
    console.log('Using Google Chrome browser as specified in PLAYWRIGHT.md');
    
    // Launch Google Chrome (NOT Chromium)
    const browser = await chromium.launch({ 
        headless: false,
        channel: 'chrome', // This ensures we use Google Chrome, not Chromium
        slowMo: 1000 // Add delay between actions for better observation
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    // Listen for console messages to capture OAuth, polling, and integration logs
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('oauth') || 
            text.includes('polling') || 
            text.includes('integration') || 
            text.includes('localStorage') ||
            text.includes('Connect') ||
            text.includes('modal') ||
            text.includes('error') ||
            text.includes('Error')) {
            console.log(`[CONSOLE ${msg.type().toUpperCase()}]:`, text);
        }
    });
    
    // Listen for network errors
    page.on('requestfailed', request => {
        console.log(`[NETWORK ERROR]: ${request.url()} - ${request.failure().errorText}`);
    });
    
    try {
        console.log('\n1. Navigating to localhost:3000...');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        
        // Take screenshot of initial page
        await page.screenshot({ path: 'oauth-test-1-initial-page.png', fullPage: true });
        console.log('Screenshot saved: oauth-test-1-initial-page.png');
        
        // Check if user is logged in by looking for common UI elements
        const isLoggedIn = await page.locator('text=Workflows').isVisible().catch(() => false);
        if (!isLoggedIn) {
            console.log('User appears to not be logged in. Please log in manually and restart the test.');
            await page.pause(); // This will pause execution for manual login
        }
        
        console.log('\n2. Navigating to workflows page...');
        await page.goto('http://localhost:3000/workflows', { waitUntil: 'networkidle' });
        
        // Look for existing workflows or create new one
        const createWorkflowButton = page.locator('text=Create Workflow').first();
        const existingWorkflows = page.locator('[data-testid="workflow-card"], .workflow-card').first();
        
        if (await createWorkflowButton.isVisible()) {
            console.log('Creating new workflow...');
            await createWorkflowButton.click();
            await page.waitForURL('**/workflows/builder/**');
        } else if (await existingWorkflows.isVisible()) {
            console.log('Opening existing workflow...');
            await existingWorkflows.click();
            await page.waitForURL('**/workflows/builder/**');
        } else {
            console.log('Trying alternative navigation to workflow builder...');
            await page.goto('http://localhost:3000/workflows/builder', { waitUntil: 'networkidle' });
        }
        
        await page.screenshot({ path: 'oauth-test-2-workflow-builder.png', fullPage: true });
        console.log('Screenshot saved: oauth-test-2-workflow-builder.png');
        
        console.log('\n3. Looking for Add Action button...');
        // Try multiple selectors for Add Action button
        const addActionSelectors = [
            'text=Add Action',
            'button:has-text("Add Action")',
            '[data-testid="add-action"]',
            '.add-action-button',
            'text=+ Action',
            'text=Add an Action'
        ];
        
        let addActionButton = null;
        for (const selector of addActionSelectors) {
            addActionButton = page.locator(selector).first();
            if (await addActionButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log(`Found Add Action button with selector: ${selector}`);
                break;
            }
        }
        
        if (!addActionButton || !(await addActionButton.isVisible())) {
            console.log('Add Action button not found. Taking screenshot for debugging...');
            await page.screenshot({ path: 'oauth-test-debug-no-add-action.png', fullPage: true });
            console.log('Available buttons on page:');
            const buttons = await page.locator('button').all();
            for (const button of buttons) {
                const text = await button.textContent().catch(() => '');
                if (text.trim()) console.log(`  - "${text.trim()}"`);
            }
            return;
        }
        
        console.log('Clicking Add Action button...');
        await addActionButton.click();
        
        // Wait for modal to appear
        await page.waitForSelector('[role="dialog"], .modal, [data-testid="action-modal"]', { timeout: 10000 });
        
        await page.screenshot({ path: 'oauth-test-3-action-modal-open.png', fullPage: true });
        console.log('Screenshot saved: oauth-test-3-action-modal-open.png');
        
        console.log('\n4. Looking for Notion integration Connect button...');
        
        // Look for Notion integration specifically
        const notionSection = page.locator('text=Notion').first();
        await notionSection.scrollIntoViewIfNeeded();
        
        // Try to find Connect button for Notion
        const notionConnectButton = page.locator('text=Notion').locator('..').locator('text=Connect').first();
        
        if (await notionConnectButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('Found Notion Connect button, clicking...');
            
            // Listen for popup events
            let popupPromise = null;
            page.on('popup', popup => {
                console.log('[POPUP OPENED]: OAuth popup detected');
                popupPromise = popup;
            });
            
            await notionConnectButton.click();
            
            // Wait a moment for popup to potentially open
            await page.waitForTimeout(2000);
            
            if (popupPromise) {
                console.log('OAuth popup opened successfully');
                await page.waitForTimeout(3000); // Let it load
                await popupPromise.close();
                console.log('Closed OAuth popup manually as instructed');
            } else {
                console.log('No popup detected - checking console for OAuth URL or errors');
            }
            
            await page.screenshot({ path: 'oauth-test-4-after-notion-connect.png', fullPage: true });
            console.log('Screenshot saved: oauth-test-4-after-notion-connect.png');
        } else {
            console.log('Notion Connect button not found. Looking for available integrations...');
            const integrations = await page.locator('[data-testid*="integration"], .integration-card, text=Connect').all();
            console.log(`Found ${integrations.length} integration elements`);
            
            for (let i = 0; i < Math.min(integrations.length, 10); i++) {
                const text = await integrations[i].textContent().catch(() => '');
                console.log(`  Integration ${i + 1}: "${text.trim()}"`);
            }
        }
        
        console.log('\n5. Looking for Trello integration Connect button...');
        
        // Look for Trello integration
        const trelloSection = page.locator('text=Trello').first();
        if (await trelloSection.isVisible({ timeout: 3000 }).catch(() => false)) {
            await trelloSection.scrollIntoViewIfNeeded();
            
            const trelloConnectButton = page.locator('text=Trello').locator('..').locator('text=Connect').first();
            
            if (await trelloConnectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
                console.log('Found Trello Connect button, clicking...');
                
                let secondPopupPromise = null;
                page.on('popup', popup => {
                    console.log('[SECOND POPUP OPENED]: Second OAuth popup detected');
                    secondPopupPromise = popup;
                });
                
                await trelloConnectButton.click();
                
                // Wait for potential popup
                await page.waitForTimeout(2000);
                
                if (secondPopupPromise) {
                    console.log('Second OAuth popup opened successfully');
                    await page.waitForTimeout(3000);
                    await secondPopupPromise.close();
                    console.log('Closed second OAuth popup manually');
                } else {
                    console.log('No second popup detected');
                }
                
                await page.screenshot({ path: 'oauth-test-5-after-trello-connect.png', fullPage: true });
                console.log('Screenshot saved: oauth-test-5-after-trello-connect.png');
            } else {
                console.log('Trello Connect button not found');
            }
        } else {
            console.log('Trello integration not found in modal');
        }
        
        console.log('\n6. Monitoring for additional console messages...');
        await page.waitForTimeout(5000); // Wait to see if any polling messages appear
        
        console.log('\n7. Checking modal state and UI behavior...');
        
        // Check if modal is still responsive
        const modalVisible = await page.locator('[role="dialog"], .modal').isVisible().catch(() => false);
        console.log(`Modal still visible: ${modalVisible}`);
        
        if (modalVisible) {
            // Try to interact with modal (scroll, click other elements)
            await page.locator('[role="dialog"], .modal').first().hover();
            console.log('Modal appears responsive to hover');
        }
        
        await page.screenshot({ path: 'oauth-test-6-final-state.png', fullPage: true });
        console.log('Screenshot saved: oauth-test-6-final-state.png');
        
        console.log('\nTest completed. Check console output above for OAuth, polling, and integration messages.');
        console.log('Screenshots saved for review:');
        console.log('- oauth-test-1-initial-page.png');
        console.log('- oauth-test-2-workflow-builder.png');
        console.log('- oauth-test-3-action-modal-open.png');
        console.log('- oauth-test-4-after-notion-connect.png');
        console.log('- oauth-test-5-after-trello-connect.png');
        console.log('- oauth-test-6-final-state.png');
        
    } catch (error) {
        console.error('\nTest failed with error:', error.message);
        await page.screenshot({ path: 'oauth-test-error.png', fullPage: true });
        console.log('Error screenshot saved: oauth-test-error.png');
    } finally {
        // Keep browser open for manual inspection
        console.log('\nBrowser will remain open for manual inspection. Close when done.');
        // await browser.close();
    }
}

// Run the test
testOAuthConnectionFlow().catch(console.error);
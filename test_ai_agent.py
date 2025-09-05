from playwright.sync_api import sync_playwright
import time

def test_ai_agent_multiple_actions():
    with sync_playwright() as p:
        # Launch Chromium browser
        browser = p.chromium.launch(headless=False, args=['--start-maximized'])
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()
        
        try:
            print('=== STEP 1: Navigating to http://localhost:3000 ===')
            page.goto('http://localhost:3000', wait_until='networkidle')
            time.sleep(3)
            
            # Check if already logged in or need to login
            if page.locator('text=Sign in').is_visible(timeout=3000) or page.locator('input[type="email"]').is_visible(timeout=3000):
                print('=== STEP 2: Logging in with provided credentials ===')
                page.fill('input[type="email"]', 'stoddard.nathaniel900@gmail.com')
                page.fill('input[type="password"]', 'Muhammad77!1')
                page.click('button:has-text("Sign in")')
                page.wait_for_load_state('networkidle')
                time.sleep(3)
            else:
                print('=== STEP 2: Already logged in, proceeding ===')
            
            print('=== STEP 3: Navigating to workflows page ===')
            # Try multiple ways to get to workflows
            if page.locator('a:has-text("Workflows")').is_visible():
                page.locator('a:has-text("Workflows")').click()
            elif page.locator('text=Workflows').is_visible():
                page.locator('text=Workflows').click()
            else:
                page.goto('http://localhost:3000/workflows', wait_until='networkidle')
            
            time.sleep(3)
            
            print('=== STEP 4: Looking for existing workflow ===')
            # Check for existing workflows
            workflow_cards = page.locator('.workflow-card, [data-testid*="workflow"], a[href*="/workflows/"]')
            workflow_links = page.locator('a[href*="/workflows/"]')
            
            if workflow_cards.count() > 0:
                print(f'Found {workflow_cards.count()} workflow card(s), clicking the first one...')
                workflow_cards.first.click()
                page.wait_for_load_state('networkidle')
                time.sleep(3)
            elif workflow_links.count() > 0:
                print(f'Found {workflow_links.count()} workflow link(s), clicking the first one...')
                workflow_links.first.click()
                page.wait_for_load_state('networkidle')
                time.sleep(3)
            else:
                print('No existing workflows found, looking for create button...')
                create_selectors = [
                    'button:has-text("Create")',
                    'button:has-text("New Workflow")', 
                    'button:has-text("+ New")',
                    '[data-testid="create-workflow"]',
                    '.create-workflow-btn'
                ]
                
                created = False
                for selector in create_selectors:
                    if page.locator(selector).is_visible():
                        print(f'Clicking create button: {selector}')
                        page.locator(selector).click()
                        time.sleep(2)
                        created = True
                        break
                
                if not created:
                    print('Could not find create workflow button')
                    return
            
            print('=== STEP 5: Looking for AI Agent node ===')
            # Look for AI Agent node
            ai_agent_selectors = [
                'text="AI Agent"',
                '.react-flow__node:has-text("AI Agent")',
                '[data-testid*="ai-agent"]',
                '.node:has-text("AI Agent")'
            ]
            
            ai_agent_found = False
            for selector in ai_agent_selectors:
                ai_agent_node = page.locator(selector).first
                if ai_agent_node.is_visible():
                    print(f'Found AI Agent node with selector: {selector}')
                    ai_agent_node.click()
                    time.sleep(2)
                    ai_agent_found = True
                    break
            
            if not ai_agent_found:
                print('AI Agent node not found, trying to add one...')
                add_node_selectors = [
                    'button:has-text("Add Node")',
                    'button:has-text("+")',
                    '[data-testid="add-node"]'
                ]
                
                for selector in add_node_selectors:
                    if page.locator(selector).is_visible():
                        page.locator(selector).click()
                        time.sleep(1)
                        
                        # Look for AI Agent in selection
                        if page.locator('text="AI Agent"').is_visible():
                            page.locator('text="AI Agent"').click()
                            time.sleep(2)
                            ai_agent_found = True
                            break
                
                if not ai_agent_found:
                    print('Could not find or create AI Agent node')
                    return
            
            print('=== STEP 6: Checking AI Agent configuration modal ===')
            # Wait for modal to appear
            modal_selectors = [
                '[role="dialog"]',
                '.modal',
                '[data-testid*="modal"]',
                '.ai-agent-modal'
            ]
            
            modal_found = False
            for selector in modal_selectors:
                if page.locator(selector).is_visible(timeout=5000):
                    print(f'Modal found with selector: {selector}')
                    modal_found = True
                    break
            
            if not modal_found:
                print('Modal not visible, clicking AI Agent node again...')
                if page.locator('text="AI Agent"').is_visible():
                    page.locator('text="AI Agent"').click()
                    time.sleep(3)
            
            print('=== STEP 7: Analyzing existing chains and actions ===')
            # Count existing actions
            action_selectors = [
                '[data-testid*="action"]',
                '.action-item',
                '.action-card',
                '.chain-action'
            ]
            
            total_actions = 0
            for selector in action_selectors:
                count = page.locator(selector).count()
                if count > 0:
                    total_actions = max(total_actions, count)
                    print(f'Found {count} actions with selector: {selector}')
            
            print(f'Total existing actions found: {total_actions}')
            
            # Look for Gmail action specifically
            gmail_found = False
            if page.locator('text*="Gmail"').is_visible() or page.locator('[data-testid*="gmail"]').is_visible():
                print('Gmail action found in existing chain')
                gmail_found = True
            
            print('=== STEP 8: Adding second action to the chain ===')
            # Look for Add Action button
            add_action_selectors = [
                'button:has-text("Add Action")',
                'button:has-text("+")',
                '[data-testid*="add-action"]',
                '.add-action-btn'
            ]
            
            action_added = False
            for selector in add_action_selectors:
                add_btn = page.locator(selector)
                if add_btn.count() > 0:
                    print(f'Found {add_btn.count()} Add Action button(s) with selector: {selector}')
                    # Click the last one (should be at the end of the chain)
                    add_btn.last.click()
                    time.sleep(2)
                    
                    # Try to select Slack
                    if page.locator('text*="Slack"').is_visible():
                        print('Selecting Slack action...')
                        page.locator('text*="Slack"').first.click()
                        time.sleep(1)
                        
                        # Look for Send Message
                        if page.locator('text*="Send Message"').is_visible():
                            page.locator('text*="Send Message"').first.click()
                            time.sleep(2)
                            action_added = True
                        
                    # If Slack not available, try Discord
                    elif page.locator('text*="Discord"').is_visible():
                        print('Selecting Discord action...')
                        page.locator('text*="Discord"').first.click()
                        time.sleep(1)
                        
                        if page.locator('text*="Send Message"').is_visible():
                            page.locator('text*="Send Message"').first.click()
                            time.sleep(2)
                            action_added = True
                    
                    break
            
            if action_added:
                print('Successfully added second action')
                # Try to configure and save
                save_selectors = [
                    'button:has-text("Save")',
                    'button:has-text("Add Action")',
                    'button:has-text("Done")'
                ]
                
                for selector in save_selectors:
                    if page.locator(selector).is_visible():
                        page.locator(selector).click()
                        time.sleep(2)
                        break
            
            print('=== STEP 9: Checking final state ===')
            # Count actions again
            final_total_actions = 0
            for selector in action_selectors:
                count = page.locator(selector).count()
                if count > 0:
                    final_total_actions = max(final_total_actions, count)
            
            print(f'Final action count: {final_total_actions}')
            print(f'Actions added successfully: {final_total_actions > total_actions}')
            
            print('=== STEP 10: Attempting to add third action ===')
            # Try to add a third action
            for selector in add_action_selectors:
                add_btn = page.locator(selector)
                if add_btn.count() > 0:
                    print('Clicking Add Action again for third action...')
                    add_btn.last.click()
                    time.sleep(2)
                    
                    # Try different service
                    if page.locator('text*="Notion"').is_visible():
                        print('Adding Notion action as third action...')
                        page.locator('text*="Notion"').first.click()
                        time.sleep(1)
                        
                        if page.locator('text*="Create"').is_visible():
                            page.locator('text*="Create"').first.click()
                            time.sleep(2)
                            
                            # Save
                            for save_selector in save_selectors:
                                if page.locator(save_selector).is_visible():
                                    page.locator(save_selector).click()
                                    time.sleep(2)
                                    break
                    break
            
            # Final count
            third_total_actions = 0
            for selector in action_selectors:
                count = page.locator(selector).count()
                if count > 0:
                    third_total_actions = max(third_total_actions, count)
            
            print(f'Final action count after third addition: {third_total_actions}')
            
            print('=== TEST SUMMARY ===')
            print(f'Initial actions: {total_actions}')
            print(f'After second action: {final_total_actions}')  
            print(f'After third action: {third_total_actions}')
            print(f'Successfully added multiple actions: {third_total_actions > total_actions}')
            
            print('Test completed! Browser will remain open for inspection...')
            input('Press Enter to close browser...')
            
        except Exception as e:
            print(f'Error during test: {str(e)}')
            import traceback
            traceback.print_exc()
            input('Press Enter to close browser...')
            
        finally:
            browser.close()

# Run the test
if __name__ == "__main__":
    test_ai_agent_multiple_actions()
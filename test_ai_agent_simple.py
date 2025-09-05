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
            
            # Check if we need to login by looking for email input
            if page.locator('input[type="email"]').count() > 0:
                print('=== STEP 2: Logging in with provided credentials ===')
                page.fill('input[type="email"]', 'stoddard.nathaniel900@gmail.com')
                page.fill('input[type="password"]', 'Muhammad77!1')
                # Click the first sign in button
                page.locator('button:has-text("Sign in")').first.click()
                page.wait_for_load_state('networkidle')
                time.sleep(3)
            else:
                print('=== STEP 2: Already logged in, proceeding ===')
            
            print('=== STEP 3: Navigating to workflows page ===')
            # Direct navigation to workflows
            page.goto('http://localhost:3000/workflows', wait_until='networkidle')
            time.sleep(3)
            
            print('=== STEP 4: Looking for existing workflow ===')
            # Look for workflow links more broadly
            workflow_links = page.locator('a').filter(has=page.locator('text*="workflow"'))
            direct_workflow_links = page.locator('a[href*="/workflows/"]')
            
            found_workflow = False
            if direct_workflow_links.count() > 0:
                print(f'Found {direct_workflow_links.count()} direct workflow links')
                # Click the first workflow that's not just /workflows
                for i in range(direct_workflow_links.count()):
                    href = direct_workflow_links.nth(i).get_attribute('href')
                    if href and href != '/workflows' and '/workflows/' in href:
                        print(f'Clicking workflow: {href}')
                        direct_workflow_links.nth(i).click()
                        page.wait_for_load_state('networkidle')
                        time.sleep(3)
                        found_workflow = True
                        break
            
            if not found_workflow:
                print('No specific workflow found, trying to create one or look for workflow elements')
                # Try to find any clickable workflow element
                workflow_cards = page.locator('.workflow-card, [data-testid*="workflow"]')
                if workflow_cards.count() > 0:
                    workflow_cards.first.click()
                    time.sleep(3)
                    found_workflow = True
            
            if not found_workflow:
                print('Could not find workflow, test will end here')
                return
            
            print('=== STEP 5: Looking for AI Agent node ===')
            time.sleep(2)  # Wait for page to fully load
            
            # Look for AI Agent node with more specific selectors
            ai_agent_found = False
            
            # Try different approaches to find AI Agent
            selectors_to_try = [
                '.react-flow__node:has-text("AI Agent")',
                '[data-node-type*="ai"], [data-node-type*="AI"]',
                '.node-ai-agent',
                'text="AI Agent"',
                '[title*="AI Agent"]'
            ]
            
            for selector in selectors_to_try:
                elements = page.locator(selector)
                if elements.count() > 0:
                    print(f'Found AI Agent with selector: {selector}')
                    elements.first.click()
                    time.sleep(2)
                    ai_agent_found = True
                    break
            
            if not ai_agent_found:
                print('AI Agent node not found. Searching for any nodes with "Agent" text...')
                agent_nodes = page.locator('text*="Agent"')
                if agent_nodes.count() > 0:
                    print(f'Found {agent_nodes.count()} nodes with "Agent" text')
                    agent_nodes.first.click()
                    time.sleep(2)
                    ai_agent_found = True
            
            if not ai_agent_found:
                print('No AI Agent node found. Looking for any modal or configuration panel...')
                # Maybe there's already a configuration modal open
                modals = page.locator('[role="dialog"], .modal')
                if modals.count() > 0:
                    print(f'Found {modals.count()} existing modals')
                    ai_agent_found = True
            
            if not ai_agent_found:
                print('Could not locate AI Agent node or configuration')
                return
            
            print('=== STEP 6: Checking for configuration modal ===')
            time.sleep(2)
            
            # Look for modal
            modal = page.locator('[role="dialog"]').first
            if not modal.is_visible():
                print('Modal not visible, looking for any configuration panel...')
                config_panels = page.locator('.config, .configuration, .settings')
                if config_panels.count() > 0:
                    print(f'Found {config_panels.count()} configuration panels')
                else:
                    print('No configuration interface found')
                    return
            else:
                print('Configuration modal found')
            
            print('=== STEP 7: Looking for existing actions and chains ===')
            
            # Look for any existing actions or chains
            action_elements = page.locator('[data-testid*="action"], .action, .chain-action, text*="Gmail", text*="Slack", text*="Discord"')
            print(f'Found {action_elements.count()} potential action elements')
            
            # Look for Add Action buttons
            add_action_buttons = page.locator('button:has-text("Add Action"), button:has-text("+"), .add-action')
            print(f'Found {add_action_buttons.count()} Add Action buttons')
            
            if add_action_buttons.count() > 0:
                print('=== STEP 8: Attempting to add an action ===')
                add_action_buttons.first.click()
                time.sleep(2)
                
                # Look for service selection
                services = page.locator('text*="Gmail", text*="Slack", text*="Discord", text*="Notion"')
                print(f'Found {services.count()} available services')
                
                if services.count() > 0:
                    # Try to select a service
                    services.first.click()
                    time.sleep(2)
                    
                    # Look for action types
                    actions = page.locator('text*="Send", text*="Create", text*="Message"')
                    if actions.count() > 0:
                        actions.first.click()
                        time.sleep(2)
                        print('Successfully selected an action')
                        
                        # Try to save
                        save_buttons = page.locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Done")')
                        if save_buttons.count() > 0:
                            save_buttons.first.click()
                            time.sleep(2)
                            print('Action saved')
                        
                        # Try to add another action
                        print('=== STEP 9: Attempting to add second action to same chain ===')
                        time.sleep(1)
                        
                        # Look for Add Action button again
                        new_add_buttons = page.locator('button:has-text("Add Action"), button:has-text("+")')
                        if new_add_buttons.count() > 0:
                            new_add_buttons.last.click()  # Click the last one (should be after first action)
                            time.sleep(2)
                            
                            # Try different service
                            remaining_services = page.locator('text*="Slack", text*="Discord", text*="Notion"')
                            if remaining_services.count() > 0:
                                remaining_services.first.click()
                                time.sleep(1)
                                
                                remaining_actions = page.locator('text*="Send", text*="Create", text*="Message"')
                                if remaining_actions.count() > 0:
                                    remaining_actions.first.click()
                                    time.sleep(2)
                                    
                                    # Save second action
                                    save_buttons = page.locator('button:has-text("Save"), button:has-text("Add")')
                                    if save_buttons.count() > 0:
                                        save_buttons.first.click()
                                        time.sleep(2)
                                        print('Second action added successfully!')
                                        
                                        # Count final actions
                                        final_actions = page.locator('[data-testid*="action"], .action, .chain-action')
                                        print(f'Total actions in chain: {final_actions.count()}')
                                        
                                        if final_actions.count() >= 2:
                                            print('SUCCESS: Multiple actions added to the same chain!')
                                        else:
                                            print('WARNING: Could not confirm multiple actions in chain')
                                    else:
                                        print('Could not find save button for second action')
                                else:
                                    print('No action types found for second service')
                            else:
                                print('No additional services found for second action')
                        else:
                            print('No Add Action button found for second action')
                    else:
                        print('No action types found')
                else:
                    print('No services found in action selection')
            else:
                print('No Add Action buttons found')
            
            print('=== TEST COMPLETED ===')
            print('Browser will remain open for manual inspection...')
            print('Please manually verify:')
            print('1. Can you see multiple actions in the same chain?')
            print('2. Are the actions properly connected/chained?')
            print('3. Can you add more actions to the same chain?')
            
            # Keep browser open for manual inspection
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
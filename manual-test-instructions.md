# Manual Workflow Test Instructions

## Chrome has been opened to http://localhost:3000

Please follow these steps to test the workflow execution:

### 1. Login (if needed)
- If you see a login page, enter your credentials
- Or click "Sign in with Google" if available

### 2. Navigate to Workflows
- Click on "Workflows" in the sidebar or navigation
- You should see your list of workflows

### 3. Create New Workflow
- Click the "Create Workflow" or "New Workflow" button
- Or click the "+" button if available

### 4. Add Manual Trigger
- In the workflow builder, click "Add Trigger" or right-click on the canvas
- Select "Manual" from the trigger options
- This creates a manual trigger node

### 5. Add a Simple Action
- Click "Add Action" or right-click on the canvas
- Select "Logic" category
- Choose "Delay" action
- Configure the delay (e.g., 5 seconds)
- Connect the Manual trigger to the Delay action by dragging from one to the other

### 6. Save the Workflow
- Click the "Save" button
- Give your workflow a name if prompted

### 7. Test Execution
- Click the **"Test"** button (previously labeled "Listen")
- This should start the workflow execution

### 8. Observe Visual Changes
Watch for these visual indicators:
- **Gray/White**: Node is pending/waiting
- **Blue/Yellow**: Node is currently executing
- **Green**: Node completed successfully
- **Red**: Node failed

The nodes should change color as the workflow executes:
1. Manual trigger should turn blue/yellow when executing
2. Then turn green when complete
3. Delay node should then turn blue/yellow
4. After the delay, it should turn green

### 9. Check History
- Look for the **"History"** button in the toolbar
- Click it to see execution history
- You should see your recent execution listed
- Click the eye icon to view details
- Check if AI field resolutions are shown (if any AI fields were used)

## What to Verify

✅ **Test** button is present (not "Listen")
✅ Manual trigger can be added
✅ Actions can be connected to the trigger
✅ Workflow saves successfully
✅ **Test** button starts execution
✅ Nodes show color changes during execution:
   - Pending (gray/white)
   - Executing (blue/yellow)
   - Complete (green)
✅ History button is visible
✅ Execution history shows recent runs
✅ Execution details can be viewed

## Troubleshooting

If you encounter issues:
1. Check the browser console (F12) for errors
2. Ensure the dev server is running (npm run dev)
3. Try refreshing the page
4. Check if you're logged in properly

## Report Results

After testing, please confirm:
1. Were you able to create a workflow with manual trigger?
2. Did the Test button work?
3. Did you see visual color changes on nodes during execution?
4. Was the History button visible and functional?
5. Any errors encountered?
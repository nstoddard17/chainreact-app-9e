# AI Agent FitView Test Guide

## Test Scenario: AI Agent with No Actions (Only Placeholder)

### Steps to Test:

1. **Open the workflow builder**
   - Navigate to an existing workflow or create a new one
   - Open browser console (F12) to see debug logs

2. **Add an AI Agent node**
   - Click "Add Action" or use the action selection dialog
   - Select "AI Agent" from the list
   - **DO NOT add any actions** - just save it empty

3. **Save the AI Agent**
   - Click Save/Confirm without adding any chain actions
   - This should trigger the "no chains" path

### Expected Console Output:

You should see logs similar to:
```
🔴 [AI Agent Save] Saving with 0 nodes in placeholder mode
🔍 [AI Agent Save] Node filter check: {...}  (for each node if any)
🔵 [AI Agent Save] Processing after save: {
  hasChains: false,
  actualActionNodesLength: 0,
  shouldAddPlaceholder: true
}
📊 [AI Agent Save] Branch decision: NO CHAINS (else block - will add placeholder and fitView)
📌 [AI Agent Save] ELSE BLOCK: No chains - adding placeholder
📌 [AI Agent Save] Using delay time: 300 ms (for new nodes)
📌 [AI Agent Save] TIMEOUT FIRED after 300 ms
📌 [Chain Placeholder] setNodes called
✅ [Chain Placeholder] Added chain placeholder node successfully
✅ [Edge] Added edge successfully
⏰ [AI Agent Save] Setting timeout to call performFitView in 150ms
🎯 [FitView] performFitView called
🔄 [FitView] Attempt 1/10
🔍 [FitView] Status check:
  - AI Agent present: true
  - Chain Placeholder present: true
  - fitView function available: true
✅ [FitView] All conditions met, performing fitView
🎬 [FitView] Calling fitView with params
✅ [FitView] fitView completed successfully for chain placeholder
```

### What Should Happen Visually:

1. **AI Agent node** is added to the workflow
2. **Chain placeholder** ("Add Chain" button) appears below the AI Agent
3. **The view automatically adjusts** to center on the AI Agent and placeholder
4. The zoom level should be appropriate (not too close, not too far)

### Troubleshooting:

If fitView doesn't work:
- Check if logs show `hasChains: true` when it should be `false` - this indicates the filtering isn't working
- Check if `Chain Placeholder present: false` - the placeholder might not be added
- Check if `fitView function available: false` - there might be a scope issue

### Success Indicators:
✅ Console shows "NO CHAINS (else block)" branch decision
✅ Chain placeholder is added below AI Agent
✅ View automatically centers on the nodes
✅ FitView completion message appears in console
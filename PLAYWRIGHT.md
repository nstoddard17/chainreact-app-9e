# Playwright Testing Guidelines

This document defines the standards and best practices for using Playwright to test the ChainReact application.

## Browser Configuration

### Default Browser Settings
- **ALWAYS use the default system browser** - Do not specify a specific browser unless explicitly requested
- The user will handle authentication manually before testing begins
- Never attempt to automate login or accept real credentials

### Browser Launch Configuration
```javascript
// Correct approach - uses default browser
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/workflows/builder' });

// Incorrect - do not specify browser type
// await playwright.chromium.launch() // DON'T DO THIS
```

## Testing Environments

### Local Development Testing
By default, all tests run on the local development server:
```javascript
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/workflows/builder' });
```

### Production/Live Version Testing
When the user requests testing on the production or live version:
- **Replace `localhost:3000` with `chainreact.app`** for all URLs
- Test all functionality to ensure it works correctly on the live environment
- Pay special attention to:
  - API endpoints working correctly
  - Authentication and authorization
  - Integration connections
  - Real-time features
  - Performance differences between local and production

```javascript
// Production testing - when requested by user
await mcp__playwright__browser_navigate({ url: 'https://chainreact.app/workflows/builder' });
```

### Important Production Testing Notes
- The production environment may have different:
  - Rate limits
  - Caching mechanisms
  - API response times
  - Security configurations
- Always document any differences observed between local and production behavior
- Report any production-only issues immediately
- Never use test data that could affect real users on production

## Testing Principles

### 1. Always Test From Scratch
When testing any feature, especially workflow actions/triggers:
- **DELETE existing configurations first**
- Start with a clean slate
- Test the complete flow from beginning to end
- Verify all steps work for a new user

### 2. Workflow Modal Testing Protocol
When testing action/trigger modals:

#### Step 1: Clean Setup
```
1. Navigate to workflow builder
2. Delete any existing trigger/action nodes
3. Start with an empty workflow
4. Document initial state
```

#### Step 2: Fresh Node Addition
```
1. Add new trigger/action from scratch
2. Open configuration modal
3. Test all field interactions
4. Monitor console for errors
```

#### Step 3: Field Testing
```
1. Test field loading performance
2. Verify dynamic field dependencies
3. Check for stuck or slow-loading fields
4. Ensure proper error handling
```

#### Step 4: Save and Reload Testing
```
1. Fill all required fields
2. Save configuration
3. Close modal
4. Reopen modal
5. Verify saved values display correctly (not placeholders like "Saved Value" or "Loading...")
```

#### Step 5: Edge Cases
```
1. Test with empty/invalid values
2. Test field clearing and re-selection
3. Test modal cancellation
4. Test with different combinations of selections
```

## Testing Checklist

### Before Starting Any Test
- [ ] Ensure application is running locally
- [ ] User has logged in manually
- [ ] Clear any test data from previous sessions
- [ ] Open browser developer console to monitor errors

### During Modal Testing
- [ ] Delete existing nodes before testing
- [ ] Test fresh node creation
- [ ] Monitor field loading times
- [ ] Check for console errors
- [ ] Verify all dropdowns populate
- [ ] Test field dependencies work correctly
- [ ] Save and verify persistence
- [ ] Reopen and verify saved values display

### After Testing
- [ ] Document any issues found
- [ ] Note any slow-loading fields
- [ ] Record any console errors
- [ ] Clean up test data if needed

## Common Testing Scenarios

### Discord Integration Testing
```
1. Delete any existing Discord triggers
2. Add fresh "New Message in Channel" trigger
3. Select Discord server - verify channels load
4. Select channel - verify user list loads (if applicable)
5. Save configuration
6. Reopen - verify server/channel names display (not placeholders)
7. Fix any loading issues encountered during testing
```

### Airtable Integration Testing
```
1. Delete existing Airtable actions
2. Add fresh Airtable action
3. Select base - verify tables load
4. Select table - verify fields load
5. Test field value inputs
6. Save and verify persistence
```

### Gmail Integration Testing
```
1. Delete existing Gmail actions
2. Add fresh Gmail action
3. Test recipient field
4. Test subject/body fields
5. Test attachment handling if applicable
6. Save and verify all values persist correctly
```

## Error Handling

### When Encountering Errors
1. **Fix errors immediately** - Users will encounter the same issues
2. Document the error and fix in code comments
3. Test the fix by starting from scratch again
4. Ensure fix doesn't break other functionality

### Common Issues to Watch For
- Empty value errors in Select components
- Stuck loading states
- Field dependencies not triggering
- Saved values showing as placeholders
- Console errors during field interactions
- Slow API responses

## Performance Testing

### Field Loading Performance
- Fields should load within 2-3 seconds maximum
- Loading indicators must show while data is fetching
- No fields should remain stuck in loading state
- Implement proper timeout handling

### Modal Responsiveness
- Modal should open within 1 second
- Field interactions should feel instant
- Saving should complete within 2 seconds
- No UI freezing during operations

## Best Practices

### DO:
- ✅ Test with live versions, not test pages
- ✅ Fix errors as you find them
- ✅ Start fresh for each test scenario
- ✅ Verify saved values display correctly
- ✅ Monitor browser console throughout
- ✅ Test complete user workflows
- ✅ Clean up test data after testing

### DON'T:
- ❌ Create separate test pages
- ❌ Skip the "start from scratch" step
- ❌ Ignore console errors
- ❌ Test with pre-existing configurations only
- ❌ Assume saved values will display correctly
- ❌ Use hardcoded test credentials
- ❌ Leave test data in the system

## Documentation Requirements

### When Adding New Test Scenarios
Always update this document with:
1. The new scenario name
2. Step-by-step testing procedure
3. Expected outcomes
4. Common issues to watch for
5. Any special configuration needed

### Test Result Documentation
After each test session, document:
- Date and time of test
- Features tested
- Issues found and fixed
- Performance observations
- Recommendations for improvement

## Future Testing Expansions

As new features are added, ensure testing covers:
- New integration types
- New workflow node types
- New field types
- New UI components
- API performance
- Real-time collaboration features
- Error recovery scenarios

---

**Last Updated:** January 2025
**Version:** 1.0

**Note:** This document should be continuously updated as testing requirements evolve and new patterns are established.
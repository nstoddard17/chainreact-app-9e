# Automated Integration Testing System

## Overview

The automated integration testing system allows you to test all actions and triggers across all 20+ integrations without manual configuration. It uses a hybrid approach: auto-generates test data where possible, and prompts for manual input when dynamic fields can't be loaded automatically.

**New Features (2025-01-10):**
- ✅ **Selective Testing** - Choose specific tests to run via checkboxes
- ✅ **Test Data Presets** - Save and load test configurations for quick reuse
- ✅ **Dry Run Mode** - Validate configurations without executing tests

## How It Works

### 1. **Auto-Discovery**
The system automatically discovers all testable integrations by analyzing `availableNodes.ts`:
- Finds all actions and triggers
- Extracts required fields from config schemas
- Groups by provider

Files:
- `/lib/workflows/test-utils/auto-discover-tests.ts` - Discovery logic
- `/app/api/admin/integration-providers/route.ts` - API endpoint

### 2. **Smart Test Data Generation**
The system generates appropriate test values for each field type:

**Priority Order:**
1. **User-provided values** - Values you manually enter (email, message, etc.)
2. **Dynamic field loading** - Attempts to load real data from your connected account
3. **Smart field name detection** - Recognizes patterns like "channel", "user", "email"
4. **Field type fallback** - Uses type-based defaults

**Example for Discord "Send Message":**
```typescript
{
  channelId: "<auto-loaded-from-your-discord-account>",
  message: "Test message from ChainReact automated integration test",
  username: "test-user",
  embedTitle: "Test Item",
  embedDescription: "Test description for automated integration testing",
  embedColor: "#0066cc",
  embedUrl: "https://example.com/test"
}
```

Files:
- `/app/api/admin/test-integration/route.ts` - Test runner with data generation

### 3. **Dynamic Field Loading**
For fields marked with `dynamic` property (e.g., `dynamic: 'discord_channels'`):

**Automatic Flow:**
```
1. Test runner calls buildTestConfig()
2. Detects field has `dynamic` property
3. Calls loadDynamicFieldValue()
4. Fetches from `/api/integrations/[provider]/data?type=discord_channels`
5. Returns first available option
6. If fetch fails → Falls back to generated default value
```

**Example:**
```typescript
// Field definition
{
  name: 'channelId',
  type: 'combobox',
  dynamic: 'discord_channels', // ← Triggers dynamic loading
  required: true
}

// System attempts to fetch channels from your Discord account
// If successful → Uses real channel ID
// If fails → Uses fallback value or shows manual input dialog
```

### 4. **Manual Field Input (Fallback)**
When dynamic loading fails AND field validation fails:

**Flow:**
```
1. Test runs with auto-generated data
2. Validation fails: "Missing required fields: channelId"
3. System detects error message pattern
4. Shows dialog: "Manual Field Input Required"
5. You provide the missing values
6. Test retries with your manual input
```

**Dialog Features:**
- Shows only fields that couldn't be auto-loaded
- Displays field label and type
- Shows which integration needs the value
- Validates all fields before allowing retry

Files:
- `/app/api/admin/test-fields/route.ts` - Returns field requirements
- `/app/test/apps/page.tsx` - UI with dialog

## Using the System

### Step 1: Navigate to Testing Page
```
http://localhost:3000/test/apps
```

### Step 2: Select Integration
- Dropdown auto-populates with all discovered integrations
- Shows test count (e.g., "Discord (8 tests)")

### Step 3: Check Connection Status
The page automatically checks if the integration is connected:
- ✅ **Connected** - Shows account info, ready to test
- ⚠️ **Connection Expired** - Click "Reconnect" to refresh OAuth
- ℹ️ **Not Connected** - Click "Connect" to authorize

### Step 4: (Optional) Provide Test Data
Input fields for common values:
- **Test Email** - Used for email-related fields
- **Test Message** - Used for message/content fields

All other fields are auto-generated.

### Step 5: Run Tests
Click "Run All Tests"

**What Happens:**
1. System creates test workflows in database
2. Executes each action/trigger
3. Streams results in real-time
4. Shows pass/fail with error details

**If Manual Input Needed:**
- Dialog appears with missing fields
- You provide values (e.g., channel ID, user ID)
- Click "Retry Test" to continue

### Step 6: Export Results
When tests complete, click "Export Report" to download HTML report with:
- Pass/fail statistics
- Execution times
- Error details
- Test breakdown by action/trigger

## Field Type Examples

### Smart Field Detection
```typescript
// Field name patterns recognized:
- *email* → 'test@example.com'
- *channel* → Auto-loads from API or 'test-channel'
- *user* → Auto-loads from API or 'test-user'
- *message*, *content*, *text*, *body* → 'Test message from ChainReact...'
- *title*, *subject*, *name* → 'Test Item'
- *description*, *desc* → 'Test description for automated...'
- *url*, *link* → 'https://example.com/test'
- *color*, *colour* → '#0066cc'
- *date*, *time* → Current timestamp
- *file*, *attachment* → 'test-file.txt'
- *tag*, *label* → 'test-tag' or first 2 options
- *priority* → First option or 'normal'
- *status* → First option or 'active'
```

### Field Type Fallbacks
```typescript
// When field name doesn't match pattern:
- email → 'test@example.com'
- text/textarea → 'Test value'
- number → 100
- boolean/checkbox → false
- select/combobox → First option
- multi-select → First 2 options
- date → '2025-01-10'
- datetime → '2025-01-10T12:00:00.000Z'
- time → '12:00'
- url → 'https://example.com'
- tel/phone → '+1-555-0123'
- color → '#0066cc'
```

## Integration Examples

### Example 1: Discord (Fully Automatic)
**Actions:** Send Message, Edit Message, Delete Message
**Triggers:** New Message, Message Deleted

**Flow:**
1. Select "Discord (8 tests)"
2. System auto-loads channels from your Discord account
3. All tests run automatically
4. No manual input needed ✅

### Example 2: Slack (Hybrid)
**Actions:** Post Message, Update Message
**Triggers:** New Message

**Flow:**
1. Select "Slack (6 tests)"
2. System attempts to load channels
3. If channel fetch fails:
   - Dialog shows: "channelId" field
   - You paste channel ID from Slack
   - Click "Retry Test"
4. Test completes ✅

### Example 3: Gmail (Fully Automatic)
**Actions:** Send Email
**Triggers:** New Email

**Flow:**
1. Select "Gmail (2 tests)"
2. You already provided "test@example.com" in UI
3. System uses your input for "to" field
4. All tests run automatically ✅

## Troubleshooting

### "Missing required fields" Error
**Cause:** Dynamic field loading failed AND no default value available

**Solution:**
1. Dialog will appear automatically
2. Provide the missing values manually
3. Click "Retry Test"

**Tip:** You can find field values in the integration's web UI:
- Discord: Right-click channel → "Copy Channel ID"
- Slack: Right-click channel → "Copy Link" → Extract ID
- etc.

### "Failed to load dynamic options"
**Cause:** API endpoint doesn't exist or returned empty

**Solutions:**
1. Check `/api/integrations/[provider]/data` endpoint exists
2. Verify your account has data (channels, users, etc.)
3. Manual input dialog will appear as fallback

### Dynamic Loading Doesn't Work
**Possible Issues:**
- Integration data API not implemented for this provider
- No data available in connected account (e.g., no channels)
- API endpoint returns error

**Fix:** Implement the data API endpoint in `/app/api/integrations/[provider]/data/route.ts`

## Adding New Integrations

When you add a new integration to `availableNodes.ts`:

1. ✅ **Automatic** - It appears in the test list immediately
2. ✅ **Automatic** - Required fields are auto-detected
3. ✅ **Automatic** - Test data is auto-generated
4. ⚠️ **Manual** - If it has dynamic fields, implement data API endpoint
5. ✅ **Automatic** - Tests can run (with manual input fallback)

**No test configuration needed!**

## Architecture

```
User Input (optional)
    ↓
Auto-Discovery (from availableNodes.ts)
    ↓
Smart Data Generation
    ├─→ User values (priority 1)
    ├─→ Dynamic loading (priority 2)
    ├─→ Field name detection (priority 3)
    └─→ Type fallback (priority 4)
    ↓
Workflow Creation & Execution
    ↓
Validation
    ├─→ Success ✅
    └─→ Missing fields ❌
         ↓
    Manual Input Dialog
         ↓
    Retry with manual values
         ↓
    Success ✅
```

## Benefits

1. **Zero Configuration** - No manual test setup required
2. **Scalable** - Works with 20+ integrations automatically
3. **Intelligent** - Auto-loads real data when possible
4. **Flexible** - Falls back to manual input when needed
5. **Comprehensive** - Tests every action and trigger
6. **Fast** - Runs tests in parallel with streaming results
7. **Exportable** - Download HTML reports for documentation
8. **Selective** - Run only the tests you need
9. **Reusable** - Save test configurations as presets
10. **Safe** - Validate before executing with dry run mode

## Advanced Features

### Selective Testing

Run specific tests instead of all tests for faster iteration.

**How to Use:**
1. Select an integration
2. Click "Selected" mode in Test Selection
3. Check the tests you want to run
4. Click "Run X Selected Tests"

**Features:**
- **All Tests** - Default mode, runs everything
- **Selected Tests** - Choose specific actions/triggers via checkboxes
- **Failed Tests Only** - Automatically retries only failed tests from last run
- **Select All / Deselect All** - Quick selection controls

**Use Cases:**
- Testing a specific action after fixing a bug
- Focusing on new features without running all tests
- Retrying failed tests after manual fixes

### Test Data Presets

Save and reuse test data configurations for quick testing.

**How to Use:**
1. Enter test data (email, message, etc.)
2. Click "Save" button
3. Enter a preset name (e.g., "Production Test", "QA Config")
4. Click "Load Preset" to reuse saved configurations

**Features:**
- **localStorage Persistence** - Presets saved in browser
- **Quick Load** - Click preset name to load instantly
- **Delete Presets** - Hover and click trash icon
- **Field Count Badge** - Shows how many fields in each preset

**Use Cases:**
- Different test environments (dev, staging, prod)
- Multiple test accounts
- Common test scenarios
- Team sharing (export/import via browser)

### Dry Run Mode

Validate test configurations without executing tests.

**How to Use:**
1. Toggle "Dry Run (Validate Only)" switch
2. Click "Validate Configuration"
3. Review validation results
4. Fix any issues
5. Turn off dry run and execute tests

**Features:**
- **Fast Validation** - Checks configuration in seconds
- **No API Calls** - Doesn't execute actual tests
- **Issue Detection** - Shows missing fields and connection problems
- **Ready Indicator** - Green badge when all tests are valid
- **Detailed Feedback** - Lists specific issues per test

**Validation Checks:**
- Required fields present
- Integration connected
- Field types correct
- Node definitions valid

**Use Cases:**
- Quick config verification
- Pre-flight checks before long test runs
- Debugging configuration issues
- Learning which fields are required

## Future Enhancements

Possible improvements:
1. ~~**Test data persistence** - Save manual inputs for reuse~~ ✅ COMPLETED (Test Presets)
2. **Custom test scenarios** - Define specific test cases
3. **Scheduled testing** - Run tests automatically on cron
4. **CI/CD integration** - Include in deployment pipeline
5. **Performance benchmarks** - Track execution time trends
6. **Preset Export/Import** - Share presets between team members
7. **Test History** - Track test results over time

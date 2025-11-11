# Automated Integration Testing System

This system automatically tests all integration actions and triggers to ensure they work correctly.

## 🎯 What It Tests

- **Actions**: Verifies that action nodes make the correct API requests with proper parameters
- **Triggers**: Verifies that trigger nodes respond to webhooks correctly
- **All Providers**: Tests Gmail, HubSpot, Slack, Discord, Gumroad, Google Sheets, Notion, Stripe, Airtable, Trello, and more

## 🚀 Quick Start

### 1. Setup

Create a `.env.test` file with your test credentials:

```bash
# Test user authentication token
TEST_USER_TOKEN=your_test_user_jwt_token

# Test accounts (optional - for logging purposes)
TEST_GMAIL_ACCOUNT=your-test@gmail.com
TEST_HUBSPOT_ACCOUNT=your-test@hubspot.com
```

To get your `TEST_USER_TOKEN`:
1. Log into ChainReact
2. Open browser DevTools → Application → Cookies
3. Copy the value of the `sb-access-token` cookie

### 2. Run Tests

```bash
# Test all integrations
npm run test:integrations

# Test specific provider
npm run test:integrations -- --provider=hubspot

# Test only actions (skip triggers)
npm run test:integrations -- --actions-only

# Test only triggers (skip actions)
npm run test:integrations -- --triggers-only

# Verbose output with detailed logs
npm run test:integrations -- --verbose
```

## 📊 Test Reports

After running tests, reports are generated in `test-reports/`:

- **HTML Report**: Beautiful visual report with pass/fail status
  - Open `test-reports/latest.html` in your browser
  - Shows results grouped by provider
  - Displays error messages and durations

- **JSON Report**: Machine-readable test results
  - Useful for CI/CD integration
  - Contains detailed execution data

## 🔧 How It Works

### Action Testing

1. **Create Test Workflow**: Builds a workflow with manual trigger → action node
2. **Execute Workflow**: Runs the workflow with test configuration
3. **Verify API Call**: Checks execution logs to confirm:
   - Correct API endpoint was called
   - Correct HTTP method was used
   - All required fields were present
   - No errors occurred
4. **Cleanup**: Deletes the test workflow

### Trigger Testing

1. **Create Test Workflow**: Builds a workflow with trigger → log action
2. **Activate Workflow**: Enables the workflow (creates webhook subscriptions)
3. **Send Test Webhook**: Simulates webhook payload from the provider
4. **Verify Execution**: Confirms the workflow was triggered
5. **Cleanup**: Deactivates and deletes the test workflow

## 📝 Adding Tests for New Providers

Edit `test-config.ts` and add your provider:

```typescript
{
  provider: 'your-provider',
  displayName: 'Your Provider',
  requiresRealAccount: true,
  actions: [
    {
      nodeType: 'your_provider_action',
      actionName: 'Your Action',
      config: {
        // Test configuration
        field1: 'value1',
        field2: 'value2',
      },
      expectedApiEndpoint: 'https://api.yourprovider.com/endpoint',
      expectedMethod: 'POST',
      requiredFields: ['field1', 'field2'],
    },
  ],
  triggers: [
    {
      nodeType: 'your_provider_trigger',
      triggerName: 'Your Trigger',
      webhookPayload: {
        // Sample webhook payload
        event: 'test.event',
        data: { /* ... */ },
      },
      expectedTrigger: true,
      requiredWebhookFields: ['event', 'data'],
    },
  ],
}
```

## 🎨 Test Configuration Options

### Action Tests

- `nodeType`: Node type identifier (e.g., `'gmail_send_email'`)
- `actionName`: Human-readable action name
- `config`: Test configuration object with field values
- `expectedApiEndpoint`: (Optional) API endpoint that should be called
- `expectedMethod`: (Optional) HTTP method (GET, POST, PUT, PATCH, DELETE)
- `requiredFields`: Array of field names that must be in config
- `skipReason`: (Optional) Why test is skipped

### Trigger Tests

- `nodeType`: Node type identifier (e.g., `'gmail_new_email'`)
- `triggerName`: Human-readable trigger name
- `webhookPayload`: Simulated webhook payload to send
- `expectedTrigger`: Whether workflow should trigger (usually `true`)
- `requiredWebhookFields`: Array of fields that must be in payload
- `skipReason`: (Optional) Why test is skipped

## 🚨 Skipping Tests

Some tests may need to be skipped (e.g., requires production API key, manual verification needed):

```typescript
{
  nodeType: 'gumroad_create_product',
  actionName: 'Create Product',
  skipReason: 'Gumroad API requires production access - test manually',
}
```

Skipped tests show in the report with a ⏭️ icon and the skip reason.

## 🐛 Troubleshooting

### "Authentication required" error
- Make sure `TEST_USER_TOKEN` is set in `.env.test`
- Token might have expired - get a fresh one from browser cookies

### "Failed to create test workflow" error
- Ensure dev server is running (`npm run dev`)
- Check that the node type exists in `availableNodes.ts`
- Verify the provider configuration is correct

### "Webhook endpoint not found" error
- Ensure the webhook route exists in `app/api/webhooks/[provider]/`
- Check that the provider is mapped correctly in `trigger-tester.ts`

### Action test fails with "API endpoint not called"
- Check execution logs manually to see what happened
- Verify the action implementation makes the expected API call
- Use `--verbose` flag to see detailed logs

### Trigger test times out
- Webhook might not be properly configured
- Check that trigger lifecycle is implemented
- Verify webhook payload matches what the trigger expects

## 📈 Best Practices

1. **Run tests before deploying**: Catch integration issues early
2. **Add tests for new integrations**: Don't wait - add tests as you build
3. **Review failed tests carefully**: They often reveal real bugs
4. **Update test data**: Keep webhook payloads up-to-date with provider changes
5. **Test with real accounts**: Some integrations behave differently with test vs. real data

## 🔐 Security Notes

- Test tokens are stored in `.env.test` (gitignored)
- Never commit real API keys or tokens
- Test workflows are automatically cleaned up
- Use dedicated test accounts, not production accounts

## 📋 Example Output

```
🧪 ChainReact Integration Test Suite

Testing 10 provider(s)...

============================================================
📦 Gmail (gmail)
============================================================

🔧 Testing 1 action(s)...
  ✅ Send Email - PASSED (1234ms)

🎯 Testing 1 trigger(s)...
  ✅ New Email - PASSED (2345ms)

============================================================
📦 HubSpot (hubspot)
============================================================

🔧 Testing 2 action(s)...
  ✅ Create Contact - PASSED (1456ms)
  ✅ Update Contact - PASSED (1123ms)

🎯 Testing 1 trigger(s)...
  ✅ Contact Created - PASSED (2567ms)

============================================================
📊 TEST SUMMARY
============================================================
Total Tests:    25
✅ Passed:      23 (92%)
❌ Failed:      1 (4%)
⏭️  Skipped:     1 (4%)
⏱️  Duration:    45.67s

📄 Detailed report saved to: test-reports/integration-tests-2025-01-10T12-34-56.html
```

## 🛠️ Advanced Usage

### Running in CI/CD

```bash
# GitHub Actions example
- name: Run Integration Tests
  run: npm run test:integrations -- --verbose
  env:
    TEST_USER_TOKEN: ${{ secrets.TEST_USER_TOKEN }}
```

### Filtering by Type

```bash
# Only test actions for Gmail
npm run test:integrations -- --provider=gmail --actions-only

# Only test triggers for all providers
npm run test:integrations -- --triggers-only
```

### Custom Test Scripts

You can import the test utilities in your own scripts:

```typescript
import { testAction } from './scripts/test-integrations/action-tester'
import { getProviderTestConfig } from './scripts/test-integrations/test-config'

const config = getProviderTestConfig('gmail')!
const action = config.actions[0]

await testAction('gmail', action)
```

## 📚 Related Documentation

- [Action/Trigger Implementation Guide](/learning/docs/action-trigger-implementation-guide.md)
- [Integration Development Guide](/learning/docs/integration-development-guide.md)
- [Webhook Best Practices](/learning/docs/webhook-best-practices.md)

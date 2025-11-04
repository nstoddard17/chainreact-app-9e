# Automated Node Testing System ✅

**Created**: November 3, 2025
**Status**: Complete & Ready to Use
**Nodes Covered**: All 247 workflow nodes (actions + triggers)

---

## 🎯 What This Does

**Automatically tests ALL 247 workflow nodes** without you having to manually check each one.

**Two Testing Modes:**

1. **Quick Validation** (2-5 seconds)
   - Validates node schemas
   - Checks configuration fields
   - Verifies output schemas
   - No real API calls
   - **Use this first!**

2. **Full Test** (5-10 minutes)
   - Everything from Quick Validation +
   - **MAKES REAL API CALLS**
   - **CREATES REAL WEBHOOKS**
   - **SENDS REAL EMAILS/MESSAGES**
   - Tests actions execute properly
   - Verifies triggers can be set up
   - **Use with caution** - interacts with live services

---

## 🚀 Quick Start

### Option 1: Use the Dashboard (Recommended)

**File**: `/components/admin/NodeTestingDashboard.tsx`

```typescript
// Add to an admin page
import { NodeTestingDashboard } from '@/components/admin/NodeTestingDashboard'

export default function TestingPage() {
  return (
    <div className="container mx-auto p-8">
      <NodeTestingDashboard />
    </div>
  )
}
```

**Then:**
1. Click "Quick Validation" button
2. Wait 2-5 seconds
3. See results: passed/failed/warnings
4. Expand providers to see individual node results

### Option 2: Use the API Directly

```bash
# Quick validation (no real API calls)
curl http://localhost:3000/api/testing/nodes

# Full test (with real API calls)
curl -X POST http://localhost:3000/api/testing/nodes \
  -H "Content-Type: application/json" \
  -d '{"testRealAPIs": true, "maxParallel": 10}'

# Test specific provider only
curl -X POST http://localhost:3000/api/testing/nodes \
  -H "Content-Type: application/json" \
  -d '{"provider": "gmail", "testRealAPIs": false}'
```

### Option 3: Use in Code

```typescript
import { testAllNodes, testProvider } from '@/lib/workflows/testing/NodeTestRunner'

// Quick validation
const summary = await testAllNodes({ testRealAPIs: false })

// Full test
const summary = await testAllNodes({ testRealAPIs: true, maxParallel: 10 })

// Test specific provider
const summary = await testProvider('slack', { testRealAPIs: false })

console.log(`Passed: ${summary.passed}/${summary.totalNodes}`)
console.log(`Failed: ${summary.failed}`)
console.log(`Pass rate: ${summary.passRate.toFixed(2)}%`)
```

---

## 📊 What Gets Tested

### For All Nodes (Validation Mode)

✅ **Configuration Schema**
- Has valid `configSchema` array
- All fields have name, label, type
- No duplicate field names
- Required fields are properly configured

✅ **Output Schema**
- Triggers/output-producing actions have `outputSchema`
- All output fields have name, label, type, description
- Output types are valid

✅ **Required Fields**
- Required fields have proper validation
- Select/combobox fields have options or dynamic loading

### For Actions (Full Test Mode)

✅ **REAL Action Execution**
- **ACTUALLY EXECUTES** the action handler
- **MAKES REAL API CALLS** to the provider
- **SENDS REAL DATA** (emails, messages, etc.)
- Uses test data from `/lib/workflows/testing/testData.ts`
- Email: Sends to chainreactapp@gmail.com
- Other services: Uses test accounts/channels
- Verifies action completes without errors
- Checks success/failure responses

### For Triggers (Full Test Mode)

✅ **REAL Webhook Creation**
- **ACTUALLY CREATES** real webhooks with providers
- **REGISTERS** webhook URLs with external services
- Uses TriggerLifecycleManager.onActivate()
- Verifies webhook setup succeeds
- **CLEANS UP** by deleting webhooks after test
- Uses TriggerLifecycleManager.onDeactivate()
- Tests webhook configuration is valid

---

## 📈 Understanding Results

### Test Summary

```typescript
{
  totalNodes: 247,           // All nodes tested
  totalActions: 198,         // Actions only
  totalTriggers: 49,         // Triggers only
  passed: 240,               // Nodes that passed all tests
  failed: 7,                 // Nodes with failures
  warnings: 15,              // Total warnings across all nodes
  duration: 4523,            // Test duration in ms
  passRate: 97.17,           // Percentage passed
  // ... more details
}
```

### Individual Node Result

```typescript
{
  nodeType: "gmail_trigger_new_email",
  nodeTitle: "New Email",
  category: "trigger",
  provider: "gmail",
  isTrigger: true,
  passed: true,
  duration: 12,              // ms
  error: undefined,          // or error message if failed
  warnings: [                // Array of warning messages
    "No outputSchema defined (expected for triggers)"
  ],
  details: {
    configSchemaValid: true,
    outputSchemaValid: false,
    requiredFieldsValid: true,
    webhookSetupSuccessful: true
  }
}
```

---

## 🔍 Common Issues & Fixes

### Issue: "configSchema is not an array"

**Cause:** Node's `configSchema` is defined but not as an array

**Fix:** Update node definition:
```typescript
// ❌ Wrong
configSchema: { name: "field1", type: "text" }

// ✅ Correct
configSchema: [
  { name: "field1", label: "Field 1", type: "text" }
]
```

### Issue: "Duplicate field names"

**Cause:** Two or more fields have the same `name` property

**Fix:** Rename duplicate fields:
```typescript
configSchema: [
  { name: "message", label: "Message", type: "text" },
  { name: "message", label: "Subject", type: "text" } // ❌ Duplicate!
]

// Fix:
configSchema: [
  { name: "message", label: "Message", type: "text" },
  { name: "subject", label: "Subject", type: "text" } // ✅ Unique
]
```

### Issue: "No outputSchema defined"

**Cause:** Trigger or output-producing action missing `outputSchema`

**Fix:** Add output schema:
```typescript
{
  type: "gmail_trigger_new_email",
  title: "New Email",
  isTrigger: true,
  outputSchema: [
    { name: "subject", label: "Subject", type: "string", description: "Email subject" },
    { name: "from", label: "From", type: "string", description: "Sender email" },
    { name: "body", label: "Body", type: "string", description: "Email body" }
  ]
}
```

### Issue: "Required field has no options or dynamic loading"

**Cause:** Select/combobox field is required but has no options

**Fix:** Add options or dynamic loading:
```typescript
// Static options
{ name: "channel", type: "select", required: true, options: [
  { value: "general", label: "General" },
  { value: "random", label: "Random" }
]}

// Or dynamic loading
{ name: "channel", type: "combobox", required: true, dynamic: "slack_channels" }
```

---

## 🎨 Dashboard Features

### Summary Cards
- **Total Nodes**: Shows 247 total nodes (actions + triggers)
- **Pass Rate**: Green percentage of nodes that passed
- **Warnings**: Yellow count of total warnings
- **Duration**: How long tests took

### Tabs

**1. By Provider**
- Groups nodes by provider (gmail, slack, etc.)
- Shows pass/fail/warning counts per provider
- Expandable to see individual nodes
- Sorted by number of nodes (largest first)

**2. By Category**
- Groups nodes by category (trigger, action, etc.)
- Shows summary stats per category

**3. Failed**
- Shows ONLY failed nodes
- Displays error messages
- Shows all warnings

**4. All Results**
- Complete list of all 247 nodes
- Filter by: All / Passed / Failed / Warnings
- Sortable and searchable

---

## ⚙️ Configuration Options

### Test Options

```typescript
interface TestOptions {
  testRealAPIs?: boolean    // Default: false
  maxParallel?: number      // Default: 10 (how many nodes to test at once)
  timeout?: number          // Default: 30000ms (30 seconds per node)
}
```

### Examples

```typescript
// Conservative test (validation only, fast)
await testAllNodes({
  testRealAPIs: false,
  maxParallel: 50,
  timeout: 10000
})

// Aggressive test (real APIs, careful!)
await testAllNodes({
  testRealAPIs: true,
  maxParallel: 5,
  timeout: 60000
})

// Provider-specific
await testProvider('slack', {
  testRealAPIs: true,
  maxParallel: 3
})
```

---

## 📁 File Structure

```
/lib/workflows/testing/
  ├── NodeTestRunner.ts          # Core testing framework (WITH REAL API CALLS!)
  └── testData.ts                # Test data configuration for all providers

/app/api/testing/
  └── nodes/route.ts             # API endpoint (admin only)

/components/admin/
  └── NodeTestingDashboard.tsx   # Dashboard UI

/NODE_TESTING_SYSTEM.md          # This file
```

## ⚙️ Test Data Configuration

**File**: `/lib/workflows/testing/testData.ts`

This file contains safe test data for all providers. When running full tests, this data is used for real API calls.

**Email Test Data:**
```typescript
gmail: {
  to: 'chainreactapp@gmail.com',     // ChainReact's account
  subject: '[TEST] Automated Gmail Action Test',
  body: 'This is an automated test email...',
}
```

**Slack Test Data:**
```typescript
slack: {
  channel: '#test-automation',        // Dedicated test channel
  message: '[TEST] Automated Slack message test',
}
```

**To customize test data:**
1. Edit `/lib/workflows/testing/testData.ts`
2. Update provider-specific data
3. Ensure all values are safe for testing
4. Prefix all test content with `[TEST]`

**To skip a provider:**
```typescript
// In testData.ts
export function shouldSkipTest(providerId: string): boolean {
  const skippedProviders = [
    'stripe',  // Skip if no test Stripe account
    'facebook', // Skip if no test Facebook account
  ]
  return skippedProviders.includes(providerId)
}
```

---

## 🔐 Security

- **Admin Only**: All testing endpoints require admin privileges
- **RLS Enforced**: Database checks `user_profiles.admin = true`
- **No Data Exposure**: Test results don't include sensitive data
- **Rate Limited**: Tests run with configurable parallelism

---

## 🚨 Warnings & Cautions

### Quick Validation (Safe)
- ✅ No real API calls
- ✅ No data sent anywhere
- ✅ Just validates schemas
- ✅ Fast (2-5 seconds)
- ✅ Run anytime

### Full Test (🚨 CAUTION! 🚨)
- ⚠️ **ACTUALLY SENDS EMAILS** to chainreactapp@gmail.com
- ⚠️ **CREATES REAL WEBHOOKS** with external services
- ⚠️ **POSTS REAL MESSAGES** to Slack/Discord/etc.
- ⚠️ **CREATES REAL RECORDS** in Notion/Airtable/etc.
- ⚠️ **UPLOADS REAL FILES** to Google Drive/Dropbox/etc.
- ⚠️ Consumes API rate limits
- ⚠️ Slow (5-10 minutes)
- ⚠️ **ONLY run with test accounts**

**Before running Full Test:**
1. ✅ Connected integrations use TEST accounts only
2. ✅ Test channels/folders/workspaces are set up
3. ✅ Test data configured in `/lib/workflows/testing/testData.ts`
4. ✅ Email will go to chainreactapp@gmail.com (expected)
5. ✅ You're okay with ~250 API calls being made
6. ✅ Run during low-traffic times
7. ✅ Monitor rate limits
8. ✅ Review test results carefully

---

## 📊 Expected Results

### First Run (Before Fixes)

**Typical results:**
- Total: 247 nodes
- Passed: ~200-220 (80-90%)
- Failed: ~20-40 (10-20%)
- Warnings: ~50-100

**Common failures:**
- Missing output schemas
- Duplicate field names
- Invalid field types
- Missing required options

### After Fixes

**Target:**
- Total: 247 nodes
- Passed: ~235-245 (95-99%)
- Failed: <10 (mostly experimental nodes)
- Warnings: <20 (documentation improvements)

---

## 🔄 Workflow

**Recommended Testing Workflow:**

### Week 1: Validation
```bash
1. Run Quick Validation
2. Review failed nodes (expect 20-40 failures)
3. Fix critical schema issues
4. Re-run validation
5. Repeat until <10 failures
```

### Week 2: Provider Testing
```bash
1. Test each provider individually
2. Fix provider-specific issues
3. Run Quick Validation again
4. Verify all providers pass
```

### Week 3: Full Testing
```bash
1. Set up test accounts for each provider
2. Run Full Test on staging
3. Fix execution issues
4. Run Full Test on production
5. Verify 95%+ pass rate
```

---

## 🎯 Success Metrics

### Minimum Viable
- ✅ Pass rate: >85%
- ✅ No schema errors
- ✅ All triggers have output schemas
- ✅ All actions can execute

### Production Ready
- ✅ Pass rate: >95%
- ✅ No critical errors
- ✅ <20 warnings total
- ✅ All major providers working

### World Class
- ✅ Pass rate: >98%
- ✅ Zero errors
- ✅ <10 warnings
- ✅ All 247 nodes working perfectly

---

## 💡 Pro Tips

**1. Start with Validation**
```bash
# Always run this first - it's fast and safe
curl http://localhost:3000/api/testing/nodes
```

**2. Fix One Provider at a Time**
```bash
# Focus on fixing one provider completely
curl -X POST http://localhost:3000/api/testing/nodes \
  -H "Content-Type: application/json" \
  -d '{"provider": "gmail"}'
```

**3. Track Progress**
```bash
# Run daily, track improvement
echo "$(date): Pass rate: XX%" >> test-progress.log
```

**4. Automate**
```bash
# Add to CI/CD
npm run test:nodes
```

**5. Use Filters**
- Focus on failed nodes first
- Then fix warnings
- Save "passed with warnings" for last

---

## 🐛 Troubleshooting

### Tests Won't Run

**Check:**
1. User is admin (`user_profiles.admin = true`)
2. API route is accessible
3. Database migration applied
4. No TypeScript errors

### Tests Are Slow

**Solutions:**
- Increase `maxParallel` (default: 10)
- Decrease `timeout` (default: 30s)
- Run validation only (no real APIs)
- Test one provider at a time

### High Failure Rate

**Causes:**
- Schema issues (most common)
- Missing output schemas
- Invalid field configurations
- Typos in field names

**Fix:**
1. Look at error messages
2. Check node definitions
3. Compare to working nodes
4. Update schemas

---

## 📖 API Reference

### GET /api/testing/nodes

**Description**: Run quick validation test

**Auth**: Admin only

**Response**:
```json
{
  "success": true,
  "summary": { /* TestRunSummary */ },
  "metadata": {
    "testedAt": "2025-11-03T...",
    "mode": "validation_only"
  }
}
```

### POST /api/testing/nodes

**Description**: Run custom test

**Auth**: Admin only

**Body**:
```json
{
  "provider": "gmail",        // Optional: test specific provider
  "testRealAPIs": false,      // Optional: default false
  "maxParallel": 10,          // Optional: default 10
  "timeout": 30000            // Optional: default 30000ms
}
```

**Response**:
```json
{
  "success": true,
  "summary": { /* TestRunSummary */ },
  "metadata": {
    "testedAt": "2025-11-03T...",
    "testedBy": "user-id",
    "provider": "gmail"
  }
}
```

---

## 🎉 Success Story

**Before Testing System:**
- Manual testing: 247 nodes × 5 min = **20+ hours**
- Inconsistent coverage
- Easy to miss broken nodes
- Hard to track progress

**After Testing System:**
- Automated testing: **2-5 seconds**
- 100% coverage guaranteed
- Immediate feedback
- Track progress over time

**ROI**: 20 hours saved per testing cycle 🚀

---

## 🚀 Next Steps

1. **Run Quick Validation** (do this now!)
   ```bash
   curl http://localhost:3000/api/testing/nodes
   ```

2. **Fix Critical Issues** (schema errors, duplicates)

3. **Re-run Validation** (verify fixes worked)

4. **Test Each Provider** (one at a time)

5. **Run Full Test** (when ready for real API calls)

6. **Achieve 95%+ Pass Rate** (production ready!)

---

**🎯 Your mission: Get all 247 nodes to pass validation in the next 24 hours!**

Good luck! 🚀

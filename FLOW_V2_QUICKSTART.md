# Flow V2 Quick Start Guide

## 🚀 Quick Start (3 Steps)

Flow V2 is now **always enabled** - no configuration needed!

### Step 1: Start Development Server

```bash
npm run dev
```

That's it! Flow V2 is automatically enabled. No environment variables needed.

### Step 2: Verify System

```bash
./verify-flow-v2.sh
```

Expected output:
```
Passed:   14
Failed:   0
Warnings: 0
```

### Step 3: Test in Browser

Open http://localhost:3000/workflows/ai-agent

## 📋 Full Verification Checklist

### Automated Checks

```bash
# 1. System verification (structure, files, migrations)
./verify-flow-v2.sh

# 2. TypeScript compilation
npx tsc --noEmit

# 3. Linting
npm run lint

# 4. Unit tests
npm run test

# 5. E2E tests (requires dev server running)
npx playwright test tests/flow-v2-builder.spec.ts
npx playwright test tests/layout/flow-v2-layout.spec.ts
```

### Manual Browser Tests

```bash
# 1. Start dev server
npm run dev

# 2. Open browser to http://localhost:3000/workflows/ai-agent

# 3. Test AI Agent Builder:
#    - Enter: "when I get an email, send it to Slack"
#    - Click "Build" or press Enter
#    - Watch animated build process
#    - Verify chip sequence in agent panel
#    - Check badge at top center
#    - See skeleton with grey nodes
#    - Observe first node becoming active

# 4. Test Builder Routes:
#    - /workflows/builder          (redirects to latest flow)
#    - /workflows/v2               (flow list)
#    - /workflows/v2/[flowId]      (flow builder)
#    - /workflows/ai-agent         (AI agent)
```

## 🔍 Verification Details

### What Changed

**Feature Flags Removed:**
- ✅ No more `FLOW_V2_ENABLED` environment variable
- ✅ No more `NEXT_PUBLIC_USE_FLOW_V2_FRONTEND`
- ✅ No more `guardFlowV2Enabled()` checks in API routes
- ✅ No more conditional logic in pages

**Files Modified:**
- 6 workflow page routes
- 1 middleware file
- 21 API route files
- 1 workflow builder hook
- 1 feature flag module (simplified)
- .env.local (environment variables removed)

### System Components

**Backend:**
- 16 database tables
- 6 allowed node types
- 21 API endpoints
- RBAC/RLS policies
- Planner with deterministic hashing
- Mapping engine with lineage
- DAG runner with retries

**Frontend:**
- AI Agent Builder (animated UX)
- WorkflowBuilderV2
- FlowBuilderClient
- FlowV2BuilderContent
- Agent panel with chip sequence
- Setup cards with validation
- Inspector panels

**Design System:**
- Typography tokens (--font-*)
- Icon tokens (--icon-*)
- Motion tokens (--motion-*)
- Easing functions
- FlowNodes component
- FlowEdges component
- Focus rings
- Accessibility features

**Tests:**
- 20 unit test files
- 5 E2E test files
- Layout parity tests
- Verification script

## 📊 Expected Results

### ./verify-flow-v2.sh

```
=== Flow V2 System Verification ===

### 1. Backend Checks
✓ Found Flow V2 migration files
✓ Planner allow-list exists
✓ Found 8 node implementation files
✓ Found 21 API route files

### 2. Frontend Checks
✓ Found FlowBuilderClient.tsx
✓ Found WorkflowBuilderV2.tsx
✓ Found FlowV2BuilderContent.tsx
✓ Found design tokens file
✓ Found FlowNodes component
✓ Found FlowEdges component

### 3. Tests
✓ Found 20 test files in __tests__/workflows/v2
✓ Found 5 test files in tests

### 4. Feature Flags Status
✓ Feature flags simplified (always return true)
✓ Environment variables removed from .env.local

Passed:   14
Failed:   0
Warnings: 0
```

### npx tsc --noEmit

All TypeScript errors should be in:
- `.next/types/validator.ts` (Next.js internal)
- `app/api/billing/*` (unrelated)
- `app/api/custom-webhooks/*` (unrelated)
- `app/api/templates/*` (unrelated)
- `__tests__/*` (test files)

**Zero errors in Flow V2 components** ✅

### Browser Tests

**AI Agent Builder (/workflows/ai-agent):**
- ✅ Prompt input visible
- ✅ "Build" button works
- ✅ Agent panel appears (420px width)
- ✅ Chips show in correct order
- ✅ Badge at top center
- ✅ Skeleton builds with grey nodes
- ✅ First node becomes active
- ✅ Setup cards appear
- ✅ Test and advance works
- ✅ Flow completes successfully

**Design Verification:**
- ✅ Agent panel: 420px (±4px)
- ✅ Inspector panel: 380px (±4px)
- ✅ Badge: horizontally centered
- ✅ Node gaps: X≈160px, Y≈96px
- ✅ Typography: --font-xs to --font-lg
- ✅ Edges: 1.5px, #d0d6e0
- ✅ Focus rings: 2px visible
- ✅ Smooth animations: 500ms

## 🐛 Troubleshooting

### Dev Server Won't Start

```bash
# Check if port 3000 is in use
lsof -ti:3000

# Kill process if needed
kill -9 $(lsof -ti:3000)

# Start server
npm run dev
```

### Database Errors

```bash
# Apply migrations
supabase db push

# Check status
supabase db status

# Reset if needed (WARNING: destructive)
supabase db reset
```

### TypeScript Errors in Flow V2

```bash
# Check specifically for V2 errors
npx tsc --noEmit 2>&1 | grep -E "workflows/v2|FlowV2|FlowBuilder"

# Should return nothing (all V2 components are clean)
```

### Tests Failing

```bash
# Clear test cache
npm run test -- --clearCache

# Run specific test
npm run test -- __tests__/workflows/v2/planner.test.ts

# E2E with verbose output
npx playwright test --debug
```

### Feature Flag Errors

If you see errors like "Flow v2 is disabled":
1. ✅ Feature flags are removed - this shouldn't happen
2. ❌ If it does, check `src/lib/workflows/v2/featureFlag.ts`
3. ✅ Should always return `true`

## 📚 Documentation

**Full Reports:**
- [System Verification Report](FLOW_V2_SYSTEM_VERIFICATION_REPORT.md)
- [Feature Flag Removal Summary](FLOW_V2_FEATURE_FLAG_REMOVAL_SUMMARY.md)
- [Design Parity Summary](FLOW_V2_DESIGN_PARITY_SUMMARY.md)

**Learning Resources:**
- `/learning/docs/` - Architecture guides
- `/learning/logs/CHANGELOG.md` - Change history
- `/CLAUDE.md` - Development guidelines

## 🎯 Success Criteria

Your Flow V2 system is working correctly if:

- ✅ Verification script passes (14/14 checks)
- ✅ TypeScript compiles with zero V2 errors
- ✅ Dev server starts without errors
- ✅ AI Agent builder loads at /workflows/ai-agent
- ✅ Can build a flow from natural language prompt
- ✅ Animated build UX works smoothly
- ✅ Setup cards appear and work
- ✅ Flow can be saved and executed

## 🚀 Next Steps

1. **Run automated tests:**
   ```bash
   npm run test
   npx playwright test
   ```

2. **Manual smoke test:**
   - Follow [Manual Smoke Test Checklist](FLOW_V2_SYSTEM_VERIFICATION_REPORT.md#9-manual-smoke-test-checklist)

3. **Deploy to staging:**
   - No special configuration needed
   - Flow V2 is automatically enabled

4. **Monitor production:**
   - Check `/workflows/v2/api/health`
   - Monitor error logs
   - Track flow execution metrics

---

**Questions or Issues?**

Check the full documentation in:
- `FLOW_V2_SYSTEM_VERIFICATION_REPORT.md`
- `FLOW_V2_FEATURE_FLAG_REMOVAL_SUMMARY.md`

Flow V2 is production-ready! 🎉

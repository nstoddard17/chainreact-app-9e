#!/bin/bash
# Flow V2 System Verification Script
# This script performs comprehensive checks on Flow V2 backend, frontend, and design

set -e

echo "=== Flow V2 System Verification ==="
echo "Started: $(date)"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Results tracking
PASSED=0
FAILED=0
WARNINGS=0

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  PASSED=$((PASSED + 1))
}

check_fail() {
  echo -e "${RED}✖${NC} $1"
  FAILED=$((FAILED + 1))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

echo "### 1. Backend Checks"
echo ""

# 1.1 Migrations
echo "1.1 Database Migrations..."
FLOW_V2_TABLES=$(ls supabase/migrations/2025102*.sql 2>/dev/null | wc -l || echo "0")
if [ "$FLOW_V2_TABLES" -gt "0" ]; then
  check_pass "Found Flow V2 migration files"
  grep "create table" supabase/migrations/20251027*.sql supabase/migrations/20251028*.sql 2>/dev/null | grep -oE "(flow_v2_[a-z_]+|workspace[a-z_]*)" | sort | uniq | sed 's/^/  - /'
else
  check_fail "No Flow V2 migration files found"
fi
echo ""

# 1.2 Planner Allow-list
echo "1.2 Planner Allow-list..."
if grep -q "ALLOWED_NODE_TYPES" src/lib/workflows/builder/agent/planner.ts 2>/dev/null; then
  check_pass "Planner allow-list exists"
  grep -A 10 "const ALLOWED_NODE_TYPES" src/lib/workflows/builder/agent/planner.ts | grep '"' | sed 's/^/  - /'
else
  check_fail "Planner allow-list not found"
fi
echo ""

# 1.3 Node Registry
echo "1.3 Node Registry..."
if [ -d "src/lib/workflows/builder/nodes" ]; then
  NODE_COUNT=$(find src/lib/workflows/builder/nodes -name "*.ts" ! -name "*.test.ts" ! -name "types.ts" | wc -l)
  check_pass "Found $NODE_COUNT node implementation files"
  find src/lib/workflows/builder/nodes -name "*.ts" ! -name "*.test.ts" ! -name "types.ts" | sed 's|src/lib/workflows/builder/nodes/||' | sed 's/^/  - /'
else
  check_fail "Node directory not found"
fi
echo ""

# 1.4 API Routes
echo "1.4 API Routes..."
if [ -d "app/workflows/v2/api" ]; then
  API_ROUTES=$(find app/workflows/v2/api -name "route.ts" | wc -l)
  check_pass "Found $API_ROUTES API route files"
else
  check_fail "API directory not found"
fi
echo ""

echo "### 2. Frontend Checks"
echo ""

# 2.1 Builder Components
echo "2.1 Builder Components..."
BUILDER_FILES=(
  "src/components/workflowsV2/FlowBuilderClient.tsx"
  "components/workflows/builder/WorkflowBuilderV2.tsx"
  "components/workflows/builder/FlowV2BuilderContent.tsx"
)

for file in "${BUILDER_FILES[@]}"; do
  if [ -f "$file" ]; then
    check_pass "Found $(basename $file)"
  else
    check_fail "Missing $(basename $file)"
  fi
done
echo ""

# 2.2 Design Tokens
echo "2.2 Design Tokens..."
if [ -f "components/workflows/builder/styles/tokens.css" ]; then
  check_pass "Found design tokens file"
  grep -E "^  --font-|^  --icon-|^  --motion-" components/workflows/builder/styles/tokens.css | head -10 | sed 's/^/  /'
else
  check_warn "Design tokens file not found at expected location"
fi
echo ""

# 2.3 Node Components
echo "2.3 Node Components..."
if [ -f "components/workflows/builder/FlowNodes.tsx" ]; then
  check_pass "Found FlowNodes component"
else
  check_warn "FlowNodes component not found"
fi

if [ -f "components/workflows/builder/FlowEdges.tsx" ]; then
  check_pass "Found FlowEdges component"
else
  check_warn "FlowEdges component not found"
fi
echo ""

echo "### 3. Tests"
echo ""

# 3.1 Test Files
echo "3.1 Test Files..."
TEST_DIRS=(
  "__tests__/workflows/v2"
  "tests"
)

for dir in "${TEST_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    TEST_COUNT=$(find "$dir" -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" 2>/dev/null | wc -l)
    check_pass "Found $TEST_COUNT test files in $dir"
  fi
done
echo ""

echo "### 4. Feature Flags Status"
echo ""

# 4.1 Feature Flag Removal
echo "4.1 Feature Flag Removal..."
if grep -q "return true" src/lib/workflows/builder/featureFlag.ts 2>/dev/null; then
  check_pass "Feature flags simplified (always return true)"
else
  check_warn "Feature flags may still have complex logic"
fi

if ! grep -q "FLOW_V2_ENABLED\|NEXT_PUBLIC_USE_FLOW_V2" .env.local 2>/dev/null; then
  check_pass "Environment variables removed from .env.local"
else
  check_warn "Flow V2 environment variables still present in .env.local"
fi
echo ""

echo "### Summary"
echo ""
echo "Passed:   $PASSED"
echo "Failed:   $FAILED"
echo "Warnings: $WARNINGS"
echo ""
echo "Completed: $(date)"

if [ "$FAILED" -gt "0" ]; then
  exit 1
fi

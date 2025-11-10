#!/bin/bash

# Output Schema Audit Script
# Checks all provider actions for outputSchema definitions

echo "================================================"
echo "Output Schema Audit Report"
echo "================================================"
echo ""

PROVIDERS_DIR="lib/workflows/nodes/providers"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

total_providers=0
providers_with_schemas=0
providers_missing_schemas=0

echo "Scanning providers in $PROVIDERS_DIR..."
echo ""

# Loop through each provider directory
for provider_dir in "$PROVIDERS_DIR"/*; do
  if [ -d "$provider_dir" ]; then
    provider_name=$(basename "$provider_dir")
    total_providers=$((total_providers + 1))

    # Count files with outputSchema
    schema_count=$(grep -r "outputSchema" "$provider_dir" --include="*.ts" | wc -l)

    # Count total action files (rough estimate)
    action_count=$(find "$provider_dir" -name "*.ts" -type f | wc -l)

    if [ "$schema_count" -gt 0 ]; then
      echo -e "${GREEN}✅ $provider_name${NC}"
      echo "   Found $schema_count outputSchema definitions in $action_count files"
      providers_with_schemas=$((providers_with_schemas + 1))
    else
      echo -e "${RED}❌ $provider_name${NC}"
      echo -e "   ${YELLOW}NO outputSchema found!${NC} ($action_count files scanned)"
      providers_missing_schemas=$((providers_missing_schemas + 1))
    fi
    echo ""
  fi
done

echo "================================================"
echo "Summary"
echo "================================================"
echo "Total Providers: $total_providers"
echo -e "${GREEN}Providers with outputSchema: $providers_with_schemas${NC}"
echo -e "${RED}Providers missing outputSchema: $providers_missing_schemas${NC}"
echo ""

if [ "$providers_missing_schemas" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Action Required:${NC}"
  echo "Run detailed check on providers marked with ❌"
  echo "See: /learning/docs/output-schema-audit-guide.md"
else
  echo -e "${GREEN}🎉 All providers have outputSchema definitions!${NC}"
fi

#!/bin/bash

# Script to find all OAuth callbacks trying to save non-existent columns
# These fields should go in metadata JSONB column instead

echo "Checking OAuth callbacks for non-existent column usage..."
echo ""

PROVIDERS=(airtable blackbaud dropbox facebook gumroad instagram kit linkedin notion onenote paypal shopify teams trello)

for provider in "${PROVIDERS[@]}"; do
  file="app/api/integrations/$provider/callback/route.ts"

  if [ -f "$file" ]; then
    # Find lines with problematic fields
    problematic=$(grep -n "email:\|provider_user_id:\|username:\|account_name:\|team_id:\|app_id:" "$file" | grep -v "metadata" | grep -v "//" | head -5)

    if [ ! -z "$problematic" ]; then
      echo "=== $provider ==="
      echo "$problematic"
      echo ""
    fi
  fi
done

echo "These fields should be moved to metadata JSONB column:"
echo "  metadata: { email: ..., provider_user_id: ..., etc }"

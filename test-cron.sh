#!/bin/bash

# Test the token refresh cron job with verbose logging
echo "Testing token refresh cron job..."
echo ""

# Get the CRON_SECRET from .env
CRON_SECRET=$(grep CRON_SECRET .env.local | cut -d '=' -f2)

if [ -z "$CRON_SECRET" ]; then
    echo "Error: CRON_SECRET not found in .env.local"
    exit 1
fi

# Call the cron endpoint with verbose mode for Gmail only
curl -s "http://localhost:3000/api/cron/token-refresh?secret=$CRON_SECRET&provider=gmail&verbose=true" | jq

echo ""
echo "Check your terminal logs for detailed output"

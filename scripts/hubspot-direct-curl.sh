#!/bin/bash

# HubSpot Direct API Curl Script
# This script helps you fetch HubSpot contact properties using curl with browser authentication

echo "🔍 HubSpot Direct API Properties Fetcher"
echo "========================================="

# Check if we have a session cookie
if [ -z "$1" ]; then
    echo "❌ Error: Please provide your session cookie"
    echo ""
    echo "Usage: ./scripts/hubspot-direct-curl.sh 'your-session-cookie'"
    echo ""
    echo "To get your session cookie:"
    echo "1. Open your browser and go to http://localhost:3000"
    echo "2. Login to your account"
    echo "3. Open Developer Tools (F12)"
    echo "4. Go to Application/Storage tab"
    echo "5. Find the 'sb-' cookie under Cookies"
    echo "6. Copy the entire cookie value"
    echo ""
    echo "Example: ./scripts/hubspot-direct-curl.sh 'sb-abc123...'"
    exit 1
fi

SESSION_COOKIE="$1"

echo "📡 Testing authentication with debug endpoint..."
DEBUG_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/integrations/hubspot/debug-contacts" \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=$SESSION_COOKIE")

if echo "$DEBUG_RESPONSE" | grep -q '"error"'; then
    echo "❌ Authentication failed. Please check your session cookie."
    echo "Response: $DEBUG_RESPONSE"
    exit 1
fi

echo "✅ Authentication successful!"

echo ""
echo "📡 Fetching HubSpot contact properties via our API..."
API_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/integrations/hubspot/all-contact-properties" \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=$SESSION_COOKIE")

if echo "$API_RESPONSE" | grep -q '"error"'; then
    echo "❌ API call failed:"
    echo "$API_RESPONSE"
    exit 1
fi

echo "✅ Successfully fetched properties via API!"

# Extract and display the properties
echo ""
echo "🔍 HubSpot Contact Properties (Filtered - Visible, Non-archived):"
echo "================================================================"

# Parse the JSON response and extract properties
echo "$API_RESPONSE" | jq -r '.data.config_fields[] | select(.field_type == "all_available_fields") | .options[] | "\(.name) | \(.label) | \(.type) | \(.groupName)"' | column -t -s '|'

# Count properties
TOTAL_COUNT=$(echo "$API_RESPONSE" | jq '.data.config_fields[] | select(.field_type == "all_available_fields") | .options | length')
echo ""
echo "📊 Summary:"
echo "Total visible properties: $TOTAL_COUNT"

# Save to file
echo ""
echo "💾 Saving properties to hubspot-api-properties.json..."
echo "$API_RESPONSE" > hubspot-api-properties.json

echo "✅ Properties saved to hubspot-api-properties.json"
echo ""
echo "🎉 Done! You can now view the properties in the JSON file."

# Also show a sample of the raw HubSpot API response structure
echo ""
echo "📋 Sample API Response Structure:"
echo "================================="
echo "$API_RESPONSE" | jq '.data.config_fields[] | select(.field_type == "all_available_fields") | .options[0:3]' | head -20 
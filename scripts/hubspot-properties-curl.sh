#!/bin/bash

# HubSpot Properties Fetch Script
# This script helps you fetch HubSpot contact properties using curl

echo "🔍 HubSpot Contact Properties Fetcher"
echo "======================================"

# Check if we have a session cookie
if [ -z "$1" ]; then
    echo "❌ Error: Please provide your session cookie"
    echo ""
    echo "Usage: ./scripts/hubspot-properties-curl.sh 'your-session-cookie'"
    echo ""
    echo "To get your session cookie:"
    echo "1. Open your browser and go to http://localhost:3000"
    echo "2. Login to your account"
    echo "3. Open Developer Tools (F12)"
    echo "4. Go to Application/Storage tab"
    echo "5. Find the 'sb-' cookie under Cookies"
    echo "6. Copy the entire cookie value"
    echo ""
    echo "Example: ./scripts/hubspot-properties-curl.sh 'sb-abc123...'"
    exit 1
fi

SESSION_COOKIE="$1"

echo "📡 Fetching HubSpot access token..."
TOKEN_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/integrations/hubspot/test-token" \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=$SESSION_COOKIE")

echo "Token response: $TOKEN_RESPONSE"

# Extract access token from response
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Failed to get access token. Please check your session cookie."
    exit 1
fi

echo "✅ Got access token: ${ACCESS_TOKEN:0:20}..."

echo ""
echo "📡 Fetching HubSpot contact properties..."
echo "========================================"

# Fetch all contact properties
PROPERTIES_RESPONSE=$(curl -s -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

# Check if the request was successful
if echo "$PROPERTIES_RESPONSE" | grep -q '"error"'; then
    echo "❌ Error fetching properties:"
    echo "$PROPERTIES_RESPONSE"
    exit 1
fi

echo "✅ Successfully fetched properties!"

# Filter and display only visible, non-archived properties
echo ""
echo "🔍 Filtered Properties (Visible, Non-archived):"
echo "==============================================="

echo "$PROPERTIES_RESPONSE" | jq -r '.results[] | select(.hidden == false and .archived == false) | "\(.name) | \(.label) | \(.type) | \(.groupName)"' | column -t -s '|'

# Count total vs filtered
TOTAL_COUNT=$(echo "$PROPERTIES_RESPONSE" | jq '.results | length')
FILTERED_COUNT=$(echo "$PROPERTIES_RESPONSE" | jq '.results[] | select(.hidden == false and .archived == false) | .name' | wc -l)

echo ""
echo "📊 Summary:"
echo "Total properties: $TOTAL_COUNT"
echo "Visible properties: $FILTERED_COUNT"
echo "Hidden/archived filtered out: $((TOTAL_COUNT - FILTERED_COUNT))"

# Save filtered properties to a file
echo ""
echo "💾 Saving filtered properties to hubspot-visible-properties.json..."
echo "$PROPERTIES_RESPONSE" | jq '.results[] | select(.hidden == false and .archived == false)' | jq -s '.' > hubspot-visible-properties.json

echo "✅ Filtered properties saved to hubspot-visible-properties.json"
echo ""
echo "🎉 Done! You can now view the filtered properties in the JSON file." 
#!/bin/bash

# HubSpot All Contact Fields Fetcher
# This script fetches ALL available contact properties, not just ones with data

echo "🔍 HubSpot All Contact Properties Fetcher"
echo "========================================="

# Check if we have an access token
if [ -z "$1" ]; then
    echo "❌ Error: Please provide your HubSpot access token"
    echo ""
    echo "Usage: ./scripts/get-all-hubspot-fields.sh 'YOUR_ACCESS_TOKEN'"
    echo ""
    echo "To get your access token:"
    echo "1. Open browser → http://localhost:3000"
    echo "2. Login and go to /debug-hubspot"
    echo "3. Open Developer Tools (F12) → Network tab"
    echo "4. Refresh page and find the debug-contacts request"
    echo "5. Look for the access token in the response"
    echo ""
    echo "Example: ./scripts/get-all-hubspot-fields.sh 'pat-na1-abc123...'"
    exit 1
fi

ACCESS_TOKEN="$1"

echo "📡 Fetching ALL HubSpot contact properties..."
echo "============================================="

# Fetch all properties
RESPONSE=$(curl -s -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

# Check if request was successful
if echo "$RESPONSE" | grep -q '"error"'; then
    echo "❌ Error fetching properties:"
    echo "$RESPONSE"
    exit 1
fi

echo "✅ Successfully fetched properties!"

# Get total count
TOTAL_COUNT=$(echo "$RESPONSE" | jq '.results | length')
echo ""
echo "📊 Total Properties Available: $TOTAL_COUNT"

# Show all properties (not just visible ones)
echo ""
echo "🔍 ALL Available Contact Properties:"
echo "===================================="
echo "$RESPONSE" | jq -r '.results[] | "\(.name) | \(.label) | \(.type) | \(.groupName) | Hidden: \(.hidden) | Archived: \(.archived)"' | column -t -s '|'

# Show only visible, non-archived properties
echo ""
echo "🔍 Visible, Non-archived Properties:"
echo "===================================="
echo "$RESPONSE" | jq -r '.results[] | select(.hidden == false and .archived == false) | "\(.name) | \(.label) | \(.type) | \(.groupName)"' | column -t -s '|'

# Count visible vs total
VISIBLE_COUNT=$(echo "$RESPONSE" | jq '.results[] | select(.hidden == false and .archived == false) | .name' | wc -l)
HIDDEN_COUNT=$(echo "$RESPONSE" | jq '.results[] | select(.hidden == true) | .name' | wc -l)
ARCHIVED_COUNT=$(echo "$RESPONSE" | jq '.results[] | select(.archived == true) | .name' | wc -l)

echo ""
echo "📊 Summary:"
echo "Total properties: $TOTAL_COUNT"
echo "Visible properties: $VISIBLE_COUNT"
echo "Hidden properties: $HIDDEN_COUNT"
echo "Archived properties: $ARCHIVED_COUNT"

# Show property groups
echo ""
echo "📂 Property Groups:"
echo "=================="
echo "$RESPONSE" | jq -r '.results[] | .groupName' | sort | uniq -c | sort -nr

# Save all properties to file
echo ""
echo "💾 Saving all properties to hubspot-all-properties.json..."
echo "$RESPONSE" > hubspot-all-properties.json

# Save visible properties to separate file
echo "💾 Saving visible properties to hubspot-visible-properties.json..."
echo "$RESPONSE" | jq '.results[] | select(.hidden == false and .archived == false)' | jq -s '.' > hubspot-visible-properties.json

echo "✅ Files saved!"
echo ""
echo "🎉 Done! You can now see ALL available contact properties."
echo ""
echo "📝 Note: The fields you saw earlier were just the ones with data for a sample contact."
echo "   This shows you ALL available fields, including empty ones." 
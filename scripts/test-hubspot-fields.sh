#!/bin/bash

# Test HubSpot Fields API Endpoint
# This script tests the HubSpot all-contact-properties API endpoint

echo "🧪 Testing HubSpot Fields API Endpoint"
echo "======================================"

echo "📡 Testing API endpoint..."
RESPONSE=$(curl -s -X GET "http://localhost:3000/api/integrations/hubspot/all-contact-properties" \
  -H "Content-Type: application/json")

echo "📊 Response Status:"
echo "$RESPONSE" | jq '.'

echo ""
echo "🔍 Checking for success field..."
SUCCESS=$(echo "$RESPONSE" | jq -r '.success // "null"')
echo "Success: $SUCCESS"

echo ""
echo "🔍 Checking for error field..."
ERROR=$(echo "$RESPONSE" | jq -r '.error // "null"')
echo "Error: $ERROR"

if [ "$ERROR" != "null" ]; then
    echo ""
    echo "❌ API Error Details:"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

if [ "$SUCCESS" = "true" ]; then
    echo ""
    echo "✅ API Success! Checking data structure..."
    
    echo ""
    echo "📊 Properties Count:"
    PROPERTIES_COUNT=$(echo "$RESPONSE" | jq '.data.properties | length // 0')
    echo "Total properties: $PROPERTIES_COUNT"
    
    echo ""
    echo "📂 Groups Count:"
    GROUPS_COUNT=$(echo "$RESPONSE" | jq '.data.groupedProperties | keys | length // 0')
    echo "Total groups: $GROUPS_COUNT"
    
    echo ""
    echo "🔍 Sample Properties (first 5):"
    echo "$RESPONSE" | jq '.data.properties[0:5] | .[] | {name: .name, label: .label, type: .type, groupName: .groupName}'
    
    echo ""
    echo "📂 Available Groups:"
    echo "$RESPONSE" | jq -r '.data.groupedProperties | keys[]'
    
    echo ""
    echo "💾 Saving full response to test-response.json..."
    echo "$RESPONSE" > test-response.json
    echo "✅ Response saved!"
    
else
    echo ""
    echo "❌ API returned success=false"
    echo "Full response:"
    echo "$RESPONSE" | jq '.'
fi 
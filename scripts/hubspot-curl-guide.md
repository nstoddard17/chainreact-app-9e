# HubSpot API Curl Guide

This guide shows you how to use curl to fetch HubSpot contact properties using the same access token as the debug endpoint.

## 🔑 Getting the Access Token

### Method 1: From Browser (Recommended)
1. **Open your browser** and go to `http://localhost:3000`
2. **Login** to your account
3. **Navigate to** `/debug-hubspot` page
4. **Open Developer Tools** (F12)
5. **Go to Network tab**
6. **Refresh the page** or click "Refresh" button
7. **Find the request** to `/api/integrations/hubspot/debug-contacts`
8. **Click on it** and look at the **Response** tab
9. **Look for the access token** in the response data

### Method 2: From Application Code
The access token is retrieved using the same method as the debug endpoint:
```typescript
const accessToken = await getDecryptedAccessToken(user.id, "hubspot")
```

## 🚀 Curl Commands

### 1. Fetch All Contact Properties
```bash
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

### 2. Fetch Only Visible, Non-archived Properties
```bash
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" | \
  jq '.results[] | select(.hidden == false and .archived == false)'
```

### 3. Get Properties with Specific Fields
```bash
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" | \
  jq '.results[] | select(.hidden == false and .archived == false) | {name: .name, label: .label, type: .type, groupName: .groupName}'
```

### 4. Count Total vs Visible Properties
```bash
# Get total count
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" | \
  jq '.results | length'

# Get visible count
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" | \
  jq '.results[] | select(.hidden == false and .archived == false) | .name' | wc -l
```

### 5. Save Properties to File
```bash
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" | \
  jq '.results[] | select(.hidden == false and .archived == false)' | \
  jq -s '.' > hubspot-visible-properties.json
```

## 📊 Example Output

### Raw API Response Structure
```json
{
  "results": [
    {
      "name": "email",
      "label": "Email Address",
      "type": "string",
      "fieldType": "text",
      "groupName": "contactinformation",
      "hidden": false,
      "archived": false,
      "readOnly": false,
      "calculated": false
    }
  ]
}
```

### Filtered Properties Table
```
name                    | label                | type      | groupName
email                   | Email Address        | string    | contactinformation
firstname               | First Name           | string    | contactinformation
lastname                | Last Name            | string    | contactinformation
phone                   | Phone Number         | string    | contactinformation
company                 | Company Name         | string    | contactinformation
```

## 🔧 Using Our API Endpoint

If you want to use our existing API endpoint that already filters the properties:

```bash
# This uses the same authentication as the debug endpoint
curl -X GET "http://localhost:3000/api/integrations/hubspot/all-contact-properties" \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

## 🎯 Key Differences

### Debug Endpoint vs Direct HubSpot API

| Aspect | Debug Endpoint | Direct HubSpot API |
|--------|----------------|-------------------|
| **Authentication** | Session-based | Bearer token |
| **Filtering** | Pre-filtered | Manual filtering |
| **Data Structure** | Formatted for UI | Raw HubSpot format |
| **Properties** | Only visible ones | All properties |

### Filtering Logic
```javascript
// Same filtering used in our API
properties.filter(prop => 
  prop.hidden === false && 
  prop.archived === false
)
```

## 🚨 Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check if access token is valid
   - Ensure token hasn't expired
   - Verify HubSpot integration is connected

2. **403 Forbidden**
   - Check API scopes
   - Ensure proper permissions

3. **Rate Limiting**
   - HubSpot has rate limits
   - Add delays between requests if needed

### Debug Commands

```bash
# Test authentication
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -v

# Check response headers
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -I
```

## 📝 Notes

- The access token used in the debug endpoint is the same one used for direct HubSpot API calls
- Our API endpoint already filters out hidden and archived properties
- The filtering logic matches what we implemented in the configuration modal
- All visible properties are available for the "All Available HubSpot Fields" selector 
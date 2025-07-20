# HubSpot Execution Test Guide

## Overview
This guide helps verify that the HubSpot "Create Contact" action properly handles additional fields selected from the "All Available Fields" section.

## Test Setup

### 1. Configuration Data Structure
The configuration should have this structure when additional fields are selected:

```javascript
{
  // Main required fields
  name: "John Doe",
  email: "john.doe@example.com", 
  phone: "+1-555-123-4567",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  // Additional fields from AllFieldsSelector
  all_available_fields: [
    "jobtitle",
    "company", 
    "website",
    "lifecyclestage",
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2"
  ],
  
  // Values for the additional fields
  all_field_values: {
    jobtitle: "Software Engineer",
    company: "Acme Corp",
    website: "https://acme.com",
    lifecyclestage: "lead",
    hs_analytics_source: "DIRECT_TRAFFIC",
    hs_analytics_source_data_1: "google.com",
    hs_analytics_source_data_2: "organic"
  }
}
```

### 2. Expected Execution Flow

#### Step 1: Configuration Resolution
- The `resolveValue` function processes the config with input data
- Any workflow variables are resolved to actual values

#### Step 2: Property Building
The execution should:
1. Start with basic properties (email, name, phone, etc.)
2. Process `all_available_fields` array
3. For each field name, get the value from `all_field_values`
4. Add non-empty values to the properties object

#### Step 3: API Call
- Send all properties to HubSpot API
- Include both main fields and additional fields

### 3. Testing Steps

#### Test 1: Basic Fields Only
```javascript
const config = {
  name: "Test User",
  email: "test@example.com",
  phone: "+1-555-0000",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy", 
  preferred_channels: "Email"
}
```

#### Test 2: With Additional Fields
```javascript
const config = {
  name: "Test User",
  email: "test@example.com", 
  phone: "+1-555-0000",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["jobtitle", "company"],
  all_field_values: {
    jobtitle: "Developer",
    company: "Test Corp"
  }
}
```

#### Test 3: With Workflow Variables
```javascript
const config = {
  name: "{{input.name}}",
  email: "{{input.email}}",
  phone: "{{input.phone}}",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["jobtitle", "company"],
  all_field_values: {
    jobtitle: "{{input.job_title}}",
    company: "{{input.company_name}}"
  }
}

const input = {
  name: "John Doe",
  email: "john@example.com",
  phone: "+1-555-1234",
  job_title: "Engineer",
  company_name: "Tech Corp"
}
```

### 4. Expected API Payload

The final payload sent to HubSpot should look like:

```json
{
  "properties": {
    "email": "test@example.com",
    "firstname": "Test",
    "lastname": "User", 
    "phone": "+1-555-0000",
    "hs_lead_status": "NEW",
    "favorite_content_topics": "Strategy",
    "preferred_channels": "Email",
    "jobtitle": "Developer",
    "company": "Test Corp"
  }
}
```

### 5. Verification Points

1. **Field Selection**: Verify that only selected fields from `all_available_fields` are processed
2. **Value Mapping**: Verify that values from `all_field_values` are correctly mapped
3. **Empty Values**: Verify that empty/null/undefined values are filtered out
4. **Variable Resolution**: Verify that workflow variables are properly resolved
5. **API Response**: Verify that the created contact has all the expected properties

### 6. Debug Logging

The execution includes console logs to help debug:

```javascript
console.log('Processing all available fields:', all_available_fields)
console.log('All field values:', all_field_values)
console.log(`Added field ${fieldName} with value:`, all_field_values[fieldName])
console.log('Final properties being sent to HubSpot:', properties)
```

### 7. Common Issues

1. **Missing Field Values**: If `all_field_values` is missing or empty
2. **Type Mismatches**: If field values don't match expected HubSpot field types
3. **Invalid Field Names**: If field names don't exist in HubSpot
4. **Variable Resolution**: If workflow variables aren't properly resolved

### 8. Testing Commands

```bash
# Test the API endpoint directly
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "workflowId": "test-workflow",
    "nodeId": "hubspot-node",
    "config": {
      "name": "Test User",
      "email": "test@example.com",
      "phone": "+1-555-0000",
      "hs_lead_status": "NEW",
      "favorite_content_topics": "Strategy",
      "preferred_channels": "Email",
      "all_available_fields": ["jobtitle", "company"],
      "all_field_values": {
        "jobtitle": "Developer",
        "company": "Test Corp"
      }
    }
  }'
```

## Success Criteria

✅ Additional fields are included in the HubSpot API call  
✅ Field values are correctly mapped from `all_field_values`  
✅ Empty values are filtered out  
✅ Workflow variables are properly resolved  
✅ The created contact has all expected properties  
✅ No errors in the execution logs  
✅ Contact is successfully created in HubSpot 
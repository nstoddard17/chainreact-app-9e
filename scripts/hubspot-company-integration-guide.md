# HubSpot Contact + Company Integration Guide

## 🎯 Problem Solved

**Issue**: When using the "Create Contact" action with company information, the company data was being stored as a property on the contact record, but no separate company record was being created in HubSpot's Companies table.

**Solution**: Enhanced the "Create Contact" action to automatically create a company record when company information is provided, and associate the contact with that company.

## 🔧 Enhanced Functionality

### **Before (Original Behavior):**
- ✅ Creates contact record in Contacts table
- ❌ Company info stored as contact property only
- ❌ No company record created
- ❌ No contact-company association

### **After (Enhanced Behavior):**
- ✅ Creates contact record in Contacts table
- ✅ Creates company record in Companies table (when company info provided)
- ✅ Associates contact with company
- ✅ Provides comprehensive output with both IDs

## 📋 How It Works

### **1. Contact Creation Process**
```typescript
// Step 1: Create contact with all properties
const contactResponse = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ properties: contactProperties })
})
```

### **2. Company Detection**
```typescript
// Check for company information in contact properties
const companyName = properties.company || properties.hs_analytics_source_data_1

if (companyName && companyName.trim()) {
  // Company information found - create company record
}
```

### **3. Company Creation**
```typescript
// Prepare company properties from contact data
const companyProperties = {
  name: companyName,
  domain: properties.website,
  phone: properties.phone,
  address: properties.address,
  city: properties.city,
  state: properties.state,
  zip: properties.zip,
  country: properties.country,
  industry: properties.industry
}

// Create company record
const companyResponse = await fetch("https://api.hubapi.com/crm/v3/objects/companies", {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ properties: companyProperties })
})
```

### **4. Contact-Company Association**
```typescript
// Associate contact with company
const associationResponse = await fetch(
  `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` }
  }
)
```

## 🎯 Company Detection Logic

The system looks for company information in these fields (in order of priority):

1. **`company`** - Direct company field
2. **`hs_analytics_source_data_1`** - Often contains company name from analytics

### **Example Scenarios:**

#### **Scenario 1: Direct Company Field**
```javascript
{
  all_available_fields: ["company", "website"],
  all_field_values: {
    company: "Acme Corporation",
    website: "https://acme.com"
  }
}
// ✅ Creates company "Acme Corporation"
```

#### **Scenario 2: Analytics Source Field**
```javascript
{
  all_available_fields: ["hs_analytics_source_data_1", "website"],
  all_field_values: {
    hs_analytics_source_data_1: "TechCorp Inc",
    website: "https://techcorp.com"
  }
}
// ✅ Creates company "TechCorp Inc"
```

#### **Scenario 3: No Company Information**
```javascript
{
  all_available_fields: ["jobtitle", "phone"],
  all_field_values: {
    jobtitle: "Software Engineer",
    phone: "+1-555-1234"
  }
}
// ℹ️ No company created (only contact)
```

## 📊 Output Structure

### **Enhanced Output Object:**
```typescript
{
  success: true,
  output: {
    // Contact information
    contactId: "contact_123",
    email: "john@acme.com",
    name: "John Doe",
    phone: "+1-555-1234",
    hs_lead_status: "NEW",
    favorite_content_topics: "Strategy",
    preferred_channels: "Email",
    properties: { /* all contact properties */ },
    createdAt: "2025-07-20T20:57:44.023Z",
    updatedAt: "2025-07-20T20:57:44.024Z",
    hubspotResponse: { /* full HubSpot response */ },
    
    // Company information (if created)
    companyId: "company_456",        // null if no company created
    companyCreated: true             // false if no company created
  },
  message: "HubSpot contact created successfully with email john@acme.com and associated with company Acme Corporation"
}
```

## 🔍 Company Properties Mapping

When a company is created, these contact properties are mapped to company properties:

| Contact Property | Company Property | Description |
|------------------|------------------|-------------|
| `company` | `name` | Company name |
| `website` | `domain` | Company website/domain |
| `phone` | `phone` | Company phone number |
| `address` | `address` | Company address |
| `city` | `city` | Company city |
| `state` | `state` | Company state |
| `zip` | `zip` | Company zip code |
| `country` | `country` | Company country |
| `industry` | `industry` | Company industry |

## 🧪 Testing

### **Test Scripts Created:**
1. `scripts/test-hubspot-execution-flow.js` - Basic execution flow testing
2. `scripts/test-hubspot-contact-with-company.js` - Enhanced contact+company testing

### **Test Scenarios Covered:**
- ✅ Contact with company information
- ✅ Contact without company information  
- ✅ Contact with company from analytics field
- ✅ Contact with workflow variables
- ✅ Error handling for company creation failures

## 🚀 Usage Examples

### **Example 1: Basic Contact + Company**
```javascript
const config = {
  name: "John Doe",
  email: "john@acme.com",
  phone: "+1-555-1234",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["company", "website", "industry"],
  all_field_values: {
    company: "Acme Corporation",
    website: "https://acme.com",
    industry: "Technology"
  }
}
```

**Result:**
- ✅ Contact created in Contacts table
- ✅ Company "Acme Corporation" created in Companies table
- ✅ Contact associated with company
- ✅ Output includes both `contactId` and `companyId`

### **Example 2: Contact Only (No Company)**
```javascript
const config = {
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "+1-555-5678",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email"
}
```

**Result:**
- ✅ Contact created in Contacts table
- ℹ️ No company created (no company information provided)
- ✅ Output includes `contactId` only, `companyId` is null

### **Example 3: With Workflow Variables**
```javascript
const config = {
  name: "{{input.name}}",
  email: "{{input.email}}",
  phone: "{{input.phone}}",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["company", "website"],
  all_field_values: {
    company: "{{input.company_name}}",
    website: "{{input.company_website}}"
  }
}

const input = {
  name: "Alice Johnson",
  email: "alice@startup.com",
  phone: "+1-555-1111",
  company_name: "StartupXYZ",
  company_website: "https://startupxyz.com"
}
```

**Result:**
- ✅ Contact created with resolved variables
- ✅ Company "StartupXYZ" created with resolved variables
- ✅ Contact associated with company

## 🔧 Error Handling

### **Graceful Degradation:**
- If company creation fails, contact creation still succeeds
- Warning logs are generated for company creation failures
- Association failures don't prevent contact creation
- All errors are logged for debugging

### **Error Scenarios:**
1. **Company API Error**: Contact created, company creation skipped
2. **Association Error**: Both contact and company created, association skipped
3. **Invalid Company Data**: Contact created, company creation skipped

## 📈 Benefits

### **For Users:**
- **Simplified Workflow**: One action creates both contact and company
- **Automatic Association**: No need for separate association step
- **Comprehensive Data**: Company information properly stored in Companies table
- **Better CRM Organization**: Proper HubSpot data structure

### **For HubSpot:**
- **Proper Data Structure**: Companies in Companies table, contacts in Contacts table
- **Associations**: Proper contact-company relationships
- **Analytics**: Better reporting and analytics capabilities
- **Compliance**: Follows HubSpot best practices

## 🎉 Summary

The enhanced "Create Contact" action now provides:

1. **✅ Contact Creation**: Creates contact record with all properties
2. **✅ Company Detection**: Automatically detects company information
3. **✅ Company Creation**: Creates company record when company info is provided
4. **✅ Association**: Links contact to company automatically
5. **✅ Comprehensive Output**: Returns both contact and company IDs
6. **✅ Error Handling**: Graceful degradation if company creation fails
7. **✅ Workflow Variables**: Supports dynamic company information

**Result**: When you add company information to a contact, it will now appear in HubSpot's Companies table as a proper company record, not just as a contact property! 🚀 
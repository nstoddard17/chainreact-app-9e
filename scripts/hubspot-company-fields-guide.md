# HubSpot Company Fields Integration Guide

## 🎯 New Feature: Company-Specific Fields

**Problem Solved**: When creating a contact with company information, users can now also populate company-specific fields that are part of HubSpot's Companies table, not just contact properties.

**Solution**: Enhanced the "Create Contact" action to automatically show company-specific field selectors when a company field is selected, allowing users to populate both contact and company data in one workflow.

## 🔧 How It Works

### **1. Dynamic Field Detection**
When a user selects the "company" or "hs_analytics_source_data_1" field in the "All Available Fields" section, the system automatically detects this and shows a new "Company Fields" section.

### **2. Company Fields API**
- **Endpoint**: `/api/integrations/hubspot/all-company-properties`
- **Purpose**: Fetches all available HubSpot company properties
- **Features**: 
  - Groups properties by category (Company Info, Sales Properties, Marketing, etc.)
  - Provides existing values for dropdowns
  - Filters out hidden, archived, and read-only fields

### **3. Company Fields Selector Component**
- **Component**: `CompanyFieldsSelector.tsx`
- **Features**:
  - Tabbed interface by property groups
  - Search functionality
  - Variable picker integration
  - Support for different field types (text, select, number, boolean, textarea)
  - Existing values dropdowns for text fields

### **4. Enhanced Execution Logic**
The HubSpot action now processes both contact and company fields:
- **Contact fields**: Stored as contact properties
- **Company fields**: Used to create company record with specific company properties
- **Fallback logic**: Contact properties are used as company properties if company-specific fields aren't provided

## 📋 Configuration Structure

### **Enhanced Config Object:**
```typescript
{
  // Main contact fields
  name: "John Doe",
  email: "john@acme.com",
  phone: "+1-555-1234",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  // Contact additional fields
  all_available_fields: ["company", "website", "jobtitle"],
  all_field_values: {
    company: "Acme Corporation",
    website: "https://acme.com",
    jobtitle: "Software Engineer"
  },
  
  // Company-specific fields (new!)
  company_fields: ["industry", "annualrevenue", "numberofemployees", "lifecyclestage"],
  company_field_values: {
    industry: "Technology",
    annualrevenue: "1000000",
    numberofemployees: "50",
    lifecyclestage: "customer"
  }
}
```

## 🎯 Company Field Categories

The company fields are organized into logical groups:

### **Company Information**
- `name` - Company name
- `domain` - Company website/domain
- `phone` - Company phone number
- `address` - Company address
- `city`, `state`, `zip`, `country` - Location fields
- `industry` - Company industry
- `description` - Company description

### **Sales Properties**
- `annualrevenue` - Annual revenue
- `numberofemployees` - Number of employees
- `lifecyclestage` - Lifecycle stage
- `dealstage` - Deal stage
- `pipeline` - Sales pipeline

### **Marketing Properties**
- `hs_analytics_source` - Analytics source
- `hs_analytics_source_data_1` - Source data 1
- `hs_analytics_source_data_2` - Source data 2
- `hs_analytics_first_timestamp` - First visit timestamp
- `hs_analytics_last_timestamp` - Last visit timestamp

### **Social Media**
- `twitterhandle` - Twitter handle
- `facebook_company_page` - Facebook page
- `linkedin_company_page` - LinkedIn page

## 🚀 User Experience Flow

### **Step 1: Select Contact Fields**
1. User fills in main contact fields (name, email, phone, etc.)
2. User opens "All Available Fields" section
3. User selects additional contact fields including "company"

### **Step 2: Company Fields Appear**
1. System detects company field selection
2. New "Company Fields" section appears below contact fields
3. User sees tabbed interface with company field categories

### **Step 3: Configure Company Fields**
1. User selects relevant company fields (industry, revenue, etc.)
2. User inputs values for selected company fields
3. User can use Variable Picker to insert workflow variables

### **Step 4: Execution**
1. Contact is created with all contact properties
2. Company is created with company-specific properties
3. Contact is associated with company
4. Both records are properly linked in HubSpot

## 🔍 Field Priority Logic

### **Company Properties Priority:**
1. **Company-specific fields** (highest priority)
   - Values from `company_field_values`
   - These are the fields selected in the Company Fields section

2. **Contact fields as company properties** (fallback)
   - Values from contact properties that can be mapped to company properties
   - Only used if company-specific field is not provided

### **Example Priority:**
```typescript
// If both are provided:
contact_properties: { industry: "Software" }
company_field_values: { industry: "Technology" }

// Result: Company gets industry = "Technology" (company field wins)
```

## 🧪 Testing Scenarios

### **Test 1: Company Fields + Contact Fields**
```javascript
{
  all_available_fields: ["company", "website"],
  all_field_values: { company: "Acme Corp", website: "https://acme.com" },
  company_fields: ["industry", "annualrevenue"],
  company_field_values: { industry: "Technology", annualrevenue: "1000000" }
}
```
**Result**: Company created with industry="Technology", revenue="1000000", domain="https://acme.com"

### **Test 2: Contact Fields Only**
```javascript
{
  all_available_fields: ["company", "website", "industry"],
  all_field_values: { company: "TechCorp", website: "https://techcorp.com", industry: "Software" }
}
```
**Result**: Company created with industry="Software", domain="https://techcorp.com"

### **Test 3: Workflow Variables**
```javascript
{
  all_available_fields: ["company"],
  all_field_values: { company: "{{input.company_name}}" },
  company_fields: ["industry", "annualrevenue"],
  company_field_values: { 
    industry: "{{input.industry}}", 
    annualrevenue: "{{input.revenue}}" 
  }
}
```
**Result**: Variables resolved and company created with dynamic values

### **Test 4: No Company Field**
```javascript
{
  all_available_fields: ["jobtitle", "department"],
  all_field_values: { jobtitle: "Engineer", department: "Engineering" }
}
```
**Result**: Only contact created, no company record

## 📊 API Response Structure

### **Enhanced Output:**
```typescript
{
  success: true,
  output: {
    // Contact information
    contactId: "contact_123",
    email: "john@acme.com",
    name: "John Doe",
    // ... other contact properties
    
    // Company information (if created)
    companyId: "company_456",
    companyCreated: true,
    
    // Full responses
    hubspotResponse: { /* contact response */ },
    companyResponse: { /* company response */ }
  },
  message: "HubSpot contact created successfully with email john@acme.com and associated with company Acme Corporation"
}
```

## 🔧 Technical Implementation

### **Files Modified:**

#### **1. API Endpoint**
- `app/api/integrations/hubspot/all-company-properties/route.ts`
- Fetches HubSpot company properties
- Groups by category
- Provides existing values

#### **2. Integration Store**
- `stores/integrationStore.ts`
- Added `hubspot_all_company_properties` data type
- Enables dynamic loading of company properties

#### **3. Company Fields Component**
- `components/workflows/CompanyFieldsSelector.tsx`
- Tabbed interface for company fields
- Variable picker integration
- Search and filtering

#### **4. Configuration Modal**
- `components/workflows/ConfigurationModal.tsx`
- Detects company field selection
- Shows/hides company fields section
- Manages company field state

#### **5. HubSpot Action**
- `lib/workflows/actions/hubspot.ts`
- Processes company-specific fields
- Creates company with proper properties
- Associates contact with company

## 🎉 Benefits

### **For Users:**
- **One Workflow**: Create contact and company in single action
- **Proper Data Structure**: Company data goes to Companies table
- **Rich Company Data**: Access to all HubSpot company properties
- **Dynamic Fields**: Only relevant company fields shown
- **Variable Support**: Use workflow variables in company fields

### **For HubSpot:**
- **Proper CRM Structure**: Companies in Companies table
- **Better Associations**: Proper contact-company relationships
- **Enhanced Analytics**: Rich company data for reporting
- **Compliance**: Follows HubSpot best practices

### **For Workflows:**
- **Simplified Logic**: One action instead of two
- **Better Data Flow**: Company ID available for downstream actions
- **Error Handling**: Graceful degradation if company creation fails
- **Flexibility**: Optional company creation based on field selection

## 🚀 Usage Examples

### **Example 1: Basic Company Creation**
```javascript
// User selects in UI:
// - Contact fields: name, email, phone, company
// - Company fields: industry, annualrevenue, numberofemployees

// Result: Creates contact and company with proper data structure
```

### **Example 2: Lead Qualification Workflow**
```javascript
// Workflow: Form submission → Create contact with company → Send welcome email
// Company fields: industry, annualrevenue, lifecyclestage
// Result: Rich company data for lead scoring and segmentation
```

### **Example 3: Account-Based Marketing**
```javascript
// Workflow: Website visit → Create contact with company → Add to ABM list
// Company fields: industry, numberofemployees, annualrevenue
// Result: Proper company records for ABM campaigns
```

## 🔍 Troubleshooting

### **Common Issues:**

#### **1. Company Fields Not Showing**
- **Cause**: Company field not selected in "All Available Fields"
- **Solution**: Select "company" or "hs_analytics_source_data_1" field

#### **2. Company Not Created**
- **Cause**: No company name provided
- **Solution**: Ensure company field has a value

#### **3. Company Fields Not Saving**
- **Cause**: Company field deselected
- **Solution**: Keep company field selected to maintain company fields

#### **4. API Errors**
- **Cause**: HubSpot integration issues
- **Solution**: Check HubSpot connection and permissions

## 🎯 Summary

The enhanced HubSpot "Create Contact" action now provides:

1. **✅ Dynamic Company Fields**: Automatically shows when company field is selected
2. **✅ Rich Company Data**: Access to all HubSpot company properties
3. **✅ Proper Data Structure**: Companies created in Companies table
4. **✅ Smart Field Mapping**: Company-specific fields take priority
5. **✅ Variable Support**: Workflow variables in company fields
6. **✅ Graceful Degradation**: Contact creation succeeds even if company fails
7. **✅ Comprehensive Output**: Both contact and company IDs returned

**Result**: Users can now create rich company records with proper HubSpot data structure, all from a single contact creation workflow! 🚀 
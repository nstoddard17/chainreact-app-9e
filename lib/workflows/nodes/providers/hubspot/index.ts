import { NodeComponent } from "../../types"
import {
  UserPlus,
  User,
  UserMinus,
  Building,
  DollarSign,
  Plus,
  Users,
  Edit,
  Search
} from "lucide-react"

// HubSpot Triggers
const hubspotTriggerContactCreated: NodeComponent = {
  type: "hubspot_trigger_contact_created",
  title: "Contact Created",
  description: "Triggers when a new contact is created in HubSpot",
  icon: UserPlus,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [],
  outputSchema: [
    {
      name: "contactId",
      label: "Contact ID",
      type: "string",
      description: "The unique ID of the created contact"
    },
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "The contact's email address"
    },
    {
      name: "firstName",
      label: "First Name",
      type: "string",
      description: "The contact's first name"
    },
    {
      name: "lastName",
      label: "Last Name",
      type: "string",
      description: "The contact's last name"
    },
    {
      name: "company",
      label: "Company",
      type: "string",
      description: "The contact's company name"
    },
    {
      name: "phone",
      label: "Phone",
      type: "string",
      description: "The contact's phone number"
    },
    {
      name: "hubspotOwner",
      label: "HubSpot Owner",
      type: "string",
      description: "The contact's assigned owner in HubSpot"
    },
    {
      name: "lifecycleStage",
      label: "Lifecycle Stage",
      type: "string",
      description: "The contact's lifecycle stage (e.g., lead, customer)"
    },
    {
      name: "leadStatus",
      label: "Lead Status",
      type: "string",
      description: "The contact's lead status"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the contact was created"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerContactUpdated: NodeComponent = {
  type: "hubspot_trigger_contact_updated",
  title: "Contact Property Updated",
  description: "Triggers when a contact property is updated in HubSpot",
  icon: User,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "propertyName",
      label: "Property Name",
      type: "text",
      required: false,
      placeholder: "e.g., email, phone, hs_lead_status",
      description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
    },
  ],
  outputSchema: [
    {
      name: "contactId",
      label: "Contact ID",
      type: "string",
      description: "The unique ID of the updated contact"
    },
    {
      name: "propertyName",
      label: "Property Name",
      type: "string",
      description: "The name of the property that was updated"
    },
    {
      name: "propertyValue",
      label: "New Property Value",
      type: "string",
      description: "The new value of the updated property"
    },
    {
      name: "previousValue",
      label: "Previous Value",
      type: "string",
      description: "The previous value of the property"
    },
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "The contact's email address"
    },
    {
      name: "firstName",
      label: "First Name",
      type: "string",
      description: "The contact's first name"
    },
    {
      name: "lastName",
      label: "Last Name",
      type: "string",
      description: "The contact's last name"
    },
    {
      name: "company",
      label: "Company",
      type: "string",
      description: "The contact's company name"
    },
    {
      name: "updateTimestamp",
      label: "Update Timestamp",
      type: "string",
      description: "When the property was updated"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerContactDeleted: NodeComponent = {
  type: "hubspot_trigger_contact_deleted",
  title: "Contact Deleted",
  description: "Triggers when a contact is deleted from HubSpot",
  icon: UserMinus,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [],
  outputSchema: [
    {
      name: "contactId",
      label: "Contact ID",
      type: "string",
      description: "The unique ID of the deleted contact"
    },
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "The contact's email address (if available)"
    },
    {
      name: "firstName",
      label: "First Name",
      type: "string",
      description: "The contact's first name (if available)"
    },
    {
      name: "lastName",
      label: "Last Name",
      type: "string",
      description: "The contact's last name (if available)"
    },
    {
      name: "deleteTimestamp",
      label: "Delete Timestamp",
      type: "string",
      description: "When the contact was deleted"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerCompanyCreated: NodeComponent = {
  type: "hubspot_trigger_company_created",
  title: "Company Created",
  description: "Triggers when a new company is created in HubSpot",
  icon: Building,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [],
  outputSchema: [
    {
      name: "companyId",
      label: "Company ID",
      type: "string",
      description: "The unique ID of the created company"
    },
    {
      name: "name",
      label: "Company Name",
      type: "string",
      description: "The company's name"
    },
    {
      name: "domain",
      label: "Website Domain",
      type: "string",
      description: "The company's website domain"
    },
    {
      name: "industry",
      label: "Industry",
      type: "string",
      description: "The company's industry"
    },
    {
      name: "city",
      label: "City",
      type: "string",
      description: "The company's city"
    },
    {
      name: "state",
      label: "State",
      type: "string",
      description: "The company's state/region"
    },
    {
      name: "country",
      label: "Country",
      type: "string",
      description: "The company's country"
    },
    {
      name: "numberOfEmployees",
      label: "Number of Employees",
      type: "string",
      description: "The company's employee count"
    },
    {
      name: "annualRevenue",
      label: "Annual Revenue",
      type: "string",
      description: "The company's annual revenue"
    },
    {
      name: "hubspotOwner",
      label: "HubSpot Owner",
      type: "string",
      description: "The company's assigned owner in HubSpot"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the company was created"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerCompanyUpdated: NodeComponent = {
  type: "hubspot_trigger_company_updated",
  title: "Company Property Updated",
  description: "Triggers when a company property is updated in HubSpot",
  icon: Building,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "propertyName",
      label: "Property Name",
      type: "text",
      required: false,
      placeholder: "e.g., name, domain, industry",
      description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
    },
  ],
  outputSchema: [
    {
      name: "companyId",
      label: "Company ID",
      type: "string",
      description: "The unique ID of the updated company"
    },
    {
      name: "propertyName",
      label: "Property Name",
      type: "string",
      description: "The name of the property that was updated"
    },
    {
      name: "propertyValue",
      label: "New Property Value",
      type: "string",
      description: "The new value of the updated property"
    },
    {
      name: "previousValue",
      label: "Previous Value",
      type: "string",
      description: "The previous value of the property"
    },
    {
      name: "name",
      label: "Company Name",
      type: "string",
      description: "The company's name"
    },
    {
      name: "domain",
      label: "Website Domain",
      type: "string",
      description: "The company's website domain"
    },
    {
      name: "updateTimestamp",
      label: "Update Timestamp",
      type: "string",
      description: "When the property was updated"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerCompanyDeleted: NodeComponent = {
  type: "hubspot_trigger_company_deleted",
  title: "Company Deleted",
  description: "Triggers when a company is deleted from HubSpot",
  icon: Building,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [],
  outputSchema: [
    {
      name: "companyId",
      label: "Company ID",
      type: "string",
      description: "The unique ID of the deleted company"
    },
    {
      name: "name",
      label: "Company Name",
      type: "string",
      description: "The company's name (if available)"
    },
    {
      name: "domain",
      label: "Website Domain",
      type: "string",
      description: "The company's website domain (if available)"
    },
    {
      name: "deleteTimestamp",
      label: "Delete Timestamp",
      type: "string",
      description: "When the company was deleted"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerDealCreated: NodeComponent = {
  type: "hubspot_trigger_deal_created",
  title: "Deal Created",
  description: "Triggers when a new deal is created in HubSpot",
  icon: DollarSign,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [],
  outputSchema: [
    {
      name: "dealId",
      label: "Deal ID",
      type: "string",
      description: "The unique ID of the created deal"
    },
    {
      name: "dealName",
      label: "Deal Name",
      type: "string",
      description: "The name/title of the deal"
    },
    {
      name: "amount",
      label: "Deal Amount",
      type: "string",
      description: "The monetary value of the deal"
    },
    {
      name: "dealStage",
      label: "Deal Stage",
      type: "string",
      description: "The current stage of the deal"
    },
    {
      name: "pipeline",
      label: "Pipeline",
      type: "string",
      description: "The sales pipeline the deal belongs to"
    },
    {
      name: "closeDate",
      label: "Close Date",
      type: "string",
      description: "The expected close date of the deal"
    },
    {
      name: "dealType",
      label: "Deal Type",
      type: "string",
      description: "The type of deal (e.g., New Business, Existing Business)"
    },
    {
      name: "hubspotOwner",
      label: "HubSpot Owner",
      type: "string",
      description: "The deal's assigned owner in HubSpot"
    },
    {
      name: "associatedContacts",
      label: "Associated Contacts",
      type: "array",
      description: "IDs of contacts associated with the deal"
    },
    {
      name: "associatedCompanies",
      label: "Associated Companies",
      type: "array",
      description: "IDs of companies associated with the deal"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the deal was created"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerDealUpdated: NodeComponent = {
  type: "hubspot_trigger_deal_updated",
  title: "Deal Property Updated",
  description: "Triggers when a deal property is updated in HubSpot",
  icon: DollarSign,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "propertyName",
      label: "Property Name",
      type: "text",
      required: false,
      placeholder: "e.g., dealstage, amount, closedate",
      description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
    },
  ],
  outputSchema: [
    {
      name: "dealId",
      label: "Deal ID",
      type: "string",
      description: "The unique ID of the updated deal"
    },
    {
      name: "propertyName",
      label: "Property Name",
      type: "string",
      description: "The name of the property that was updated"
    },
    {
      name: "propertyValue",
      label: "New Property Value",
      type: "string",
      description: "The new value of the updated property"
    },
    {
      name: "previousValue",
      label: "Previous Value",
      type: "string",
      description: "The previous value of the property"
    },
    {
      name: "dealName",
      label: "Deal Name",
      type: "string",
      description: "The name/title of the deal"
    },
    {
      name: "amount",
      label: "Deal Amount",
      type: "string",
      description: "The monetary value of the deal"
    },
    {
      name: "dealStage",
      label: "Deal Stage",
      type: "string",
      description: "The current stage of the deal"
    },
    {
      name: "pipeline",
      label: "Pipeline",
      type: "string",
      description: "The sales pipeline the deal belongs to"
    },
    {
      name: "updateTimestamp",
      label: "Update Timestamp",
      type: "string",
      description: "When the property was updated"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

const hubspotTriggerDealDeleted: NodeComponent = {
  type: "hubspot_trigger_deal_deleted",
  title: "Deal Deleted",
  description: "Triggers when a deal is deleted from HubSpot",
  icon: DollarSign,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [],
  outputSchema: [
    {
      name: "dealId",
      label: "Deal ID",
      type: "string",
      description: "The unique ID of the deleted deal"
    },
    {
      name: "dealName",
      label: "Deal Name",
      type: "string",
      description: "The name/title of the deal (if available)"
    },
    {
      name: "amount",
      label: "Deal Amount",
      type: "string",
      description: "The monetary value of the deal (if available)"
    },
    {
      name: "dealStage",
      label: "Deal Stage",
      type: "string",
      description: "The stage the deal was in when deleted (if available)"
    },
    {
      name: "deleteTimestamp",
      label: "Delete Timestamp",
      type: "string",
      description: "When the deal was deleted"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

// HubSpot Actions
const hubspotActionCreateContact: NodeComponent = {
  type: "hubspot_action_create_contact",
  title: "Create Contact",
  description: "Create a new contact in HubSpot CRM with dynamic fields from your portal",
  icon: Plus,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Mode selector - Using toggle_group for pill-style selection
    {
      name: "fieldMode",
      label: "Field Selection Mode",
      type: "toggle_group",
      required: true,
      defaultValue: "basic",
      options: [
        { value: "basic", label: "Basic Fields" },
        { value: "custom", label: "Custom Selection" },
        { value: "all", label: "All Fields" }
      ],
      description: "Choose how to configure contact fields"
    },

    // Duplicate handling strategy
    {
      name: "duplicateHandling",
      label: "If Contact Already Exists",
      type: "select",
      required: false,
      defaultValue: "fail",
      options: [
        { value: "fail", label: "Fail with error" },
        { value: "update", label: "Update existing contact" },
        { value: "skip", label: "Skip and return existing contact" }
      ],
      description: "How to handle contacts that already exist (matched by email)"
    },

    // Basic mode fields (shown when fieldMode is "basic")
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "john.doe@example.com",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "firstname",
      label: "First Name",
      type: "text",
      required: false,
      placeholder: "John",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "lastname",
      label: "Last Name",
      type: "text",
      required: false,
      placeholder: "Doe",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "phone",
      label: "Phone Number",
      type: "text",
      required: false,
      placeholder: "+1-555-123-4567",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "company",
      label: "Company",
      type: "text",
      required: false,
      placeholder: "Acme Inc.",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "jobtitle",
      label: "Job Title",
      type: "combobox",
      dynamic: true,
      dynamicDataType: "hubspot_job_titles",
      required: false,
      placeholder: "Select or enter job title",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "lifecyclestage",
      label: "Lifecycle Stage",
      type: "select",
      options: [
        { value: "subscriber", label: "Subscriber" },
        { value: "lead", label: "Lead" },
        { value: "marketingqualifiedlead", label: "Marketing Qualified Lead" },
        { value: "salesqualifiedlead", label: "Sales Qualified Lead" },
        { value: "opportunity", label: "Opportunity" },
        { value: "customer", label: "Customer" },
        { value: "evangelist", label: "Evangelist" }
      ],
      required: false,
      placeholder: "Select lifecycle stage",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },
    {
      name: "hs_lead_status",
      label: "Lead Status",
      type: "select",
      dynamic: true,
      dynamicDataType: "hubspot_lead_status_options",
      required: false,
      placeholder: "Select lead status",
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "basic" }
    },

    // Custom selection mode (shown when fieldMode is "custom")
    {
      name: "selectedProperties",
      label: "Select Properties",
      type: "multiselect",
      dynamic: true,
      dynamicDataType: "hubspot_contact_available_properties",
      required: false,
      placeholder: "Choose properties to include",
      description: "Select which contact properties you want to set",
      defaultValue: ["email", "firstname", "lastname"],
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "custom" }
    },
    {
      name: "customProperties",
      label: "Property Values",
      type: "dynamic_properties",
      dynamic: true,
      dependsOn: "selectedProperties",
      required: false,
      metadata: {
        objectType: "contacts",
        requiredFields: ["email"]
      },
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "custom" }
    },

    // All fields mode (shown when fieldMode is "all")
    {
      name: "allProperties",
      label: "Contact Properties",
      type: "dynamic_properties_auto",
      dynamic: true,
      required: false,
      metadata: {
        objectType: "contacts",
        autoLoad: true,
        requiredFields: ["email"],
        excludeReadOnly: true,
        groupByCategory: true,
        collapsibleGroups: true
      },
      visibilityCondition: { field: "fieldMode", operator: "equals", value: "all" }
    },

    // Company association (available in all modes)
    {
      name: "associatedCompanyId",
      label: "Associated Company (Optional)",
      type: "combobox",
      dynamic: true,
      dynamicDataType: "hubspot_companies",
      required: false,
      placeholder: "Select a company or enter new company name",
      description: "Link this contact to a company"
    }
  ],

  // UI configuration for dynamic properties
  uiConfig: {
    supportsDynamicProperties: true,
    conditionalFields: true,
    propertyFetchConfig: {
      endpoint: "/api/integrations/hubspot/properties",
      objectType: "contacts"
    }
  }
}

const hubspotActionCreateCompany: NodeComponent = {
  type: "hubspot_action_create_company",
  title: "Create Company",
  description: "Create a new company in HubSpot",
  icon: Building,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.companies.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Primary Identifiers
    { name: "name", label: "Company Name", type: "text", required: true, placeholder: "Acme Corporation" },
    { name: "domain", label: "Website Domain", type: "text", required: true, placeholder: "example.com", description: "Primary unique identifier to avoid duplicates" },
    
    // Contact Information
    { name: "phone", label: "Phone Number", type: "text", required: false, placeholder: "+1-555-123-4567" },
    { name: "address", label: "Street Address", type: "text", required: false, placeholder: "123 Business Ave" },
    { name: "city", label: "City", type: "text", required: false, placeholder: "Boston" },
    { name: "state", label: "State/Region", type: "text", required: false, placeholder: "MA" },
    { name: "zip", label: "Postal Code", type: "text", required: false, placeholder: "02101" },
    { name: "country", label: "Country", type: "text", required: false, placeholder: "United States" },
    
    // Business Information
    { 
      name: "industry", 
      label: "Industry", 
      type: "select",
      options: [
        { value: "Technology", label: "Technology" },
        { value: "Healthcare", label: "Healthcare" },
        { value: "Finance", label: "Finance" },
        { value: "Retail", label: "Retail" },
        { value: "Manufacturing", label: "Manufacturing" },
        { value: "Education", label: "Education" },
        { value: "Real Estate", label: "Real Estate" },
        { value: "Consulting", label: "Consulting" },
        { value: "Other", label: "Other" }
      ],
      required: false,
      placeholder: "Select industry"
    },
    { name: "numberofemployees", label: "Number of Employees", type: "number", required: false, placeholder: "50" },
    { name: "annualrevenue", label: "Annual Revenue", type: "number", required: false, placeholder: "1000000" },
    { name: "description", label: "Company Description", type: "textarea", required: false, placeholder: "Brief description of the company" },
    
    // Lifecycle
    { 
      name: "lifecyclestage", 
      label: "Lifecycle Stage", 
      type: "select",
      options: [
        { value: "lead", label: "Lead" },
        { value: "marketingqualifiedlead", label: "Marketing Qualified Lead" },
        { value: "salesqualifiedlead", label: "Sales Qualified Lead" },
        { value: "opportunity", label: "Opportunity" },
        { value: "customer", label: "Customer" },
        { value: "other", label: "Other" }
      ],
      required: false,
      defaultValue: "lead",
      placeholder: "Select lifecycle stage"
    }
  ]
}

const hubspotActionCreateDeal: NodeComponent = {
  type: "hubspot_action_create_deal",
  title: "Create Deal",
  description: "Create a new deal in HubSpot",
  icon: DollarSign,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.deals.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Required Fields
    { name: "dealname", label: "Deal Name", type: "text", required: true, placeholder: "Q1 2025 Enterprise Deal" },
    
    // Pipeline and Stage
    { 
      name: "pipeline", 
      label: "Pipeline", 
      type: "select",
      options: [
        { value: "default", label: "Sales Pipeline" }
      ],
      required: false,
      defaultValue: "default",
      placeholder: "Select pipeline",
      description: "Sales pipeline for this deal"
    },
    { 
      name: "dealstage", 
      label: "Deal Stage", 
      type: "select",
      options: [
        { value: "appointmentscheduled", label: "Appointment Scheduled" },
        { value: "qualifiedtobuy", label: "Qualified To Buy" },
        { value: "presentationscheduled", label: "Presentation Scheduled" },
        { value: "decisionmakerboughtin", label: "Decision Maker Bought In" },
        { value: "contractsent", label: "Contract Sent" },
        { value: "closedwon", label: "Closed Won" },
        { value: "closedlost", label: "Closed Lost" }
      ],
      required: true,
      defaultValue: "appointmentscheduled",
      placeholder: "Select deal stage"
    },
    
    // Financial Information
    { name: "amount", label: "Deal Amount", type: "number", required: false, placeholder: "50000", description: "Value of the deal in your currency" },
    { name: "closedate", label: "Expected Close Date", type: "date", required: false, description: "When do you expect to close this deal?" },
    
    // Deal Details
    { 
      name: "dealtype", 
      label: "Deal Type", 
      type: "select",
      options: [
        { value: "newbusiness", label: "New Business" },
        { value: "existingbusiness", label: "Existing Business" }
      ],
      required: false,
      placeholder: "Select deal type"
    },
    { name: "description", label: "Deal Description", type: "textarea", required: false, placeholder: "Description of the deal and key details" },
    
    // Associations
    { 
      name: "associatedContactId", 
      label: "Associated Contact", 
      type: "combobox",
      dynamic: "hubspot_contacts",
      required: false,
      placeholder: "Select a contact to associate",
      description: "Link this deal to a contact"
    },
    { 
      name: "associatedCompanyId", 
      label: "Associated Company", 
      type: "combobox",
      dynamic: "hubspot_companies",
      required: false,
      placeholder: "Select a company to associate",
      description: "Link this deal to a company"
    }
  ]
}

const hubspotActionAddContactToList: NodeComponent = {
  type: "hubspot_action_add_contact_to_list",
  title: "Add Contact to List",
  description: "Add a contact to a HubSpot list",
  icon: Users,
  providerId: "hubspot",
  requiredScopes: ["crm.lists.read", "crm.lists.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    { 
      name: "contactEmail", 
      label: "Contact Email", 
      type: "email",
      required: true,
      placeholder: "contact@example.com",
      description: "Email of the contact to add to the list"
    },
    { 
      name: "listId", 
      label: "List", 
      type: "select",
      dynamic: true,
      required: true,
      placeholder: "Select a list",
      description: "Choose the list to add the contact to (only manual lists can have contacts added)"
    }
  ]
}

const hubspotActionUpdateDeal: NodeComponent = {
  type: "hubspot_action_update_deal",
  title: "Update Deal",
  description: "Update an existing deal in HubSpot",
  icon: Edit,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.deals.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Deal Selection
    { 
      name: "dealId", 
      label: "Deal to Update", 
      type: "combobox",
      dynamic: "hubspot_deals",
      required: true,
      placeholder: "Select or enter deal ID",
      description: "Choose the deal you want to update"
    },
    
    // Fields to Update (all optional)
    { name: "dealname", label: "New Deal Name", type: "text", required: false, placeholder: "Updated deal name" },
    
    // Pipeline and Stage
    { 
      name: "dealstage", 
      label: "New Deal Stage", 
      type: "select",
      options: [
        { value: "", label: "Keep Current Stage" },
        { value: "appointmentscheduled", label: "Appointment Scheduled" },
        { value: "qualifiedtobuy", label: "Qualified To Buy" },
        { value: "presentationscheduled", label: "Presentation Scheduled" },
        { value: "decisionmakerboughtin", label: "Decision Maker Bought In" },
        { value: "contractsent", label: "Contract Sent" },
        { value: "closedwon", label: "Closed Won" },
        { value: "closedlost", label: "Closed Lost" }
      ],
      required: false,
      placeholder: "Select new stage"
    },
    
    // Financial Updates
    { name: "amount", label: "New Amount", type: "number", required: false, placeholder: "75000" },
    { name: "closedate", label: "New Close Date", type: "date", required: false },
    
    // Additional Updates
    { name: "description", label: "Updated Description", type: "textarea", required: false, placeholder: "Updated deal description" },
    { 
      name: "dealtype", 
      label: "Deal Type", 
      type: "select",
      options: [
        { value: "", label: "Keep Current Type" },
        { value: "newbusiness", label: "New Business" },
        { value: "existingbusiness", label: "Existing Business" }
      ],
      required: false,
      placeholder: "Select deal type"
    }
  ]
}

const hubspotActionGetContacts: NodeComponent = {
  type: "hubspot_action_get_contacts",
  title: "Get Contacts",
  description: "Retrieve contacts from HubSpot with optional filtering",
  icon: Search,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.read"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "Number of contacts to retrieve (max 100)"
    },
    {
      name: "filterProperty",
      label: "Filter by Property (Optional)",
      type: "text",
      required: false,
      placeholder: "e.g., email, firstname, lifecyclestage"
    },
    {
      name: "filterValue",
      label: "Filter Value",
      type: "text",
      required: false,
      placeholder: "Value to match"
    }
  ],
  outputSchema: [
    {
      name: "contacts",
      label: "Contacts",
      type: "array",
      description: "Array of contacts from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of contacts retrieved"
    }
  ]
}

const hubspotActionGetCompanies: NodeComponent = {
  type: "hubspot_action_get_companies",
  title: "Get Companies",
  description: "Retrieve companies from HubSpot with optional filtering",
  icon: Search,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.companies.read"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "Number of companies to retrieve (max 100)"
    },
    {
      name: "filterProperty",
      label: "Filter by Property (Optional)",
      type: "text",
      required: false,
      placeholder: "e.g., name, domain, industry"
    },
    {
      name: "filterValue",
      label: "Filter Value",
      type: "text",
      required: false,
      placeholder: "Value to match"
    }
  ],
  outputSchema: [
    {
      name: "companies",
      label: "Companies",
      type: "array",
      description: "Array of companies from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of companies retrieved"
    }
  ]
}

const hubspotActionGetDeals: NodeComponent = {
  type: "hubspot_action_get_deals",
  title: "Get Deals",
  description: "Retrieve deals from HubSpot with optional filtering",
  icon: Search,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.deals.read"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "Number of deals to retrieve (max 100)"
    },
    {
      name: "filterProperty",
      label: "Filter by Property (Optional)",
      type: "text",
      required: false,
      placeholder: "e.g., dealname, dealstage, amount"
    },
    {
      name: "filterValue",
      label: "Filter Value",
      type: "text",
      required: false,
      placeholder: "Value to match"
    }
  ],
  outputSchema: [
    {
      name: "deals",
      label: "Deals",
      type: "array",
      description: "Array of deals from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of deals retrieved"
    }
  ]
}

// Import dynamic nodes
import { hubspotDynamicNodes } from './dynamicNodes'
// Import enhanced contact nodes
import { hubspotActionCreateContactEnhanced, hubspotActionCreateContactFullyDynamic } from './createContactEnhanced'

// Export all HubSpot nodes
export const hubspotNodes: NodeComponent[] = [
  // Triggers (10)
  hubspotTriggerContactCreated,
  hubspotTriggerContactUpdated,
  hubspotTriggerContactDeleted,
  hubspotTriggerCompanyCreated,
  hubspotTriggerCompanyUpdated,
  hubspotTriggerCompanyDeleted,
  hubspotTriggerDealCreated,
  hubspotTriggerDealUpdated,
  hubspotTriggerDealDeleted,

  // Actions (8)
  hubspotActionCreateContact,
  hubspotActionCreateCompany,
  hubspotActionCreateDeal,
  hubspotActionAddContactToList,
  hubspotActionUpdateDeal,
  hubspotActionGetContacts,
  hubspotActionGetCompanies,
  hubspotActionGetDeals,

  // Dynamic actions (4)
  ...hubspotDynamicNodes,

  // Enhanced contact actions (2)
  hubspotActionCreateContactEnhanced,
  hubspotActionCreateContactFullyDynamic,
]
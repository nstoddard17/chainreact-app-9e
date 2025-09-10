import { NodeComponent } from "../../types"
import {
  UserPlus,
  User,
  UserMinus,
  Building,
  DollarSign,
  Plus,
  Users,
  Edit
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
  description: "Create a new contact in HubSpot CRM",
  icon: Plus,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Basic Information
    { name: "name", label: "Name", type: "text", required: true, placeholder: "John Doe" },
    { name: "email", label: "Email Address", type: "email", required: true, placeholder: "john.doe@example.com" },
    { name: "phone", label: "Phone Number", type: "text", required: true, placeholder: "+1-555-123-4567" },
    
    // Lead Management
    { 
      name: "hs_lead_status", 
      label: "Lead Status", 
      type: "select",
      options: [
        { value: "NEW", label: "New" },
        { value: "OPEN", label: "Open" },
        { value: "IN_PROGRESS", label: "In Progress" },
        { value: "OPEN_DEAL", label: "Open deal" },
        { value: "UNQUALIFIED", label: "Unqualified" },
        { value: "ATTEMPTED_TO_CONTACT", label: "Attempted to contact" },
        { value: "CONNECTED", label: "Connected" },
        { value: "BAD_TIMING", label: "Bad Timing" }
      ],
      required: true,
      placeholder: "Select lead status"
    },
    
    // Company Information
    { 
      name: "associatedCompanyId", 
      label: "Company", 
      type: "combobox",
      dynamic: "hubspot_companies",
      required: false,
      placeholder: "Select a company or type to create new",
      creatable: true
    },
    { 
      name: "jobtitle", 
      label: "Job Title", 
      type: "combobox",
      dynamic: "hubspot_job_titles",
      required: false,
      placeholder: "Select or type job title",
      creatable: true
    },
    { 
      name: "department", 
      label: "Department", 
      type: "combobox",
      dynamic: "hubspot_departments",
      required: false,
      placeholder: "Select or type department",
      creatable: true
    },
    { 
      name: "industry", 
      label: "Industry", 
      type: "combobox",
      dynamic: "hubspot_industries",
      required: false,
      placeholder: "Select or type industry",
      creatable: true
    },
    
    // Location Information
    { name: "address", label: "Street Address", type: "text", required: false, placeholder: "123 Main St" },
    { name: "city", label: "City", type: "text", required: false, placeholder: "New York" },
    { name: "state", label: "State/Region", type: "text", required: false, placeholder: "NY" },
    { name: "zip", label: "Postal Code", type: "text", required: false, placeholder: "10001" },
    { name: "country", label: "Country", type: "text", required: false, placeholder: "United States" },
    
    // Social Media
    { name: "website", label: "Website URL", type: "text", required: false, placeholder: "https://www.example.com" },
    { name: "linkedinbio", label: "LinkedIn URL", type: "text", required: false, placeholder: "https://www.linkedin.com/in/johndoe" },
    { name: "twitterhandle", label: "Twitter Handle", type: "text", required: false, placeholder: "@johndoe" },
    
    // Lifecycle Stage
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
        { value: "evangelist", label: "Evangelist" },
        { value: "other", label: "Other" }
      ],
      required: false,
      defaultValue: "lead",
      placeholder: "Select lifecycle stage"
    }
  ]
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
    { name: "domain", label: "Website Domain", type: "text", required: false, placeholder: "example.com", description: "Primary unique identifier to avoid duplicates" },
    
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
  
  // Actions (5 - one not marked as comingSoon, 4 marked as comingSoon)
  hubspotActionCreateContact,
  hubspotActionCreateCompany,
  hubspotActionCreateDeal,
  hubspotActionAddContactToList,
  hubspotActionUpdateDeal,
]
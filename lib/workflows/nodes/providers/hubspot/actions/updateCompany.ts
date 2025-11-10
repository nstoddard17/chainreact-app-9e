import { NodeComponent } from "../../../types"
import { Edit, Building } from "lucide-react"

/**
 * Update Company Action
 * Updates an existing company in HubSpot with cascading field pattern
 *
 * API Verification:
 * - Endpoint: PATCH /crm/v3/objects/companies/{companyId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/companies
 * - Scopes: crm.objects.companies.write
 */
export const hubspotActionUpdateCompany: NodeComponent = {
  type: "hubspot_action_update_company",
  title: "Update Company",
  description: "Update an existing company in HubSpot",
  icon: Building,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.companies.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Company Selection (Parent field - always visible)
    {
      name: "companyId",
      label: "Company to Update",
      type: "combobox",
      dynamic: "hubspot_companies",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter company ID",
      description: "Choose the company you want to update"
    },

    // All updatable fields cascade after company selection
    // Basic Information
    {
      name: "name",
      label: "Company Name",
      type: "text",
      required: false,
      placeholder: "Acme Corporation",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "domain",
      label: "Website Domain",
      type: "text",
      required: false,
      placeholder: "example.com",
      description: "Primary company website domain",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "description",
      label: "Company Description",
      type: "textarea",
      required: false,
      placeholder: "Brief description of the company",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },

    // Contact Information
    {
      name: "phone",
      label: "Phone Number",
      type: "text",
      required: false,
      placeholder: "+1-555-123-4567",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "website",
      label: "Website URL",
      type: "text",
      required: false,
      placeholder: "https://example.com",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },

    // Address Information
    {
      name: "address",
      label: "Street Address",
      type: "text",
      required: false,
      placeholder: "123 Business Ave",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "address2",
      label: "Address Line 2",
      type: "text",
      required: false,
      placeholder: "Suite 100",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "city",
      label: "City",
      type: "text",
      required: false,
      placeholder: "Boston",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "state",
      label: "State/Region",
      type: "text",
      required: false,
      placeholder: "MA",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "zip",
      label: "Postal Code",
      type: "text",
      required: false,
      placeholder: "02101",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "country",
      label: "Country",
      type: "text",
      required: false,
      placeholder: "United States",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },

    // Business Information
    {
      name: "industry",
      label: "Industry",
      type: "select",
      options: [
        { value: "", label: "Keep Current Industry" },
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
      placeholder: "Select industry",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "numberofemployees",
      label: "Number of Employees",
      type: "number",
      required: false,
      placeholder: "50",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "annualrevenue",
      label: "Annual Revenue",
      type: "number",
      required: false,
      placeholder: "1000000",
      description: "Annual revenue in your currency",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "type",
      label: "Company Type",
      type: "select",
      options: [
        { value: "", label: "Keep Current Type" },
        { value: "PROSPECT", label: "Prospect" },
        { value: "PARTNER", label: "Partner" },
        { value: "RESELLER", label: "Reseller" },
        { value: "VENDOR", label: "Vendor" },
        { value: "OTHER", label: "Other" }
      ],
      required: false,
      placeholder: "Select company type",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },

    // Lifecycle and Status
    {
      name: "lifecyclestage",
      label: "Lifecycle Stage",
      type: "select",
      options: [
        { value: "", label: "Keep Current Stage" },
        { value: "lead", label: "Lead" },
        { value: "marketingqualifiedlead", label: "Marketing Qualified Lead" },
        { value: "salesqualifiedlead", label: "Sales Qualified Lead" },
        { value: "opportunity", label: "Opportunity" },
        { value: "customer", label: "Customer" },
        { value: "evangelist", label: "Evangelist" },
        { value: "other", label: "Other" }
      ],
      required: false,
      placeholder: "Select lifecycle stage",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },

    // Ownership
    {
      name: "hubspot_owner_id",
      label: "HubSpot Owner",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Assign to owner",
      description: "Assign this company to a HubSpot user",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },

    // Social Media
    {
      name: "linkedin_company_page",
      label: "LinkedIn Company Page",
      type: "text",
      required: false,
      placeholder: "https://linkedin.com/company/example",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "twitterhandle",
      label: "Twitter Handle",
      type: "text",
      required: false,
      placeholder: "@example",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    },
    {
      name: "facebookcompanypage",
      label: "Facebook Company Page",
      type: "text",
      required: false,
      placeholder: "https://facebook.com/example",
      dependsOn: "companyId",
      hidden: {
        $deps: ["companyId"],
        $condition: { companyId: { $exists: false } }
      }
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "companyId", label: "Company ID", type: "string", description: "The unique ID of the updated company" },
    { name: "name", label: "Company Name", type: "string", description: "The company name" },
    { name: "domain", label: "Domain", type: "string", description: "The company's website domain" },
    { name: "description", label: "Description", type: "string", description: "Company description" },
    { name: "phone", label: "Phone", type: "string", description: "The company's phone number" },
    { name: "website", label: "Website", type: "string", description: "The company's website URL" },
    { name: "address", label: "Address", type: "string", description: "The company's street address" },
    { name: "address2", label: "Address Line 2", type: "string", description: "The company's address line 2" },
    { name: "city", label: "City", type: "string", description: "The company's city" },
    { name: "state", label: "State", type: "string", description: "The company's state/region" },
    { name: "zip", label: "Postal Code", type: "string", description: "The company's postal code" },
    { name: "country", label: "Country", type: "string", description: "The company's country" },
    { name: "industry", label: "Industry", type: "string", description: "The company's industry" },
    { name: "numberofemployees", label: "Number of Employees", type: "number", description: "The company's employee count" },
    { name: "annualrevenue", label: "Annual Revenue", type: "number", description: "The company's annual revenue" },
    { name: "type", label: "Company Type", type: "string", description: "The company type" },
    { name: "lifecyclestage", label: "Lifecycle Stage", type: "string", description: "The company's lifecycle stage" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the company's owner" },
    { name: "linkedin_company_page", label: "LinkedIn", type: "string", description: "LinkedIn company page URL" },
    { name: "twitterhandle", label: "Twitter", type: "string", description: "Twitter handle" },
    { name: "facebookcompanypage", label: "Facebook", type: "string", description: "Facebook company page URL" },
    { name: "lastmodifieddate", label: "Last Modified", type: "string", description: "When the company was last modified (ISO 8601)" },
    { name: "properties", label: "All Properties", type: "object", description: "All company properties after update" }
  ]
}

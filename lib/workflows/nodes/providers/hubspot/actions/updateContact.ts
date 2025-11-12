import { NodeComponent } from "../../../types"
import { Edit } from "lucide-react"

/**
 * Update Contact Action
 * Updates an existing contact in HubSpot with cascading field pattern
 *
 * API Verification:
 * - Endpoint: PATCH /crm/v3/objects/contacts/{contactId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/contacts
 * - Scopes: crm.objects.contacts.write
 */
export const hubspotActionUpdateContact: NodeComponent = {
  type: "hubspot_action_update_contact",
  title: "Update Contact",
  description: "Update an existing contact in HubSpot",
  icon: Edit,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "contactSelectionMode",
      label: "How should we find the contact?",
      type: "select",
      required: true,
      defaultValue: "picker",
      options: [
        { value: "picker", label: "Select from list" },
        { value: "email", label: "Find by email" },
        { value: "id", label: "Enter contact ID" }
      ],
      description: "Choose whether to pick a contact from the dropdown, look it up by email, or provide the contact ID directly."
    },
    // Contact Selection (Parent field - always visible)
    {
      name: "contactId",
      label: "Contact to Update",
      type: "combobox",
      dynamic: "hubspot_contacts",
      required: true,
      searchable: true,
      placeholder: "Select or enter contact ID",
      description: "Choose the contact you want to update",
      visibilityCondition: {
        field: "contactSelectionMode",
        operator: "equals",
        value: "picker"
      }
    },
    {
      name: "lookupEmail",
      label: "Email to Find",
      type: "email",
      required: false,
      placeholder: "john.doe@example.com",
      description: "We will search HubSpot for a contact with this email address.",
      visibilityCondition: {
        field: "contactSelectionMode",
        operator: "equals",
        value: "email"
      }
    },
    {
      name: "createIfNotFound",
      label: "Create contact if not found",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "When enabled, a new contact will be created using the values below if no match is found for the email.",
      visibilityCondition: {
        field: "contactSelectionMode",
        operator: "equals",
        value: "email"
      }
    },
    {
      name: "lookupContactId",
      label: "Contact ID",
      type: "text",
      required: false,
      placeholder: "Enter HubSpot contact ID",
      description: "Provide the contact ID directly if you already know it.",
      visibilityCondition: {
        field: "contactSelectionMode",
        operator: "equals",
        value: "id"
      }
    },

    // All updatable fields cascade after contact selection
    // Basic Information
    {
      name: "email",
      label: "Email Address",
      type: "email",
      required: false,
      placeholder: "john.doe@example.com",
    },
    {
      name: "firstname",
      label: "First Name",
      type: "text",
      required: false,
      placeholder: "John",
    },
    {
      name: "lastname",
      label: "Last Name",
      type: "text",
      required: false,
      placeholder: "Doe",
    },
    {
      name: "phone",
      label: "Phone Number",
      type: "text",
      required: false,
      placeholder: "+1-555-123-4567",
    },
    {
      name: "mobilephone",
      label: "Mobile Phone",
      type: "text",
      required: false,
      placeholder: "+1-555-987-6543",
    },

    // Company Information
    {
      name: "company",
      label: "Company Name",
      type: "text",
      required: false,
      placeholder: "Acme Inc.",
    },
    {
      name: "jobtitle",
      label: "Job Title",
      type: "text",
      required: false,
      placeholder: "Marketing Manager",
    },
    {
      name: "website",
      label: "Website",
      type: "text",
      required: false,
      placeholder: "https://example.com",
    },

    // Address Information
    {
      name: "address",
      label: "Street Address",
      type: "text",
      required: false,
      placeholder: "123 Main St",
    },
    {
      name: "city",
      label: "City",
      type: "text",
      required: false,
      placeholder: "Boston",
    },
    {
      name: "state",
      label: "State/Region",
      type: "text",
      required: false,
      placeholder: "MA",
    },
    {
      name: "zip",
      label: "Postal Code",
      type: "text",
      required: false,
      placeholder: "02101",
    },
    {
      name: "country",
      label: "Country",
      type: "text",
      required: false,
      placeholder: "United States",
    },

    // Lifecycle and Status
    {
      name: "lifecyclestage",
      label: "Lifecycle Stage",
      type: "select",
      options: [
        { value: "", label: "Keep Current Stage" },
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
      placeholder: "Select lifecycle stage",
    },
    {
      name: "hs_lead_status",
      label: "Lead Status",
      type: "select",
      dynamic: "hubspot_lead_status_options",
      required: false,
      placeholder: "Select lead status",
    },

    // Ownership
    {
      name: "hubspot_owner_id",
      label: "HubSpot Owner",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      searchable: true,
      placeholder: "Assign to owner",
      description: "Assign this contact to a HubSpot user",
    },
    {
      name: "customPropertiesGroup",
      label: "Additional Properties",
      type: "field_group",
      collapsible: true,
      defaultExpanded: false,
      fields: [
        {
          name: "selectedProperties",
          label: "Select Properties to Update",
          type: "multi-select",
          dynamic: "hubspot_contact_properties",
          required: false,
          placeholder: "Choose contact properties"
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
            requiredFields: []
          }
        }
      ]
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "contactId", label: "Contact ID", type: "string", description: "The unique ID of the updated contact" },
    { name: "email", label: "Email", type: "string", description: "The contact's email address" },
    { name: "firstname", label: "First Name", type: "string", description: "The contact's first name" },
    { name: "lastname", label: "Last Name", type: "string", description: "The contact's last name" },
    { name: "phone", label: "Phone", type: "string", description: "The contact's phone number" },
    { name: "mobilephone", label: "Mobile Phone", type: "string", description: "The contact's mobile phone" },
    { name: "company", label: "Company", type: "string", description: "The contact's company name" },
    { name: "jobtitle", label: "Job Title", type: "string", description: "The contact's job title" },
    { name: "website", label: "Website", type: "string", description: "The contact's website" },
    { name: "address", label: "Address", type: "string", description: "The contact's street address" },
    { name: "city", label: "City", type: "string", description: "The contact's city" },
    { name: "state", label: "State", type: "string", description: "The contact's state/region" },
    { name: "zip", label: "Postal Code", type: "string", description: "The contact's postal code" },
    { name: "country", label: "Country", type: "string", description: "The contact's country" },
    { name: "lifecyclestage", label: "Lifecycle Stage", type: "string", description: "The contact's lifecycle stage" },
    { name: "hs_lead_status", label: "Lead Status", type: "string", description: "The contact's lead status" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the contact's owner" },
    { name: "lastmodifieddate", label: "Last Modified", type: "string", description: "When the contact was last modified (ISO 8601)" },
    { name: "properties", label: "All Properties", type: "object", description: "All contact properties after update" }
  ]
}

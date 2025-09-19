import { NodeComponent } from "../../types";
import { UserPlus } from "lucide-react";
import { z } from "zod";

/**
 * Enhanced HubSpot Create Contact Action
 * This version dynamically loads actual fields from the user's HubSpot portal
 */
export const hubspotActionCreateContactEnhanced: NodeComponent = {
  type: "hubspot_action_create_contact_enhanced",
  title: "Create Contact (Dynamic Fields)",
  description: "Create a contact with fields from your HubSpot portal",
  icon: UserPlus,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Email is always required for contacts
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      placeholder: "john.doe@example.com",
      description: "Email address is required for all HubSpot contacts"
    },

    // Dynamic property selector - allows users to choose which fields to include
    {
      name: "selectedProperties",
      label: "Select Properties to Include",
      type: "multiselect",
      dynamic: true,
      dynamicDataType: "hubspot_contact_properties_selector",
      required: false,
      placeholder: "Choose properties from your HubSpot account",
      description: "Select which properties you want to set for this contact",
      defaultValue: ["firstname", "lastname", "phone", "company"],
      metadata: {
        objectType: "contacts",
        excludeReadOnly: true,
        excludeCalculated: true,
        groupByCategory: true
      }
    },

    // Dynamic properties section
    // This special field type tells the UI to generate input fields
    // based on the selected properties above
    {
      name: "properties",
      label: "Contact Properties",
      type: "dynamic_properties",
      dynamic: true,
      dependsOn: "selectedProperties",
      required: false,
      placeholder: "Configure selected properties",
      description: "Set values for your selected properties",
      metadata: {
        objectType: "contacts",
        fetchPropertiesFrom: "selectedProperties",
        renderAsGroup: true,
        showDescriptions: true
      }
    },

    // Company association (optional)
    {
      name: "associateWithCompany",
      label: "Associate with Company",
      type: "checkbox",
      required: false,
      defaultValue: false,
      description: "Link this contact to a company"
    },

    {
      name: "associatedCompanyId",
      label: "Company",
      type: "combobox",
      dynamic: true,
      dynamicDataType: "hubspot_companies",
      required: false,
      placeholder: "Select or create a company",
      description: "Choose an existing company or enter a new company name",
      showWhen: {
        field: "associateWithCompany",
        value: true
      }
    },

    // Additional company fields if creating new
    {
      name: "createNewCompany",
      label: "Create New Company",
      type: "checkbox",
      required: false,
      defaultValue: false,
      description: "Create a new company instead of selecting existing",
      showWhen: {
        field: "associateWithCompany",
        value: true
      }
    },

    {
      name: "companyProperties",
      label: "Company Properties",
      type: "dynamic_properties",
      dynamic: true,
      required: false,
      placeholder: "Configure company properties",
      description: "Set properties for the new company",
      metadata: {
        objectType: "companies",
        minimalFields: ["name", "domain"]
      },
      showWhen: {
        field: "createNewCompany",
        value: true
      }
    }
  ],

  // Validation schema
  validationSchema: z.object({
    email: z.string().email("Valid email is required"),
    selectedProperties: z.array(z.string()).optional(),
    properties: z.record(z.unknown()).optional(),
    associateWithCompany: z.boolean().optional(),
    associatedCompanyId: z.string().optional(),
    createNewCompany: z.boolean().optional(),
    companyProperties: z.record(z.unknown()).optional()
  }).refine(
    (data) => {
      // If associating with company, either select existing or create new
      if (data.associateWithCompany) {
        return data.associatedCompanyId || data.createNewCompany;
      }
      return true;
    },
    {
      message: "Please select an existing company or choose to create a new one",
      path: ["associatedCompanyId"]
    }
  ),

  // UI Configuration hints
  uiConfig: {
    // Tells the configuration form this uses dynamic properties
    supportsDynamicProperties: true,

    // Property fetching configuration
    propertyFetchConfig: {
      endpoint: "/api/integrations/hubspot/properties",
      cacheKey: "hubspot_contact_properties",
      refreshButton: true,
      groupProperties: true
    },

    // Field rendering hints
    fieldRenderingHints: {
      properties: {
        renderMode: "dynamic",
        fetchSchemaFrom: "selectedProperties",
        showRequiredBadge: true,
        showFieldDescriptions: true,
        groupByCategory: true
      }
    },

    // Help text
    helpText: "This action creates a contact in HubSpot with the exact fields from your portal. Select which properties you want to fill, and we'll show you the appropriate input fields."
  }
};

/**
 * Alternative: Fully Dynamic Create Contact
 * This version automatically shows ALL available contact fields
 */
export const hubspotActionCreateContactFullyDynamic: NodeComponent = {
  type: "hubspot_action_create_contact_fully_dynamic",
  title: "Create Contact (All Fields)",
  description: "Create a contact with all available HubSpot fields",
  icon: UserPlus,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Single dynamic properties field that loads ALL contact properties
    {
      name: "properties",
      label: "Contact Properties",
      type: "dynamic_properties_auto",
      dynamic: true,
      required: true,
      placeholder: "Loading contact properties...",
      description: "Fill in the contact information",
      metadata: {
        objectType: "contacts",
        autoLoad: true,
        requiredFields: ["email"],
        excludeReadOnly: true,
        excludeCalculated: true,
        excludeHidden: true,
        groupByCategory: true,
        collapsibleGroups: true,
        showOnlyCommonFields: false, // Set to true to show only commonly used fields
        commonFields: [
          "email",
          "firstname",
          "lastname",
          "phone",
          "company",
          "jobtitle",
          "website",
          "lifecyclestage",
          "hs_lead_status",
          "address",
          "city",
          "state",
          "country",
          "zip"
        ]
      }
    },

    // Refresh button (standalone)
    {
      name: "refreshFields",
      label: "",
      type: "action_button",
      buttonText: "Refresh Fields from HubSpot",
      buttonAction: "refresh_properties",
      required: false,
      description: "Fetch the latest field definitions from your HubSpot portal",
      metadata: {
        objectType: "contacts",
        confirmMessage: "This will reload all field definitions. Any unsaved changes will be preserved. Continue?"
      }
    }
  ],

  validationSchema: z.object({
    properties: z.record(z.unknown()).refine(
      (props) => props.email && z.string().email().safeParse(props.email).success,
      "Valid email is required"
    )
  }),

  uiConfig: {
    supportsDynamicProperties: true,
    autoLoadProperties: true,
    propertyFetchConfig: {
      endpoint: "/api/integrations/hubspot/properties",
      objectType: "contacts",
      cacheTimeout: 600000, // 10 minutes
      showLoadingState: true,
      errorFallback: "manual" // Fall back to manual input if loading fails
    }
  }
};
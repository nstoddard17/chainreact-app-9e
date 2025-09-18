import { NodeComponent } from "../../types";
import { UserPlus } from "lucide-react";
import { z } from "zod";

/**
 * HubSpot Create Contact with Dynamic Field Modes
 * Uses conditional field groups for better UI reactivity
 */
export const hubspotActionCreateContactDynamic: NodeComponent = {
  type: "hubspot_action_create_contact_dynamic",
  title: "Create Contact",
  description: "Create a new contact in HubSpot CRM",
  icon: UserPlus,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Mode selector using radio/toggle group
    {
      name: "fieldMode",
      label: "Field Selection Mode",
      type: "radio_group",
      required: true,
      defaultValue: "basic",
      options: [
        {
          value: "basic",
          label: "Basic",
          description: "Quick entry with common fields"
        },
        {
          value: "custom",
          label: "Custom",
          description: "Choose specific fields"
        },
        {
          value: "all",
          label: "All Fields",
          description: "Show all available fields"
        }
      ],
      metadata: {
        layout: "horizontal", // Display as horizontal toggle
        variant: "button", // Button-style toggle
        size: "medium"
      }
    },

    // Conditional field group for Basic mode
    {
      name: "basicFields",
      label: "Contact Information",
      type: "field_group",
      visibleWhen: { field: "fieldMode", equals: "basic" },
      fields: [
        {
          name: "email",
          label: "Email",
          type: "email",
          required: true,
          placeholder: "john.doe@example.com"
        },
        {
          name: "firstname",
          label: "First Name",
          type: "text",
          required: false,
          placeholder: "John"
        },
        {
          name: "lastname",
          label: "Last Name",
          type: "text",
          required: false,
          placeholder: "Doe"
        },
        {
          name: "phone",
          label: "Phone Number",
          type: "text",
          required: false,
          placeholder: "+1-555-123-4567"
        },
        {
          name: "company",
          label: "Company",
          type: "text",
          required: false,
          placeholder: "Acme Inc."
        },
        {
          name: "jobtitle",
          label: "Job Title",
          type: "text",
          required: false,
          placeholder: "Sales Manager"
        },
        {
          name: "lifecyclestage",
          label: "Lifecycle Stage",
          type: "select",
          required: false,
          options: [
            { value: "subscriber", label: "Subscriber" },
            { value: "lead", label: "Lead" },
            { value: "marketingqualifiedlead", label: "Marketing Qualified Lead" },
            { value: "salesqualifiedlead", label: "Sales Qualified Lead" },
            { value: "opportunity", label: "Opportunity" },
            { value: "customer", label: "Customer" }
          ],
          defaultValue: "lead"
        },
        {
          name: "hs_lead_status",
          label: "Lead Status",
          type: "select",
          dynamic: true,
          required: false,
          placeholder: "Select lead status"
        }
      ]
    },

    // Conditional field group for Custom mode
    {
      name: "customFields",
      label: "Custom Field Selection",
      type: "field_group",
      visibleWhen: { field: "fieldMode", equals: "custom" },
      fields: [
        {
          name: "selectedProperties",
          label: "Select Properties to Include",
          type: "multiselect",
          dynamic: true,
          required: false,
          placeholder: "Choose which properties to show",
          description: "Select the HubSpot contact properties you want to fill",
          defaultValue: ["email", "firstname", "lastname"],
          metadata: {
            searchable: true,
            grouped: true,
            showSelectAll: true
          }
        },
        {
          name: "dynamicProperties",
          label: "Property Values",
          type: "dynamic_properties",
          dynamic: true,
          dependsOn: "selectedProperties",
          required: false,
          description: "Fill in values for your selected properties",
          metadata: {
            objectType: "contacts",
            showRequired: true,
            groupByCategory: true
          }
        }
      ]
    },

    // Conditional field group for All Fields mode
    {
      name: "allFieldsGroup",
      label: "All Contact Properties",
      type: "field_group",
      visibleWhen: { field: "fieldMode", equals: "all" },
      fields: [
        {
          name: "allProperties",
          label: "",
          type: "dynamic_properties_all",
          dynamic: true,
          required: false,
          metadata: {
            objectType: "contacts",
            autoLoad: true,
            excludeReadOnly: true,
            excludeCalculated: true,
            groupByCategory: true,
            collapsibleGroups: true,
            showSearch: true,
            requiredFields: ["email"]
          }
        }
      ]
    },

    // Company association (always visible)
    {
      name: "associateCompany",
      label: "Company Association",
      type: "field_group",
      collapsible: true,
      defaultExpanded: false,
      fields: [
        {
          name: "associateWithCompany",
          label: "Associate with Company",
          type: "checkbox",
          required: false,
          defaultValue: false
        },
        {
          name: "companyId",
          label: "Company",
          type: "combobox",
          dynamic: true,
          required: false,
          placeholder: "Search for a company or enter new name",
          visibleWhen: { field: "associateWithCompany", equals: true }
        }
      ]
    }
  ],

  // UI configuration
  uiConfig: {
    // Enable reactive field visibility
    enableConditionalFields: true,

    // Field mode switching behavior
    fieldModeSwitching: {
      preserveValues: true, // Keep entered values when switching modes
      confirmSwitch: false, // Don't ask for confirmation
      animateTransition: true // Smooth transition between modes
    },

    // Dynamic properties configuration
    dynamicPropertiesConfig: {
      endpoint: "/api/integrations/hubspot/properties",
      objectType: "contacts",
      cacheTimeout: 600000, // 10 minutes
      refreshButton: true
    },

    // Field rendering hints
    renderingHints: {
      fieldMode: {
        renderAs: "segmented_control", // or "tabs" or "radio_buttons"
        fullWidth: true,
        size: "large",
        showIcons: true
      }
    }
  },

  // Validation schema
  validationSchema: z.object({
    fieldMode: z.enum(["basic", "custom", "all"]),
    // Basic mode validation
    email: z.string().email().optional(),
    firstname: z.string().optional(),
    lastname: z.string().optional(),
    // Custom mode validation
    selectedProperties: z.array(z.string()).optional(),
    dynamicProperties: z.record(z.any()).optional(),
    // All fields validation
    allProperties: z.record(z.any()).optional(),
    // Company association
    associateWithCompany: z.boolean().optional(),
    companyId: z.string().optional()
  }).refine(
    (data) => {
      // Ensure email is provided in any mode
      if (data.fieldMode === "basic") {
        return !!data.email;
      } else if (data.fieldMode === "custom") {
        return data.dynamicProperties?.email;
      } else if (data.fieldMode === "all") {
        return data.allProperties?.email;
      }
      return false;
    },
    {
      message: "Email is required",
      path: ["email"]
    }
  )
};
import { NodeComponent } from "../../types";
import { Plus, Edit, GitMerge, RefreshCw } from "lucide-react";
import { z } from "zod";

/**
 * Dynamic HubSpot Create Object Action
 * Allows users to create any HubSpot object with dynamic property selection
 */
export const hubspotActionCreateObject: NodeComponent = {
  type: "hubspot_action_create_object",
  title: "Create HubSpot Object",
  description: "Create any HubSpot object (contact, company, deal, etc.) with dynamic fields",
  icon: Plus,
  providerId: "hubspot",
  requiredScopes: ["oauth", "crm.objects.contacts.write", "crm.objects.companies.write", "crm.objects.deals.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "objectType",
      label: "Object Type",
      type: "select",
      dynamic: true,
      required: true,
      placeholder: "Select object type",
      description: "Choose the type of object to create"
    },
    {
      name: "properties",
      label: "Properties",
      type: "dynamic_properties",
      dynamic: true,
      dependsOn: "objectType",
      required: false,
      placeholder: "Configure properties",
      description: "Set values for the object properties"
    },
    {
      name: "associations",
      label: "Associations (Optional)",
      type: "associations",
      required: false,
      description: "Associate this object with other records",
      schema: z.array(z.object({
        toObjectType: z.string(),
        toObjectId: z.string(),
        associationType: z.string().optional()
      })).optional()
    }
  ],
  validationSchema: z.object({
    objectType: z.string().min(1, "Object type is required"),
    properties: z.record(z.unknown()),
    associations: z.array(z.object({
      toObjectType: z.string(),
      toObjectId: z.string(),
      associationType: z.string().optional()
    })).optional()
  })
};

/**
 * Dynamic HubSpot Update Object Action
 * Allows users to update any HubSpot object with dynamic property selection
 */
export const hubspotActionUpdateObject: NodeComponent = {
  type: "hubspot_action_update_object",
  title: "Update HubSpot Object",
  description: "Update any HubSpot object with dynamic field selection",
  icon: Edit,
  providerId: "hubspot",
  requiredScopes: ["oauth", "crm.objects.contacts.write", "crm.objects.companies.write", "crm.objects.deals.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "objectType",
      label: "Object Type",
      type: "select",
      dynamic: true,
      required: true,
      placeholder: "Select object type",
      description: "Choose the type of object to update"
    },
    {
      name: "recordId",
      label: "Record ID",
      type: "select",
      dynamic: true,
      dependsOn: "objectType",
      required: true,
      placeholder: "Select or enter record ID",
      description: "Choose the record to update",
      allowCustomValue: true // Allow entering ID directly or using variables
    },
    {
      name: "properties",
      label: "Properties to Update",
      type: "dynamic_properties",
      dynamic: true,
      dependsOn: "objectType",
      required: false,
      placeholder: "Configure properties to update",
      description: "Set new values for properties you want to change"
    }
  ],
  validationSchema: z.object({
    objectType: z.string().min(1, "Object type is required"),
    recordId: z.string().min(1, "Record ID is required"),
    properties: z.record(z.unknown()).refine(
      (props) => Object.keys(props).length > 0,
      "At least one property must be updated"
    )
  })
};

/**
 * Dynamic HubSpot Upsert Object Action
 * Create or update based on identifier
 */
export const hubspotActionUpsertObject: NodeComponent = {
  type: "hubspot_action_upsert_object",
  title: "Upsert HubSpot Object",
  description: "Create or update a HubSpot object based on a unique identifier",
  icon: GitMerge,
  providerId: "hubspot",
  requiredScopes: ["oauth", "crm.objects.contacts.write", "crm.objects.companies.write", "crm.objects.deals.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "objectType",
      label: "Object Type",
      type: "select",
      dynamic: true,
      required: true,
      placeholder: "Select object type",
      description: "Choose the type of object to upsert"
    },
    {
      name: "identifierProperty",
      label: "Identifier Property",
      type: "select",
      dynamic: true,
      dependsOn: "objectType",
      required: true,
      placeholder: "Select identifier property",
      description: "Property to use for finding existing records (e.g., email for contacts)"
    },
    {
      name: "identifierValue",
      label: "Identifier Value",
      type: "text",
      required: true,
      placeholder: "Enter identifier value",
      description: "Value to search for (e.g., john@example.com)"
    },
    {
      name: "properties",
      label: "Properties",
      type: "dynamic_properties",
      dynamic: true,
      dependsOn: "objectType",
      required: false,
      placeholder: "Configure properties",
      description: "Properties to set for create or update"
    }
  ],
  validationSchema: z.object({
    objectType: z.string().min(1, "Object type is required"),
    identifierProperty: z.string().min(1, "Identifier property is required"),
    identifierValue: z.string().min(1, "Identifier value is required"),
    properties: z.record(z.unknown())
  })
};

/**
 * Refresh HubSpot Properties Action
 * Special action to refresh cached property schemas
 */
export const hubspotActionRefreshProperties: NodeComponent = {
  type: "hubspot_action_refresh_properties",
  title: "Refresh HubSpot Properties",
  description: "Refresh the cached property schemas from HubSpot",
  icon: RefreshCw,
  providerId: "hubspot",
  requiredScopes: ["oauth"],
  category: "CRM",
  isTrigger: false,
  isUtility: true, // Mark as utility action
  configSchema: [
    {
      name: "objectType",
      label: "Object Type (Optional)",
      type: "select",
      dynamic: true,
      required: false,
      placeholder: "Select object type to refresh",
      description: "Leave empty to refresh all object types"
    }
  ],
  validationSchema: z.object({
    objectType: z.string().optional()
  })
};

// Export all dynamic nodes
export const hubspotDynamicNodes = [
  hubspotActionCreateObject,
  hubspotActionUpdateObject,
  hubspotActionUpsertObject,
  hubspotActionRefreshProperties
];
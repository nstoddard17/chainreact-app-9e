/**
 * Types for HubSpot dynamic field system
 */

export type HubspotFieldType =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "checkbox"
  | "select"
  | "multiselect"
  | "textarea"
  | "email"
  | "phone"
  | "url";

export interface HubspotFieldOption {
  label: string;
  value: string;
  description?: string;
  displayOrder?: number;
  hidden?: boolean;
}

export interface HubspotFieldDef {
  name: string; // Internal property name
  label: string; // Display label
  type: HubspotFieldType; // Mapped UI type
  required: boolean;
  readOnly: boolean;
  description?: string;
  group?: string;
  options?: HubspotFieldOption[];
  hubspotType: string; // Original HubSpot type for casting
  fieldType?: string; // HubSpot field type (e.g., "text", "number", "enumeration")
  calculated?: boolean;
  hidden?: boolean;
  displayOrder?: number;
}

export interface HubspotObjectType {
  value: string;
  label: string;
  isCustom: boolean;
  objectTypeId?: string;
}

export interface ExecuteRequest {
  accountId: string;
  objectType: string; // e.g. "contacts" or "p_customobject"
  op: "create" | "update" | "upsert";
  recordId?: string; // for update
  identifierProperty?: string; // for upsert (e.g., "email" for contacts)
  identifierValue?: string; // for upsert
  properties: Record<string, unknown>; // User-specified values
  associations?: {
    toObjectType: string;
    toObjectId: string;
    associationType?: string;
  }[];
}

export interface HubspotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description?: string;
  groupName?: string;
  options?: Array<{
    label: string;
    value: string;
    description?: string | null;
    displayOrder?: number;
    hidden?: boolean;
  }>;
  displayOrder?: number;
  calculated?: boolean;
  externalOptions?: boolean;
  hasUniqueValue?: boolean;
  hidden?: boolean;
  hubspotDefined?: boolean;
  modificationMetadata?: {
    archivable: boolean;
    readOnlyDefinition: boolean;
    readOnlyValue: boolean;
  };
  formField?: boolean;
}

export interface HubspotPropertiesResponse {
  results: HubspotProperty[];
}

export interface HubspotCustomObjectSchema {
  id: string;
  name: string;
  objectTypeId: string;
  labels: {
    singular: string;
    plural: string;
  };
  requiredProperties?: string[];
  searchableProperties?: string[];
  primaryDisplayProperty?: string;
  secondaryDisplayProperties?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface HubspotObjectsResponse {
  results: HubspotCustomObjectSchema[];
}

// Helper function to map HubSpot property types to our UI types
export function mapHubspotTypeToUIType(property: HubspotProperty): HubspotFieldType {
  const { type, fieldType } = property;

  // Check for specific field types first
  if (fieldType === "booleancheckbox" || type === "bool") {
    return "checkbox";
  }

  if (fieldType === "select" || type === "enumeration") {
    return property.options && property.options.length > 0 ? "select" : "text";
  }

  if (fieldType === "checkbox" || type === "enumeration" && property.options) {
    // Multi-select if it supports multiple values
    return "multiselect";
  }

  if (fieldType === "textarea" || fieldType === "text" && property.description?.includes("multi-line")) {
    return "textarea";
  }

  if (fieldType === "date" || type === "date") {
    return "date";
  }

  if (fieldType === "datetime" || type === "datetime") {
    return "datetime";
  }

  if (fieldType === "number" || type === "number") {
    return "number";
  }

  if (fieldType === "phonenumber" || property.name.toLowerCase().includes("phone")) {
    return "phone";
  }

  if (property.name.toLowerCase().includes("email")) {
    return "email";
  }

  if (property.name.toLowerCase().includes("url") || property.name.toLowerCase().includes("website")) {
    return "url";
  }

  // Default to text
  return "text";
}

// Convert HubSpot property to our field definition
export function hubspotPropertyToFieldDef(property: HubspotProperty): HubspotFieldDef {
  const isReadOnly = property.modificationMetadata?.readOnlyValue ||
                     property.calculated ||
                     property.hubspotDefined === true;

  return {
    name: property.name,
    label: property.label,
    type: mapHubspotTypeToUIType(property),
    required: false, // Will be determined by object schema
    readOnly: isReadOnly,
    description: property.description,
    group: property.groupName,
    options: property.options?.map(opt => ({
      label: opt.label,
      value: opt.value,
      description: opt.description || undefined,
      displayOrder: opt.displayOrder,
      hidden: opt.hidden
    })),
    hubspotType: property.type,
    fieldType: property.fieldType,
    calculated: property.calculated,
    hidden: property.hidden,
    displayOrder: property.displayOrder
  };
}
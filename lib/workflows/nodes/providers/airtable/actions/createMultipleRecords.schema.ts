import { NodeComponent } from "../../../types"

export const createMultipleRecordsActionSchema: NodeComponent = {
  type: "airtable_action_create_multiple_records",
  title: "Create Multiple Records",
  description: "Create multiple records at once in an Airtable table (bulk create up to 10 records)",
  icon: "Plus" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "createdRecords", label: "Created Records", type: "array", description: "Array of all created records with their IDs and field values" },
    { name: "createCount", label: "Create Count", type: "number", description: "Number of records successfully created" },
    { name: "success", label: "Success", type: "boolean", description: "Whether all creates completed successfully" },
    { name: "recordIds", label: "Record IDs", type: "array", description: "Array of created record IDs" }
  ],
  configSchema: [
    {
      name: "baseId",
      label: "Base",
      type: "select",
      dynamic: "airtable_bases",
      required: true,
      loadOnMount: true,
      placeholder: "Select a base"
    },
    {
      name: "tableName",
      label: "Table",
      type: "select",
      dynamic: "airtable_tables",
      required: true,
      placeholder: "Select a table",
      dependsOn: "baseId",
      description: "Choose the table to create records in"
    },
    {
      name: "inputMode",
      label: "Input Mode",
      type: "select",
      required: false,
      defaultValue: "individual",
      options: [
        { value: "individual", label: "Fill Out Fields (Recommended)" },
        { value: "from_previous_step", label: "Use Data from Previous Step" },
        { value: "json", label: "JSON Array (Advanced)" }
      ],
      dependsOn: "tableName",
      description: "How to provide the records data",
      tooltip: "Individual: Fill out fields for each record one by one. From Previous Step: Use array data from a previous action. JSON: Paste a JSON array (advanced users)."
    },
    {
      name: "recordsData",
      label: "Records",
      type: "custom_multiple_records",
      required: true,
      dependsOn: "tableName",
      conditional: { field: "inputMode", value: "individual" },
      description: "Fill out the fields for each record you want to create",
      tooltip: "Click 'Add Record' to create additional records. Each record will be shown in an expandable section.",
      metadata: {
        maxRecords: 10,
        expandable: true,
        showAddButton: true,
        addButtonText: "Add Another Record"
      }
    },
    {
      name: "sourceArray",
      label: "Source Data",
      type: "text",
      required: true,
      placeholder: "{{previousStep.records}}",
      supportsAI: false,
      dependsOn: "tableName",
      conditional: { field: "inputMode", value: "from_previous_step" },
      description: "Reference to array data from previous step",
      tooltip: "Use merge fields to reference array data (e.g., {{trigger.items}} or {{step1.records}}). Each item in the array will create a new record."
    },
    {
      name: "fieldMapping",
      label: "Field Mapping",
      type: "custom_field_mapper",
      required: false,
      dependsOn: "sourceArray",
      conditional: { field: "inputMode", value: "from_previous_step" },
      description: "Map fields from your source data to Airtable fields",
      tooltip: "Match the fields from your previous step's data to the corresponding Airtable fields. Unmapped fields will be skipped.",
      metadata: {
        sourceLabel: "Source Field",
        targetLabel: "Airtable Field",
        allowAutoMap: true
      }
    },
    {
      name: "records",
      label: "Records Data (JSON)",
      type: "textarea",
      required: true,
      rows: 10,
      placeholder: JSON.stringify([
        { Name: "Record 1", Status: "Active" },
        { Name: "Record 2", Status: "Pending" },
        { Name: "Record 3", Status: "Active" }
      ], null, 2),
      supportsAI: true,
      dependsOn: "tableName",
      conditional: { field: "inputMode", value: "json" },
      description: "JSON array of records to create (max 10)",
      tooltip: "Each object in the array represents one record. Field names must match your Airtable field names exactly. Format: [{Field1: 'value1'}, {Field1: 'value2'}]"
    },
    {
      name: "maxRecords",
      label: "Max Records to Create",
      type: "number",
      required: false,
      defaultValue: 10,
      min: 1,
      max: 10,
      dependsOn: "tableName",
      description: "Maximum number of records to create (Airtable API limit: 10)",
      tooltip: "Airtable allows a maximum of 10 records per API request. If your input has more items, only the first 10 will be created.",
      advanced: true,
      hidden: {
        $deps: ["tableName"],
        $condition: { tableName: { $exists: false } }
      }
    },
    {
      name: "continueOnError",
      label: "Continue on Error",
      type: "boolean",
      required: false,
      defaultValue: false,
      dependsOn: "tableName",
      description: "Continue creating remaining records if one fails",
      tooltip: "When enabled, individual record failures won't stop the entire batch. Successful creates will still be returned.",
      advanced: true,
      hidden: {
        $deps: ["tableName"],
        $condition: { tableName: { $exists: false } }
      }
    },
    {
      name: "errorTableBase",
      label: "Error Log Base",
      type: "select",
      dynamic: "airtable_bases",
      required: false,
      loadOnMount: true,
      placeholder: "Select a base for error logging",
      description: "Base where failed records will be logged",
      tooltip: "Select an Airtable base to store records that fail to create",
      advanced: true,
      dependsOn: "tableName",
      hidden: {
        $deps: ["tableName"],
        $condition: { tableName: { $exists: false } }
      }
    },
    {
      name: "errorTable",
      label: "Error Log Table",
      type: "select",
      dynamic: "airtable_tables",
      required: false,
      placeholder: "Select a table for error logging",
      description: "Table where failed record details will be saved",
      tooltip: "Failed records will be logged to this table with error information",
      advanced: true,
      dependsOn: "errorTableBase",
      hidden: {
        $deps: ["errorTableBase"],
        $condition: { errorTableBase: { $exists: false } }
      }
    },
    {
      name: "errorRecordNameField",
      label: "Record Name Field",
      type: "select",
      dynamic: "airtable_fields",
      required: false,
      placeholder: "Select field for record identifier",
      description: "Field to store the name/identifier of the failed record",
      tooltip: "This field will contain a reference to identify which record failed",
      advanced: true,
      dependsOn: "errorTable",
      hidden: {
        $deps: ["errorTable"],
        $condition: { errorTable: { $exists: false } }
      }
    },
    {
      name: "errorMessageField",
      label: "Error Message Field",
      type: "select",
      dynamic: "airtable_fields",
      required: false,
      placeholder: "Select field for error message",
      description: "Field to store the error message details",
      tooltip: "This field will contain the error message explaining why the record creation failed",
      advanced: true,
      dependsOn: "errorTable",
      hidden: {
        $deps: ["errorTable"],
        $condition: { errorTable: { $exists: false } }
      }
    },
    {
      name: "errorTimestampField",
      label: "Timestamp Field",
      type: "select",
      dynamic: "airtable_fields",
      required: false,
      placeholder: "Select field for timestamp",
      description: "Field to store when the error occurred",
      tooltip: "This field will contain the date/time when the error was logged",
      advanced: true,
      dependsOn: "errorTable",
      hidden: {
        $deps: ["errorTable"],
        $condition: { errorTable: { $exists: false } }
      }
    }
  ]
}

import {
  Code2,
  FileUp,
  Globe2,
  Search,
  Compass,
  Zap,
} from "lucide-react"
import { NodeComponent } from "../../types"

export const utilityNodes: NodeComponent[] = [
  {
    type: "transformer",
    title: "Transformer",
    description: "Transform and customize data using Python code",
    icon: Code2,
    category: "Data Enrichment",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "result",
        label: "Transformation Result",
        type: "object",
        description: "The output from your Python script",
        example: { transformed_data: "value", count: 42 }
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the transformation completed successfully",
        example: true
      },
      {
        name: "error",
        label: "Error Message",
        type: "string",
        description: "Error message if transformation failed",
        example: null
      },
      {
        name: "executionTime",
        label: "Execution Time (ms)",
        type: "number",
        description: "How long the script took to execute",
        example: 45
      }
    ],
    configSchema: [
      {
        name: "pythonCode",
        label: "Python Code",
        type: "textarea",
        required: true,
        placeholder: `# Available variables:
# - data: Previous node's output
# - trigger: Trigger data
# - nodeOutputs: All previous node outputs

# Example:
result = {
    "name": data.get("name", "").upper(),
    "count": len(data.get("items", [])),
    "processed": True
}

# Return the result (must be JSON-serializable)
return result`,
        description: "Write Python code to transform your data. Must return a dictionary.",
        hasVariablePicker: true
      },
      {
        name: "timeout",
        label: "Timeout (seconds)",
        type: "number",
        defaultValue: 30,
        placeholder: "30",
        description: "Maximum execution time for the script",
        uiTab: "advanced"
      },
      {
        name: "allowedImports",
        label: "Allowed Python Libraries",
        type: "multi-select",
        defaultValue: ["json", "re", "datetime", "math"],
        options: [
          { value: "json", label: "json - JSON parsing" },
          { value: "re", label: "re - Regular expressions" },
          { value: "datetime", label: "datetime - Date/time manipulation" },
          { value: "math", label: "math - Mathematical functions" },
          { value: "requests", label: "requests - HTTP requests" },
          { value: "pandas", label: "pandas - Data manipulation" },
          { value: "numpy", label: "numpy - Numerical computing" }
        ],
        description: "Select which Python libraries are available in your script",
        uiTab: "advanced"
      }
    ],
  },
  {
    type: "file_upload",
    title: "File Upload",
    description: "Upload and process files (CSV, Excel, PDF) and extract data",
    icon: FileUp,
    category: "Action",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "fileUrl",
        label: "File URL",
        type: "string",
        description: "URL where the uploaded file is stored",
        example: "https://storage.example.com/files/abc123.csv"
      },
      {
        name: "fileName",
        label: "File Name",
        type: "string",
        description: "Original name of the uploaded file",
        example: "data.csv"
      },
      {
        name: "fileSize",
        label: "File Size (bytes)",
        type: "number",
        description: "Size of the uploaded file in bytes",
        example: 2048576
      },
      {
        name: "fileType",
        label: "File Type",
        type: "string",
        description: "MIME type of the uploaded file",
        example: "text/csv"
      },
      {
        name: "extractedData",
        label: "Extracted Data",
        type: "array",
        description: "Parsed data from the file (for CSV/Excel)",
        example: [{ column1: "value1", column2: "value2" }]
      },
      {
        name: "extractedText",
        label: "Extracted Text",
        type: "string",
        description: "Text content extracted from PDF files",
        example: "This is the text content..."
      },
      {
        name: "rowCount",
        label: "Row Count",
        type: "number",
        description: "Number of rows in the file (for CSV/Excel)",
        example: 150
      }
    ],
    configSchema: [
      {
        name: "fileSource",
        label: "File Source",
        type: "select",
        required: true,
        defaultValue: "upload",
        options: [
          { value: "upload", label: "Upload File" },
          { value: "url", label: "From URL" },
          { value: "variable", label: "From Previous Step" }
        ],
        description: "Where to get the file from"
      },
      {
        name: "file",
        label: "Upload File",
        type: "file",
        required: true,
        accept: ".csv,.xlsx,.xls,.pdf,.txt,.json",
        maxSize: 10485760, // 10MB
        description: "Upload a file to process",
        visibilityCondition: {
          field: "fileSource",
          operator: "equals",
          value: "upload"
        }
      },
      {
        name: "fileUrl",
        label: "File URL",
        type: "text",
        required: true,
        placeholder: "https://example.com/file.csv",
        description: "URL of the file to download and process",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "fileSource",
          operator: "equals",
          value: "url"
        }
      },
      {
        name: "fileVariable",
        label: "File from Previous Step",
        type: "text",
        required: true,
        placeholder: "{{previousNode.fileUrl}}",
        description: "Reference to file from a previous step",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "fileSource",
          operator: "equals",
          value: "variable"
        }
      },
      {
        name: "parseOptions",
        label: "Parse Options",
        type: "select",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "Auto-detect format" },
          { value: "csv", label: "Parse as CSV" },
          { value: "excel", label: "Parse as Excel" },
          { value: "pdf_text", label: "Extract text from PDF" },
          { value: "raw", label: "Keep as raw file" }
        ],
        description: "How to process the file content"
      },
      {
        name: "csvDelimiter",
        label: "CSV Delimiter",
        type: "select",
        defaultValue: ",",
        options: [
          { value: ",", label: "Comma (,)" },
          { value: ";", label: "Semicolon (;)" },
          { value: "\t", label: "Tab" },
          { value: "|", label: "Pipe (|)" }
        ],
        description: "Delimiter used in CSV files",
        uiTab: "advanced",
        visibilityCondition: {
          field: "parseOptions",
          operator: "in",
          value: ["csv", "auto"]
        }
      },
      {
        name: "hasHeaders",
        label: "First Row is Headers",
        type: "boolean",
        defaultValue: true,
        description: "Whether the first row contains column headers",
        uiTab: "advanced",
        visibilityCondition: {
          field: "parseOptions",
          operator: "in",
          value: ["csv", "excel", "auto"]
        }
      },
      {
        name: "excelSheet",
        label: "Excel Sheet",
        type: "text",
        placeholder: "Sheet1",
        description: "Name or index of the Excel sheet to parse (leave empty for first sheet)",
        uiTab: "advanced",
        visibilityCondition: {
          field: "parseOptions",
          operator: "in",
          value: ["excel", "auto"]
        }
      }
    ],
  },
  {
    type: "extract_website_data",
    title: "Extract Info from Website",
    description: "Scrape and extract specific data from websites using CSS selectors or AI",
    icon: Globe2,
    category: "Data Enrichment",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "extractedData",
        label: "Extracted Data",
        type: "object",
        description: "Data extracted from the website",
        example: { title: "Page Title", price: "$19.99", description: "Product description" }
      },
      {
        name: "url",
        label: "Website URL",
        type: "string",
        description: "The URL that was scraped",
        example: "https://example.com/product/123"
      },
      {
        name: "timestamp",
        label: "Extraction Timestamp",
        type: "string",
        description: "When the data was extracted (ISO 8601)",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether extraction was successful",
        example: true
      }
    ],
    configSchema: [
      {
        name: "url",
        label: "Website URL",
        type: "text",
        required: true,
        placeholder: "https://example.com",
        description: "URL of the website to extract data from",
        hasVariablePicker: true
      },
      {
        name: "extractionMethod",
        label: "Extraction Method",
        type: "select",
        required: true,
        defaultValue: "css",
        options: [
          { value: "css", label: "CSS Selectors" },
          { value: "ai", label: "AI-Powered Extraction" }
        ],
        description: "How to extract data from the page"
      },
      {
        name: "cssSelectors",
        label: "CSS Selectors",
        type: "custom",
        required: true,
        description: "Map field names to CSS selectors",
        customComponent: "KeyValuePairs",
        placeholder: "field name → CSS selector",
        visibilityCondition: {
          field: "extractionMethod",
          operator: "equals",
          value: "css"
        }
      },
      {
        name: "aiInstructions",
        label: "Extraction Instructions",
        type: "textarea",
        required: true,
        placeholder: "Extract the product title, price, and description from this page",
        description: "Describe what data to extract from the page",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "extractionMethod",
          operator: "equals",
          value: "ai"
        }
      },
      {
        name: "waitForSelector",
        label: "Wait for Element",
        type: "text",
        placeholder: ".product-details",
        description: "CSS selector to wait for before extracting (useful for dynamic pages)",
        uiTab: "advanced"
      },
      {
        name: "timeout",
        label: "Page Load Timeout (seconds)",
        type: "number",
        defaultValue: 30,
        placeholder: "30",
        description: "How long to wait for the page to load",
        uiTab: "advanced"
      },
      {
        name: "userAgent",
        label: "Custom User Agent",
        type: "text",
        placeholder: "Mozilla/5.0...",
        description: "Custom User-Agent header (leave empty for default)",
        uiTab: "advanced"
      },
      {
        name: "renderJavaScript",
        label: "Render JavaScript",
        type: "boolean",
        defaultValue: false,
        description: "Wait for JavaScript to execute (slower but works with dynamic sites)",
        uiTab: "advanced"
      }
    ],
  },
  {
    type: "conditional_trigger",
    title: "Conditional Trigger",
    description: "Starts automatically when a specific condition is met on a schedule",
    icon: Zap,
    category: "Trigger",
    providerId: "utility",
    isTrigger: true,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "conditionMet",
        label: "Condition Met",
        type: "boolean",
        description: "Whether the condition was satisfied",
        example: true
      },
      {
        name: "checkedValue",
        label: "Checked Value",
        type: "string",
        description: "The value that was checked",
        example: "42"
      },
      {
        name: "timestamp",
        label: "Check Timestamp",
        type: "string",
        description: "When the condition was checked",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "previousValue",
        label: "Previous Value",
        type: "string",
        description: "The value from the last check (for change detection)",
        example: "40"
      }
    ],
    configSchema: [
      {
        name: "checkType",
        label: "What to Check",
        type: "select",
        required: true,
        defaultValue: "api",
        options: [
          { value: "api", label: "API Endpoint" },
          { value: "website", label: "Website Data" },
          { value: "database", label: "Database Query" }
        ],
        description: "What source to monitor for the condition"
      },
      {
        name: "apiUrl",
        label: "API URL",
        type: "text",
        required: true,
        placeholder: "https://api.example.com/status",
        description: "API endpoint to check",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "checkType",
          operator: "equals",
          value: "api"
        }
      },
      {
        name: "websiteUrl",
        label: "Website URL",
        type: "text",
        required: true,
        placeholder: "https://example.com",
        description: "Website to monitor",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "checkType",
          operator: "equals",
          value: "website"
        }
      },
      {
        name: "cssSelector",
        label: "CSS Selector",
        type: "text",
        placeholder: ".price",
        description: "Element to extract value from",
        visibilityCondition: {
          field: "checkType",
          operator: "equals",
          value: "website"
        }
      },
      {
        name: "jsonPath",
        label: "JSON Path",
        type: "text",
        placeholder: "data.status",
        description: "Path to the value in the API response",
        visibilityCondition: {
          field: "checkType",
          operator: "equals",
          value: "api"
        }
      },
      {
        name: "condition",
        label: "Condition",
        type: "select",
        required: true,
        defaultValue: "equals",
        options: [
          { value: "equals", label: "Equals" },
          { value: "not_equals", label: "Not equals" },
          { value: "greater_than", label: "Greater than" },
          { value: "less_than", label: "Less than" },
          { value: "contains", label: "Contains" },
          { value: "changes", label: "Value changes" }
        ],
        description: "What condition to check for"
      },
      {
        name: "expectedValue",
        label: "Expected Value",
        type: "text",
        placeholder: "active",
        description: "Value to compare against",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "condition",
          operator: "not_equals",
          value: "changes"
        }
      },
      {
        name: "checkInterval",
        label: "Check Interval",
        type: "select",
        required: true,
        defaultValue: "5m",
        options: [
          { value: "1m", label: "Every minute" },
          { value: "5m", label: "Every 5 minutes" },
          { value: "15m", label: "Every 15 minutes" },
          { value: "30m", label: "Every 30 minutes" },
          { value: "1h", label: "Every hour" },
          { value: "6h", label: "Every 6 hours" },
          { value: "24h", label: "Every 24 hours" }
        ],
        description: "How often to check the condition"
      }
    ],
  },
  {
    type: "google_search",
    title: "Google Search",
    description: "Find information, web pages, and related topics from Google",
    icon: Search,
    category: "Data Enrichment",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "results",
        label: "Search Results",
        type: "array",
        description: "Array of search results",
        example: [
          {
            title: "Example Page",
            url: "https://example.com",
            snippet: "This is a description...",
            position: 1
          }
        ]
      },
      {
        name: "totalResults",
        label: "Total Results",
        type: "number",
        description: "Approximate number of results found",
        example: 1250000
      },
      {
        name: "searchQuery",
        label: "Search Query",
        type: "string",
        description: "The query that was searched",
        example: "workflow automation tools"
      },
      {
        name: "searchTime",
        label: "Search Time (seconds)",
        type: "number",
        description: "How long the search took",
        example: 0.42
      }
    ],
    configSchema: [
      {
        name: "query",
        label: "Search Query",
        type: "text",
        required: true,
        placeholder: "workflow automation tools",
        description: "What to search for on Google",
        hasVariablePicker: true
      },
      {
        name: "numResults",
        label: "Number of Results",
        type: "number",
        defaultValue: 10,
        placeholder: "10",
        description: "How many results to return (max 100)"
      },
      {
        name: "language",
        label: "Language",
        type: "select",
        defaultValue: "en",
        options: [
          { value: "en", label: "English" },
          { value: "es", label: "Spanish" },
          { value: "fr", label: "French" },
          { value: "de", label: "German" },
          { value: "it", label: "Italian" },
          { value: "pt", label: "Portuguese" },
          { value: "ja", label: "Japanese" },
          { value: "zh", label: "Chinese" }
        ],
        description: "Language for search results",
        uiTab: "advanced"
      },
      {
        name: "country",
        label: "Country",
        type: "select",
        defaultValue: "us",
        options: [
          { value: "us", label: "United States" },
          { value: "uk", label: "United Kingdom" },
          { value: "ca", label: "Canada" },
          { value: "au", label: "Australia" },
          { value: "de", label: "Germany" },
          { value: "fr", label: "France" },
          { value: "es", label: "Spain" },
          { value: "it", label: "Italy" },
          { value: "jp", label: "Japan" }
        ],
        description: "Country to search from",
        uiTab: "advanced"
      },
      {
        name: "safeSearch",
        label: "Safe Search",
        type: "select",
        defaultValue: "medium",
        options: [
          { value: "off", label: "Off" },
          { value: "medium", label: "Medium" },
          { value: "strict", label: "Strict" }
        ],
        description: "Filter explicit content",
        uiTab: "advanced"
      },
      {
        name: "searchType",
        label: "Search Type",
        type: "select",
        defaultValue: "web",
        options: [
          { value: "web", label: "Web Search" },
          { value: "image", label: "Image Search" },
          { value: "news", label: "News Search" }
        ],
        description: "Type of search to perform",
        uiTab: "advanced"
      }
    ],
  },
  {
    type: "tavily_search",
    title: "Internet Search (Tavily)",
    description: "Quickly find relevant website links from the internet using Tavily API",
    icon: Compass,
    category: "Data Enrichment",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "results",
        label: "Search Results",
        type: "array",
        description: "Array of relevant website links and summaries",
        example: [
          {
            title: "Best Workflow Automation Tools",
            url: "https://example.com/workflow-tools",
            content: "A comprehensive guide to automation...",
            score: 0.95
          }
        ]
      },
      {
        name: "answer",
        label: "AI-Generated Answer",
        type: "string",
        description: "Summary answer to the query (if enabled)",
        example: "Workflow automation tools help businesses..."
      },
      {
        name: "searchQuery",
        label: "Search Query",
        type: "string",
        description: "The query that was searched",
        example: "best workflow automation tools 2024"
      },
      {
        name: "responseTime",
        label: "Response Time (ms)",
        type: "number",
        description: "How long the search took",
        example: 450
      }
    ],
    configSchema: [
      {
        name: "query",
        label: "Search Query",
        type: "text",
        required: true,
        placeholder: "best workflow automation tools",
        description: "What to search for on the internet",
        hasVariablePicker: true
      },
      {
        name: "searchDepth",
        label: "Search Depth",
        type: "select",
        defaultValue: "basic",
        options: [
          { value: "basic", label: "Basic - Fast results" },
          { value: "advanced", label: "Advanced - More thorough" }
        ],
        description: "How deep to search (advanced is slower but more comprehensive)"
      },
      {
        name: "maxResults",
        label: "Max Results",
        type: "number",
        defaultValue: 5,
        placeholder: "5",
        description: "Maximum number of results to return (1-10)"
      },
      {
        name: "includeAnswer",
        label: "Include AI Answer",
        type: "boolean",
        defaultValue: true,
        description: "Generate an AI summary answer from the search results"
      },
      {
        name: "includeDomains",
        label: "Include Domains",
        type: "text",
        placeholder: "example.com,another.com",
        description: "Only search these domains (comma-separated, leave empty for all)",
        uiTab: "advanced"
      },
      {
        name: "excludeDomains",
        label: "Exclude Domains",
        type: "text",
        placeholder: "spam.com,ads.com",
        description: "Exclude these domains from results (comma-separated)",
        uiTab: "advanced"
      },
      {
        name: "timeRange",
        label: "Time Range",
        type: "select",
        defaultValue: "any",
        options: [
          { value: "any", label: "Any time" },
          { value: "day", label: "Past 24 hours" },
          { value: "week", label: "Past week" },
          { value: "month", label: "Past month" },
          { value: "year", label: "Past year" }
        ],
        description: "Filter results by time",
        uiTab: "advanced"
      }
    ],
  }
]

import {
  FileUp,
  Globe2,
  Compass,
  RefreshCw,
} from "lucide-react"
import { NodeComponent } from "../../types"

export const utilityNodes: NodeComponent[] = [
  {
    type: "format_transformer",
    title: "Format Transformer",
    description: "Convert content between formats (HTML → Slack markdown, plain text, etc.)",
    icon: RefreshCw,
    category: "Data Transformation",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "transformedContent",
        label: "Transformed Content",
        type: "string",
        description: "The content after format transformation",
        example: "*Bold text* and _italic text_"
      },
      {
        name: "originalFormat",
        label: "Original Format",
        type: "string",
        description: "The detected format of the input content",
        example: "html"
      },
      {
        name: "targetFormat",
        label: "Target Format",
        type: "string",
        description: "The format the content was transformed to",
        example: "slack_markdown"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the transformation was successful",
        example: true
      },
      {
        name: "attachments",
        label: "Attachments",
        type: "array",
        description: "Any upstream attachments passed through for downstream steps",
        example: [
          {
            name: "invoice.pdf",
            url: "https://files.example.com/invoice.pdf"
          }
        ]
      }
    ],
    configSchema: [
      {
        name: "content",
        label: "Content to Transform",
        type: "textarea",
        required: true,
        placeholder: "{{previousNode.body}}",
        description: "The content to transform between formats",
        hasVariablePicker: true
      },
      {
        name: "sourceFormat",
        label: "Source Format",
        type: "select",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "Auto-detect" },
          { value: "html", label: "HTML" },
          { value: "markdown", label: "Markdown" },
          { value: "plain", label: "Plain Text" }
        ],
        description: "Format of the input content (auto-detect will identify HTML automatically)"
      },
      {
        name: "targetFormat",
        label: "Target Format",
        type: "select",
        required: true,
        defaultValue: "slack_markdown",
        options: [
          { value: "slack_markdown", label: "Slack Markdown" },
          { value: "plain", label: "Plain Text" },
          { value: "html", label: "HTML" },
          { value: "markdown", label: "Standard Markdown" }
        ],
        description: "Format to convert the content to"
      },
      {
        name: "preserveVariables",
        label: "Preserve Workflow Variables",
        type: "boolean",
        defaultValue: true,
        description: "Keep {{variable}} placeholders intact during transformation",
        uiTab: "advanced"
      }
    ],
  },
  {
    type: "parse_file",
    title: "Parse File",
    description: "Parse and extract data from files (CSV, Excel, PDF, JSON)",
    icon: FileUp,
    category: "Data Transformation",
    providerId: "utility",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "rows",
        label: "Parsed Rows",
        type: "array",
        description: "Array of parsed data rows from CSV/Excel files",
        example: [{ name: "John", email: "john@example.com" }, { name: "Jane", email: "jane@example.com" }]
      },
      {
        name: "headers",
        label: "Column Headers",
        type: "array",
        description: "Column names extracted from the file",
        example: ["name", "email", "phone"]
      },
      {
        name: "rowCount",
        label: "Row Count",
        type: "number",
        description: "Total number of data rows parsed",
        example: 150
      },
      {
        name: "text",
        label: "Extracted Text",
        type: "string",
        description: "Text content extracted from PDF/TXT files",
        example: "This is the text content from the PDF..."
      },
      {
        name: "metadata",
        label: "File Metadata",
        type: "object",
        description: "Information about the parsed file",
        example: { format: "csv", delimiter: ",", hasHeaders: true, fileName: "data.csv" }
      }
    ],
    configSchema: [
      {
        name: "source",
        label: "File Source",
        type: "select",
        required: true,
        defaultValue: "url",
        options: [
          { value: "url", label: "From URL" },
          { value: "previous_step", label: "From Previous Step" }
        ],
        description: "Where to get the file to parse"
      },
      {
        name: "fileUrl",
        label: "File URL",
        type: "text",
        required: true,
        placeholder: "https://example.com/file.csv",
        description: "URL of the file to parse",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "source",
          operator: "equals",
          value: "url"
        }
      },
      {
        name: "fileField",
        label: "File from Previous Step",
        type: "text",
        required: true,
        placeholder: "{{trigger.file_url}}",
        description: "File URL from a previous workflow step",
        hasVariablePicker: true,
        visibilityCondition: {
          field: "source",
          operator: "equals",
          value: "previous_step"
        }
      },
      {
        name: "fileType",
        label: "File Type",
        type: "select",
        defaultValue: "csv",
        options: [
          { value: "csv", label: "CSV" },
          { value: "excel", label: "Excel" },
          { value: "pdf", label: "PDF" },
          { value: "txt", label: "Text" },
          { value: "json", label: "JSON" }
        ],
        description: "Format of the file to parse"
      },
      {
        name: "autoDetectFormat",
        label: "Auto-detect if unclear",
        type: "boolean",
        defaultValue: false,
        description: "Fall back to automatic detection if file doesn't match selected type"
      },
      {
        name: "csvDelimiter",
        label: "Delimiter",
        type: "select",
        defaultValue: ",",
        options: [
          { value: ",", label: "Comma (,)" },
          { value: ";", label: "Semicolon (;)" },
          { value: "\t", label: "Tab (\\t)" },
          { value: "|", label: "Pipe (|)" }
        ],
        description: "Character used to separate values",
        visibilityCondition: {
          field: "fileType",
          operator: "equals",
          value: "csv"
        }
      },
      {
        name: "hasHeaders",
        label: "First row contains headers",
        type: "boolean",
        defaultValue: true,
        description: "Use the first row as column names",
        visibilityCondition: {
          field: "fileType",
          operator: "in",
          value: ["csv", "excel"]
        }
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "text",
        placeholder: "Leave empty for first sheet",
        description: "Specific sheet to read (defaults to first sheet)",
        visibilityCondition: {
          field: "fileType",
          operator: "equals",
          value: "excel"
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
      },
      {
        name: "screenshot",
        label: "Screenshot (Base64)",
        type: "string",
        description: "Base64-encoded screenshot of the webpage (if enabled)",
        example: "iVBORw0KGgoAAAANSUhEUgAA..."
      },
      {
        name: "screenshotUrl",
        label: "Screenshot URL",
        type: "string",
        description: "Data URL for the screenshot image (if enabled)",
        example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
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

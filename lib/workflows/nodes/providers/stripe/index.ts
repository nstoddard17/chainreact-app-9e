import {
  ShoppingCart,
  Users,
  UserPlus,
  CreditCard,
  Repeat,
  XCircle,
  AlertTriangle,
  FileText,
  Search,
  UserCog,
  RefreshCcw,
  XOctagon,
  Edit3,
  ShieldAlert,
  RotateCcw,
  Edit,
  CheckCircle2,
  Link2,
  SearchCheck
} from "lucide-react"
import { NodeComponent } from "../../types"

export const stripeNodes: NodeComponent[] = [
  {
    type: "stripe_trigger_new_payment",
    title: "New Payment",
    description: "Triggers on a new successful payment",
    icon: ShoppingCart,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all new payments" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a new payment is successfully processed in Stripe"
      }
    ],
    outputSchema: [
      { name: "paymentId", label: "Payment ID", type: "string", description: "The unique ID of the payment" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who made the payment" },
      { name: "amount", label: "Amount", type: "number", description: "The payment amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code (e.g., usd, eur)" },
      { name: "status", label: "Status", type: "string", description: "Payment status (succeeded, pending, failed)" },
      { name: "paymentMethod", label: "Payment Method", type: "string", description: "Type of payment method used (card, bank_account, etc.)" },
      { name: "receiptEmail", label: "Receipt Email", type: "string", description: "Email address where receipt was sent" },
      { name: "description", label: "Description", type: "string", description: "Description of the payment" },
      { name: "created", label: "Created At", type: "string", description: "When the payment was created (ISO 8601)" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ],
  },
  {
    type: "stripe_action_create_customer",
    title: "Create Customer",
    description: "Create a new customer in Stripe with full customization options",
    icon: Users,
    providerId: "stripe",
    requiredScopes: ["customer:write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      // Primary Contact Information
      {
        name: "email",
        label: "Email Address",
        type: "email",
        required: true,
        placeholder: "customer@example.com",
        description: "Customer's email address (used as primary identifier)",
        supportsAI: true
      },
      {
        name: "name",
        label: "Full Name",
        type: "text",
        required: false,
        placeholder: "John Doe",
        description: "Customer's full name",
        supportsAI: true
      },
      {
        name: "phone",
        label: "Phone Number",
        type: "text",
        required: false,
        placeholder: "+1-555-123-4567",
        description: "Customer's phone number in E.164 format",
        supportsAI: true
      },

      // Additional Details
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Premium customer from enterprise trial",
        description: "Internal description of this customer",
        supportsAI: true
      },

      // Payment Settings
      {
        name: "payment_method",
        label: "Default Payment Method (Optional)",
        type: "combobox",
        dynamic: "stripe_payment_methods",
        required: false,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a payment method or enter ID...",
        description: "Select a payment method from the dropdown or manually enter a payment method ID",
        allowManualInput: true
      },
      {
        name: "invoice_prefix",
        label: "Invoice Prefix (Optional)",
        type: "text",
        required: false,
        placeholder: "CUST",
        description: "Custom prefix for invoice numbers. Must be 1-12 uppercase letters or numbers (e.g., 'CUST', 'INV2024', 'A1B2')"
      },

      // Billing Address
      {
        name: "address_line1",
        label: "Address Line 1",
        type: "text",
        required: false,
        placeholder: "123 Main Street",
        description: "Street address, P.O. box, or company name",
        supportsAI: true
      },
      {
        name: "address_line2",
        label: "Address Line 2 (Optional)",
        type: "text",
        required: false,
        placeholder: "Apartment 4B",
        description: "Apartment, suite, unit, building, floor, etc.",
        supportsAI: true
      },
      {
        name: "address_city",
        label: "City",
        type: "text",
        required: false,
        placeholder: "San Francisco",
        description: "City, district, suburb, town, or village",
        supportsAI: true
      },
      {
        name: "address_state",
        label: "State/Province",
        type: "text",
        required: false,
        placeholder: "CA",
        description: "State, county, province, or region",
        supportsAI: true
      },
      {
        name: "address_postal_code",
        label: "Postal Code",
        type: "text",
        required: false,
        placeholder: "94107",
        description: "ZIP or postal code",
        supportsAI: true
      },
      {
        name: "address_country",
        label: "Country",
        type: "select",
        required: false,
        placeholder: "Select country",
        description: "Two-letter country code (ISO 3166-1 alpha-2)",
        options: [
          { value: "US", label: "United States" },
          { value: "CA", label: "Canada" },
          { value: "GB", label: "United Kingdom" },
          { value: "AU", label: "Australia" },
          { value: "DE", label: "Germany" },
          { value: "FR", label: "France" },
          { value: "ES", label: "Spain" },
          { value: "IT", label: "Italy" },
          { value: "NL", label: "Netherlands" },
          { value: "SE", label: "Sweden" },
          { value: "NO", label: "Norway" },
          { value: "DK", label: "Denmark" },
          { value: "FI", label: "Finland" },
          { value: "IE", label: "Ireland" },
          { value: "BE", label: "Belgium" },
          { value: "CH", label: "Switzerland" },
          { value: "AT", label: "Austria" },
          { value: "NZ", label: "New Zealand" },
          { value: "SG", label: "Singapore" },
          { value: "JP", label: "Japan" }
        ]
      },

      // Shipping Address
      {
        name: "shipping_name",
        label: "Shipping - Recipient Name (Optional)",
        type: "text",
        required: false,
        placeholder: "John Doe",
        description: "Recipient name for shipping address",
        supportsAI: true
      },
      {
        name: "shipping_phone",
        label: "Shipping - Phone (Optional)",
        type: "text",
        required: false,
        placeholder: "+1-555-123-4567",
        description: "Phone number for shipping contact",
        supportsAI: true
      },
      {
        name: "shipping_address_line1",
        label: "Shipping - Address Line 1 (Optional)",
        type: "text",
        required: false,
        placeholder: "123 Delivery Street",
        description: "Shipping street address",
        supportsAI: true
      },
      {
        name: "shipping_address_line2",
        label: "Shipping - Address Line 2 (Optional)",
        type: "text",
        required: false,
        placeholder: "Suite 100",
        description: "Additional shipping address details",
        supportsAI: true
      },
      {
        name: "shipping_address_city",
        label: "Shipping - City (Optional)",
        type: "text",
        required: false,
        placeholder: "Los Angeles",
        description: "Shipping city",
        supportsAI: true
      },
      {
        name: "shipping_address_state",
        label: "Shipping - State (Optional)",
        type: "text",
        required: false,
        placeholder: "CA",
        description: "Shipping state or region",
        supportsAI: true
      },
      {
        name: "shipping_address_postal_code",
        label: "Shipping - Postal Code (Optional)",
        type: "text",
        required: false,
        placeholder: "90001",
        description: "Shipping ZIP or postal code",
        supportsAI: true
      },
      {
        name: "shipping_address_country",
        label: "Shipping - Country (Optional)",
        type: "select",
        required: false,
        placeholder: "Select country",
        description: "Two-letter country code for shipping",
        options: [
          { value: "US", label: "United States" },
          { value: "CA", label: "Canada" },
          { value: "GB", label: "United Kingdom" },
          { value: "AU", label: "Australia" },
          { value: "DE", label: "Germany" },
          { value: "FR", label: "France" },
          { value: "ES", label: "Spain" },
          { value: "IT", label: "Italy" },
          { value: "NL", label: "Netherlands" }
        ]
      },

      // Tax & Compliance
      {
        name: "tax_id_type",
        label: "Tax ID Type (Optional)",
        type: "select",
        required: false,
        placeholder: "Select tax ID type",
        description: "Type of tax identification",
        options: [
          { value: "us_ein", label: "US EIN (Employer Identification Number)" },
          { value: "eu_vat", label: "EU VAT Number" },
          { value: "br_cnpj", label: "Brazil CNPJ" },
          { value: "br_cpf", label: "Brazil CPF" },
          { value: "gb_vat", label: "United Kingdom VAT" },
          { value: "au_abn", label: "Australia ABN" },
          { value: "au_arn", label: "Australia ARN" },
          { value: "in_gst", label: "India GST" },
          { value: "no_vat", label: "Norway VAT" },
          { value: "za_vat", label: "South Africa VAT" },
          { value: "ch_vat", label: "Switzerland VAT" },
          { value: "mx_rfc", label: "Mexico RFC" },
          { value: "sg_uen", label: "Singapore UEN" },
          { value: "sg_gst", label: "Singapore GST" },
          { value: "ca_bn", label: "Canada BN" },
          { value: "hk_br", label: "Hong Kong BR" },
          { value: "es_cif", label: "Spain CIF" },
          { value: "tw_vat", label: "Taiwan VAT" },
          { value: "th_vat", label: "Thailand VAT" },
          { value: "jp_cn", label: "Japan Corporate Number" },
          { value: "jp_rn", label: "Japan Registered Foreign Businesses' Registration Number" },
          { value: "li_uid", label: "Liechtenstein UID" },
          { value: "my_itn", label: "Malaysia ITN" },
          { value: "my_sst", label: "Malaysia SST" },
          { value: "my_frp", label: "Malaysia FRP" },
          { value: "kr_brn", label: "South Korea BRN" },
          { value: "ca_qst", label: "Canada QST number (Québec)" },
          { value: "ca_gst_hst", label: "Canada GST/HST number" },
          { value: "ca_pst_bc", label: "Canada PST number (British Columbia)" },
          { value: "ca_pst_mb", label: "Canada PST number (Manitoba)" },
          { value: "ca_pst_sk", label: "Canada PST number (Saskatchewan)" },
          { value: "nz_gst", label: "New Zealand GST" },
          { value: "id_npwp", label: "Indonesia NPWP" },
          { value: "ru_inn", label: "Russia INN" },
          { value: "ru_kpp", label: "Russia KPP" }
        ]
      },
      {
        name: "tax_id_value",
        label: "Tax ID Value (Optional)",
        type: "text",
        required: false,
        placeholder: "12-3456789",
        description: "The actual tax identification number",
        dependsOn: "tax_id_type"
      },
      {
        name: "tax_exempt",
        label: "Tax Exempt Status",
        type: "select",
        required: false,
        defaultValue: "none",
        options: [
          { value: "none", label: "Not exempt" },
          { value: "exempt", label: "Exempt from all taxes" },
          { value: "reverse", label: "Reverse charge (customer pays tax)" }
        ],
        description: "Customer's tax exemption status"
      },

      // Preferences
      {
        name: "preferred_locales",
        label: "Preferred Locales (Optional)",
        type: "multiselect",
        required: false,
        placeholder: "Select preferred languages",
        description: "Customer's preferred languages for communications (e.g., emails)",
        options: [
          { value: "en", label: "English" },
          { value: "es", label: "Spanish" },
          { value: "fr", label: "French" },
          { value: "de", label: "German" },
          { value: "it", label: "Italian" },
          { value: "pt", label: "Portuguese" },
          { value: "ja", label: "Japanese" },
          { value: "zh", label: "Chinese" },
          { value: "ko", label: "Korean" },
          { value: "nl", label: "Dutch" },
          { value: "ru", label: "Russian" },
          { value: "ar", label: "Arabic" },
          { value: "hi", label: "Hindi" },
          { value: "sv", label: "Swedish" },
          { value: "da", label: "Danish" },
          { value: "no", label: "Norwegian" },
          { value: "fi", label: "Finnish" }
        ]
      },

      // Balance and Credit
      {
        name: "balance",
        label: "Starting Balance (Optional)",
        type: "number",
        required: false,
        placeholder: "0",
        description: "Initial account balance in cents (negative = customer owes money, positive = credit)"
      },
      {
        name: "coupon",
        label: "Coupon Code (Optional)",
        type: "text",
        required: false,
        placeholder: "WELCOME20",
        description: "ID of a coupon to apply to the customer"
      },
      {
        name: "promotion_code",
        label: "Promotion Code (Optional)",
        type: "text",
        required: false,
        placeholder: "promo_1234567890",
        description: "ID of a promotion code to apply to the customer"
      },

      // Metadata
      {
        name: "metadata",
        label: "Custom Metadata (Optional)",
        type: "object",
        required: false,
        placeholder: '{"customer_type": "enterprise", "signup_source": "website"}',
        description: "Set of key-value pairs for storing additional information (max 50 keys, 500 chars per value)",
        supportsAI: true,
        advanced: true
      },

      // Invoice Settings
      {
        name: "invoice_settings_default_payment_method",
        label: "Invoice Default Payment Method (Optional)",
        type: "text",
        required: false,
        placeholder: "pm_1234567890",
        description: "Default payment method for invoices",
        advanced: true
      },
      {
        name: "invoice_settings_custom_fields",
        label: "Invoice Custom Fields (Optional)",
        type: "array",
        required: false,
        placeholder: '[{"name": "PO Number", "value": "PO-12345"}]',
        description: "Custom fields to display on invoices for this customer",
        advanced: true
      },
      {
        name: "invoice_settings_footer",
        label: "Invoice Footer (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Thank you for your business!",
        description: "Footer text to display on invoices",
        advanced: true,
        supportsAI: true
      }
    ],
    outputSchema: [
      { name: "customerId", label: "Customer ID", type: "string", description: "The unique ID of the created customer (cus_...)" },
      { name: "email", label: "Email", type: "string", description: "The customer's email address" },
      { name: "name", label: "Name", type: "string", description: "The customer's name" },
      { name: "phone", label: "Phone", type: "string", description: "The customer's phone number" },
      { name: "description", label: "Description", type: "string", description: "Internal description" },
      { name: "created", label: "Created Timestamp", type: "number", description: "Unix timestamp of creation" },
      { name: "currency", label: "Currency", type: "string", description: "Customer's default currency" },
      { name: "balance", label: "Balance", type: "number", description: "Current account balance in cents" },
      { name: "delinquent", label: "Is Delinquent", type: "boolean", description: "Whether customer has outstanding past due invoices" },
      { name: "address", label: "Billing Address", type: "object", description: "Customer's billing address" },
      { name: "shipping", label: "Shipping Address", type: "object", description: "Customer's shipping address" },
      { name: "tax_exempt", label: "Tax Exempt Status", type: "string", description: "Customer's tax exemption status" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" },
      { name: "livemode", label: "Live Mode", type: "boolean", description: "Whether this is a live or test customer" }
    ]
  },
  {
    type: "stripe_action_update_customer",
    title: "Update Customer",
    description: "Update an existing customer in Stripe",
    icon: UserCog,
    providerId: "stripe",
    requiredScopes: ["customer:write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      // Customer ID (required) - Dynamic dropdown
      {
        name: "customerId",
        label: "Customer",
        type: "combobox",
        dynamic: "stripe_customers",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a customer...",
        description: "Select the customer to update"
      },
      // Primary Contact Information (all optional for updates) - CASCADE AFTER CUSTOMER SELECTED
      {
        name: "email",
        label: "Email Address",
        type: "email",
        required: false,
        placeholder: "customer@example.com",
        description: "Customer's email address",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "name",
        label: "Full Name",
        type: "text",
        required: false,
        placeholder: "John Doe",
        description: "Customer's full name",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "phone",
        label: "Phone Number",
        type: "text",
        required: false,
        placeholder: "+1-555-123-4567",
        description: "Customer's phone number in E.164 format",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Premium customer from enterprise trial",
        description: "Internal description of this customer",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "payment_method",
        label: "Default Payment Method",
        type: "text",
        required: false,
        placeholder: "pm_1234567890",
        description: "ID of a PaymentMethod to attach as the default payment method",
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "invoice_prefix",
        label: "Invoice Prefix",
        type: "text",
        required: false,
        placeholder: "CUST",
        description: "Custom prefix for invoice numbers. Must be 1-12 uppercase letters or numbers (e.g., 'CUST', 'INV2024', 'A1B2')",
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Billing Address
      {
        name: "address_line1",
        label: "Address Line 1",
        type: "text",
        required: false,
        placeholder: "123 Main Street",
        description: "Street address, P.O. box, or company name",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "address_line2",
        label: "Address Line 2",
        type: "text",
        required: false,
        placeholder: "Apartment 4B",
        description: "Apartment, suite, unit, building, floor, etc.",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "address_city",
        label: "City",
        type: "text",
        required: false,
        placeholder: "San Francisco",
        description: "City, district, suburb, town, or village",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "address_state",
        label: "State/Province",
        type: "text",
        required: false,
        placeholder: "CA",
        description: "State, county, province, or region",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "address_postal_code",
        label: "Postal Code",
        type: "text",
        required: false,
        placeholder: "94107",
        description: "ZIP or postal code",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "address_country",
        label: "Country",
        type: "select",
        required: false,
        placeholder: "Select country",
        description: "Two-letter country code (ISO 3166-1 alpha-2)",
        options: [
          { value: "US", label: "United States" },
          { value: "CA", label: "Canada" },
          { value: "GB", label: "United Kingdom" },
          { value: "AU", label: "Australia" },
          { value: "DE", label: "Germany" },
          { value: "FR", label: "France" },
          { value: "ES", label: "Spain" },
          { value: "IT", label: "Italy" },
          { value: "NL", label: "Netherlands" },
          { value: "SE", label: "Sweden" },
          { value: "NO", label: "Norway" },
          { value: "DK", label: "Denmark" },
          { value: "FI", label: "Finland" },
          { value: "IE", label: "Ireland" },
          { value: "BE", label: "Belgium" },
          { value: "CH", label: "Switzerland" },
          { value: "AT", label: "Austria" },
          { value: "NZ", label: "New Zealand" },
          { value: "SG", label: "Singapore" },
          { value: "JP", label: "Japan" }
        ],
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Shipping Address
      {
        name: "shipping_name",
        label: "Shipping - Recipient Name",
        type: "text",
        required: false,
        placeholder: "John Doe",
        description: "Recipient name for shipping address",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_phone",
        label: "Shipping - Phone",
        type: "text",
        required: false,
        placeholder: "+1-555-123-4567",
        description: "Phone number for shipping contact",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_address_line1",
        label: "Shipping - Address Line 1",
        type: "text",
        required: false,
        placeholder: "123 Delivery Street",
        description: "Shipping street address",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_address_line2",
        label: "Shipping - Address Line 2",
        type: "text",
        required: false,
        placeholder: "Suite 100",
        description: "Additional shipping address details",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_address_city",
        label: "Shipping - City",
        type: "text",
        required: false,
        placeholder: "Los Angeles",
        description: "Shipping city",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_address_state",
        label: "Shipping - State",
        type: "text",
        required: false,
        placeholder: "CA",
        description: "Shipping state or region",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_address_postal_code",
        label: "Shipping - Postal Code",
        type: "text",
        required: false,
        placeholder: "90001",
        description: "Shipping ZIP or postal code",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "shipping_address_country",
        label: "Shipping - Country",
        type: "select",
        required: false,
        placeholder: "Select country",
        description: "Two-letter country code for shipping",
        options: [
          { value: "US", label: "United States" },
          { value: "CA", label: "Canada" },
          { value: "GB", label: "United Kingdom" },
          { value: "AU", label: "Australia" },
          { value: "DE", label: "Germany" },
          { value: "FR", label: "France" },
          { value: "ES", label: "Spain" },
          { value: "IT", label: "Italy" },
          { value: "NL", label: "Netherlands" }
        ],
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Tax & Compliance
      {
        name: "tax_id_type",
        label: "Tax ID Type",
        type: "select",
        required: false,
        placeholder: "Select tax ID type",
        description: "Type of tax identification",
        options: [
          { value: "us_ein", label: "US EIN" },
          { value: "eu_vat", label: "EU VAT" },
          { value: "br_cnpj", label: "Brazil CNPJ" },
          { value: "br_cpf", label: "Brazil CPF" },
          { value: "gb_vat", label: "UK VAT" },
          { value: "au_abn", label: "Australia ABN" },
          { value: "au_arn", label: "Australia ARN" },
          { value: "in_gst", label: "India GST" },
          { value: "ca_bn", label: "Canada BN" },
          { value: "sg_uen", label: "Singapore UEN" },
          { value: "sg_gst", label: "Singapore GST" },
          { value: "nz_gst", label: "New Zealand GST" }
        ],
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "tax_id_value",
        label: "Tax ID Value",
        type: "text",
        required: false,
        placeholder: "12-3456789",
        description: "The actual tax identification number",
        dependsOn: "tax_id_type",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "tax_exempt",
        label: "Tax Exempt Status",
        type: "select",
        required: false,
        options: [
          { value: "none", label: "Not exempt" },
          { value: "exempt", label: "Exempt from all taxes" },
          { value: "reverse", label: "Reverse charge" }
        ],
        description: "Customer's tax exemption status",
        supportsAI: false,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Preferences
      {
        name: "preferred_locales",
        label: "Preferred Locales",
        type: "multiselect",
        required: false,
        placeholder: "Select preferred languages",
        description: "Customer's preferred languages for communications",
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
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Balance and Credit
      {
        name: "balance",
        label: "Account Balance",
        type: "number",
        required: false,
        placeholder: "0",
        description: "Account balance in cents (negative = owes money, positive = credit)",
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "coupon",
        label: "Coupon Code",
        type: "text",
        required: false,
        placeholder: "WELCOME20",
        description: "ID of a coupon to apply",
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "promotion_code",
        label: "Promotion Code",
        type: "text",
        required: false,
        placeholder: "promo_1234567890",
        description: "ID of a promotion code to apply",
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Metadata
      {
        name: "metadata",
        label: "Custom Metadata",
        type: "object",
        required: false,
        placeholder: '{"customer_type": "enterprise"}',
        description: "Key-value pairs for storing additional information",
        supportsAI: true,
        advanced: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      // Invoice Settings
      {
        name: "invoice_settings_default_payment_method",
        label: "Invoice Default Payment Method",
        type: "text",
        required: false,
        placeholder: "pm_1234567890",
        description: "Default payment method for invoices",
        advanced: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "invoice_settings_custom_fields",
        label: "Invoice Custom Fields",
        type: "array",
        required: false,
        placeholder: '[{"name": "PO Number", "value": "PO-12345"}]',
        description: "Custom fields to display on invoices",
        advanced: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      },
      {
        name: "invoice_settings_footer",
        label: "Invoice Footer",
        type: "textarea",
        required: false,
        placeholder: "Thank you for your business!",
        description: "Footer text to display on invoices",
        advanced: true,
        supportsAI: true,
        dependsOn: "customerId",
        hidden: { $deps: ["customerId"], $condition: { customerId: { $exists: false } } }
      }
    ],
    outputSchema: [
      { name: "customerId", label: "Customer ID", type: "string", description: "The unique ID of the updated customer" },
      { name: "email", label: "Email", type: "string", description: "The customer's email address" },
      { name: "name", label: "Name", type: "string", description: "The customer's name" },
      { name: "phone", label: "Phone", type: "string", description: "The customer's phone number" },
      { name: "description", label: "Description", type: "string", description: "Internal description" },
      { name: "created", label: "Created Timestamp", type: "number", description: "Unix timestamp of creation" },
      { name: "currency", label: "Currency", type: "string", description: "Customer's default currency" },
      { name: "balance", label: "Balance", type: "number", description: "Current account balance in cents" },
      { name: "delinquent", label: "Is Delinquent", type: "boolean", description: "Whether customer has outstanding past due invoices" },
      { name: "address", label: "Billing Address", type: "object", description: "Customer's billing address" },
      { name: "shipping", label: "Shipping Address", type: "object", description: "Customer's shipping address" },
      { name: "tax_exempt", label: "Tax Exempt Status", type: "string", description: "Customer's tax exemption status" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" },
      { name: "livemode", label: "Live Mode", type: "boolean", description: "Whether this is a live or test customer" }
    ]
  },
  {
    type: "stripe_trigger_customer_created",
    title: "Customer Created",
    description: "Triggers when a new customer is created in Stripe",
    icon: UserPlus,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all new customers" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a new customer is created in Stripe"
      }
    ],
    outputSchema: [
      { name: "customerId", label: "Customer ID", type: "string", description: "The unique ID of the created customer" },
      { name: "email", label: "Email", type: "string", description: "The customer's email address" },
      { name: "name", label: "Name", type: "string", description: "The customer's full name" },
      { name: "phone", label: "Phone", type: "string", description: "The customer's phone number" },
      { name: "created", label: "Created Date", type: "string", description: "When the customer was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Any custom metadata associated with the customer" }
    ],
  },
  {
    type: "stripe_trigger_subscription_created",
    title: "Subscription Created",
    description: "Triggers when a new subscription is created",
    icon: Repeat,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all new subscriptions" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a new subscription is created in Stripe"
      }
    ],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who subscribed" },
      { name: "status", label: "Status", type: "string", description: "The subscription status" },
      { name: "currentPeriodStart", label: "Current Period Start", type: "string", description: "Start of current billing period" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "string", description: "End of current billing period" },
      { name: "planId", label: "Plan ID", type: "string", description: "The subscription plan ID" },
      { name: "created", label: "Created Date", type: "string", description: "When the subscription was created" }
    ],
  },
  {
    type: "stripe_trigger_subscription_deleted",
    title: "Subscription Cancelled",
    description: "Triggers when a subscription is cancelled",
    icon: XCircle,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all cancelled subscriptions" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a subscription is cancelled in Stripe"
      }
    ],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the cancelled subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who cancelled" },
      { name: "status", label: "Status", type: "string", description: "The subscription status" },
      { name: "canceledAt", label: "Cancelled At", type: "string", description: "When the subscription was cancelled" },
      { name: "planId", label: "Plan ID", type: "string", description: "The subscription plan ID" },
      { name: "reason", label: "Cancellation Reason", type: "string", description: "Reason for cancellation if provided" }
    ],
  },
  {
    type: "stripe_trigger_invoice_payment_failed",
    title: "Invoice Payment Failed",
    description: "Triggers when a subscription payment fails",
    icon: AlertTriangle,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all failed invoice payments" }],
        defaultValue: "all",
        description: "This trigger will fire whenever an invoice payment fails in Stripe"
      }
    ],
    outputSchema: [
      { name: "invoiceId", label: "Invoice ID", type: "string", description: "The unique ID of the failed invoice" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer whose payment failed" },
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The subscription with the failed payment" },
      { name: "amount", label: "Amount", type: "number", description: "The invoice amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "The invoice currency" },
      { name: "attemptCount", label: "Attempt Count", type: "number", description: "Number of payment attempts made" },
      { name: "nextPaymentAttempt", label: "Next Payment Attempt", type: "string", description: "When the next retry will occur" },
      { name: "failureReason", label: "Failure Reason", type: "string", description: "Reason for payment failure" }
    ],
  },
  {
    type: "stripe_trigger_new_dispute",
    title: "New Dispute",
    description: "Triggers when a customer disputes a charge (chargeback)",
    icon: ShieldAlert,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all new disputes" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a charge is disputed in Stripe"
      }
    ],
    outputSchema: [
      { name: "disputeId", label: "Dispute ID", type: "string", description: "The unique ID of the dispute" },
      { name: "chargeId", label: "Charge ID", type: "string", description: "The ID of the disputed charge" },
      { name: "amount", label: "Amount", type: "number", description: "The disputed amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "reason", label: "Reason", type: "string", description: "Reason for dispute (fraudulent, duplicate, product_not_received, etc.)" },
      { name: "status", label: "Status", type: "string", description: "Dispute status (warning_needs_response, warning_under_review, needs_response, under_review, won, lost)" },
      { name: "evidenceDueBy", label: "Evidence Due By", type: "number", description: "Unix timestamp - deadline for submitting evidence" },
      { name: "created", label: "Created At", type: "number", description: "Unix timestamp of when dispute was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata from the charge" }
    ],
  },
  {
    type: "stripe_trigger_refunded_charge",
    title: "Refunded Charge",
    description: "Triggers when a charge is refunded (full or partial)",
    icon: RotateCcw,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all refunded charges" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a charge is refunded in Stripe"
      }
    ],
    outputSchema: [
      { name: "chargeId", label: "Charge ID", type: "string", description: "The ID of the refunded charge" },
      { name: "refundId", label: "Refund ID", type: "string", description: "The ID of the refund" },
      { name: "amount", label: "Charge Amount", type: "number", description: "The original charge amount in cents" },
      { name: "amountRefunded", label: "Amount Refunded", type: "number", description: "Total amount refunded in cents" },
      { name: "amountCaptured", label: "Amount Captured", type: "number", description: "Amount that was actually captured (charged) in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "refundReason", label: "Refund Reason", type: "string", description: "Reason for refund (duplicate, fraudulent, requested_by_customer)" },
      { name: "created", label: "Created At", type: "number", description: "Unix timestamp of when charge was created" },
      { name: "refunded", label: "Fully Refunded", type: "boolean", description: "Whether charge was fully refunded" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata from the charge" }
    ],
  },
  {
    type: "stripe_trigger_subscription_updated",
    title: "Subscription Updated",
    description: "Triggers when a subscription is modified (plan change, quantity update, etc.)",
    icon: Edit,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all subscription updates" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a subscription is updated in Stripe"
      }
    ],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer ID" },
      { name: "status", label: "Status", type: "string", description: "Current subscription status" },
      { name: "previousAttributes", label: "Previous Attributes", type: "object", description: "Object containing previous values of changed fields" },
      { name: "currentPeriodStart", label: "Current Period Start", type: "number", description: "Unix timestamp of period start" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "number", description: "Unix timestamp of period end" },
      { name: "cancelAtPeriodEnd", label: "Cancel At Period End", type: "boolean", description: "Whether subscription will cancel at period end" },
      { name: "items", label: "Subscription Items", type: "array", description: "Array of subscription items with prices" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ],
  },
  {
    type: "stripe_trigger_checkout_session_completed",
    title: "Checkout Session Completed",
    description: "Triggers when a customer completes a Stripe Checkout session",
    icon: CheckCircle2,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all completed checkout sessions" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a checkout session is completed in Stripe"
      }
    ],
    outputSchema: [
      { name: "sessionId", label: "Session ID", type: "string", description: "The unique ID of the checkout session" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer ID (if customer was created or already exists)" },
      { name: "paymentIntentId", label: "Payment Intent ID", type: "string", description: "The payment intent ID (for one-time payments)" },
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The subscription ID (for subscription checkouts)" },
      { name: "amount", label: "Amount Total", type: "number", description: "Total amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "customerEmail", label: "Customer Email", type: "string", description: "Customer's email address" },
      { name: "paymentStatus", label: "Payment Status", type: "string", description: "Payment status (paid, unpaid, no_payment_required)" },
      { name: "mode", label: "Mode", type: "string", description: "Checkout mode (payment, subscription, setup)" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ],
  },
  {
    type: "stripe_action_create_payment_intent",
    title: "Create Payment Intent",
    description: "Create a new payment intent in Stripe",
    icon: CreditCard,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      { name: "amount", label: "Amount (cents)", type: "number", required: true, placeholder: "1000" },
      { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "usd", options: [
        { value: "usd", label: "USD" },
        { value: "eur", label: "EUR" },
        { value: "gbp", label: "GBP" }
      ] },
      {
        name: "customerId",
        label: "Customer",
        type: "combobox",
        dynamic: "stripe_customers",
        required: false,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a customer...",
        description: "Select a customer (optional)"
      },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Payment description" }
    ],
    outputSchema: [
      { name: "paymentIntentId", label: "Payment Intent ID", type: "string", description: "The unique ID of the payment intent (pi_...)" },
      { name: "clientSecret", label: "Client Secret", type: "string", description: "Secret key for client-side confirmation" },
      { name: "amount", label: "Amount", type: "number", description: "The payment amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "status", label: "Status", type: "string", description: "Current status (requires_payment_method, requires_confirmation, requires_action, processing, succeeded, canceled)" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer ID if provided" },
      { name: "description", label: "Description", type: "string", description: "Description of the payment intent" },
      { name: "created", label: "Created At", type: "number", description: "Unix timestamp of when the payment intent was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" },
      { name: "nextAction", label: "Next Action", type: "object", description: "Next action required (e.g., redirect to authentication)" }
    ]
  },
  {
    type: "stripe_action_create_invoice",
    title: "Create Invoice",
    description: "Create a new invoice in Stripe",
    icon: FileText,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "customerId",
        label: "Customer",
        type: "combobox",
        dynamic: "stripe_customers",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a customer...",
        description: "Select the customer for this invoice"
      },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Invoice description" },
      { name: "autoAdvance", label: "Auto Advance", type: "boolean", required: false, defaultValue: true }
    ],
    outputSchema: [
      { name: "invoiceId", label: "Invoice ID", type: "string", description: "The unique ID of the invoice (in_...)" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who will receive this invoice" },
      { name: "number", label: "Invoice Number", type: "string", description: "Human-readable invoice number" },
      { name: "status", label: "Status", type: "string", description: "Invoice status (draft, open, paid, uncollectible, void)" },
      { name: "amountDue", label: "Amount Due", type: "number", description: "Total amount due in cents" },
      { name: "amountPaid", label: "Amount Paid", type: "number", description: "Total amount paid in cents" },
      { name: "amountRemaining", label: "Amount Remaining", type: "number", description: "Amount still due in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "description", label: "Description", type: "string", description: "Description of the invoice" },
      { name: "dueDate", label: "Due Date", type: "string", description: "When payment is due (ISO 8601)" },
      { name: "hostedInvoiceUrl", label: "Hosted Invoice URL", type: "string", description: "URL where customer can view and pay the invoice" },
      { name: "invoicePdf", label: "Invoice PDF URL", type: "string", description: "URL to download PDF of the invoice" },
      { name: "created", label: "Created At", type: "number", description: "Unix timestamp of creation" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ]
  },
  {
    type: "stripe_action_create_subscription",
    title: "Create Subscription",
    description: "Create a new subscription in Stripe",
    icon: Repeat,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "customerId",
        label: "Customer",
        type: "combobox",
        dynamic: "stripe_customers",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a customer...",
        description: "Select the customer for this subscription"
      },
      {
        name: "priceId",
        label: "Price",
        type: "combobox",
        dynamic: "stripe_prices",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a price...",
        description: "Select a price from the dropdown (shows product name and price)"
      },
      {
        name: "trialPeriodDays",
        label: "Trial Period (days)",
        type: "number",
        required: false,
        placeholder: "7",
        description: "Number of days for the trial period",
        dependsOn: "priceId",
        hidden: { $deps: ["priceId"], $condition: { priceId: { $exists: false } } }
      },
      {
        name: "metadata",
        label: "Custom Metadata (Optional)",
        type: "object",
        required: false,
        placeholder: '{"subscription_source": "workflow", "plan_type": "premium"}',
        description: "Set of key-value pairs for storing additional information",
        supportsAI: true,
        advanced: true,
        dependsOn: "priceId",
        hidden: { $deps: ["priceId"], $condition: { priceId: { $exists: false } } }
      }
    ],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the subscription (sub_...)" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer subscribed" },
      { name: "status", label: "Status", type: "string", description: "Subscription status (active, trialing, past_due, canceled, unpaid, incomplete)" },
      { name: "currentPeriodStart", label: "Current Period Start", type: "string", description: "Start of the current billing period (ISO 8601)" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "string", description: "End of the current billing period (ISO 8601)" },
      { name: "cancelAtPeriodEnd", label: "Cancel At Period End", type: "boolean", description: "Whether the subscription will be canceled at the end of the period" },
      { name: "trialStart", label: "Trial Start", type: "string", description: "When trial started (ISO 8601)" },
      { name: "trialEnd", label: "Trial End", type: "string", description: "When trial ends (ISO 8601)" },
      { name: "priceId", label: "Price ID", type: "string", description: "The price/plan ID for this subscription" },
      { name: "quantity", label: "Quantity", type: "number", description: "Quantity of the subscription" },
      { name: "created", label: "Created At", type: "number", description: "Unix timestamp of creation" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ]
  },
  {
    type: "stripe_action_get_payments",
    title: "Get Payments",
    description: "Retrieve payment intents from Stripe with optional filtering",
    icon: Search,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    configSchema: [
      {
        name: "customerId",
        label: "Filter by Customer (Optional)",
        type: "text",
        required: false,
        placeholder: "cus_1234567890",
        description: "Filter payments by customer ID"
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Number of payments to retrieve (max 100)"
      },
      {
        name: "status",
        label: "Filter by Status (Optional)",
        type: "select",
        required: false,
        options: [
          { value: "requires_payment_method", label: "Requires Payment Method" },
          { value: "requires_confirmation", label: "Requires Confirmation" },
          { value: "requires_action", label: "Requires Action" },
          { value: "processing", label: "Processing" },
          { value: "requires_capture", label: "Requires Capture" },
          { value: "canceled", label: "Canceled" },
          { value: "succeeded", label: "Succeeded" }
        ],
        tooltip: "Filter payments by their status"
      },
      {
        name: "starting_after",
        label: "Starting After (Optional)",
        type: "text",
        required: false,
        placeholder: "pi_1234567890",
        tooltip: "Payment intent ID to start after for pagination. Use to retrieve the next page of results."
      }
    ],
    outputSchema: [
      {
        name: "payments",
        label: "Payments",
        type: "array",
        description: "Array of payment intents from Stripe"
      },
      {
        name: "count",
        label: "Count",
        type: "number",
        description: "Number of payments retrieved"
      }
    ]
  },
  {
    type: "stripe_action_create_refund",
    title: "Create Refund",
    description: "Create a full or partial refund in Stripe",
    icon: RefreshCcw,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "chargeId",
        label: "Charge ID",
        type: "text",
        required: false,
        placeholder: "ch_1234567890",
        description: "The ID of the charge to refund (use this OR Payment Intent ID)"
      },
      {
        name: "paymentIntentId",
        label: "Payment Intent",
        type: "combobox",
        dynamic: "stripe_payment_intents",
        required: false,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a payment intent...",
        description: "Select a payment intent to refund (use this OR Charge ID)"
      },
      {
        name: "amount",
        label: "Amount (cents)",
        type: "number",
        required: false,
        placeholder: "1000",
        description: "Amount to refund in cents. Leave empty to refund full amount.",
        tooltip: "For partial refunds, specify the amount in cents. For full refunds, leave this empty."
      },
      {
        name: "reason",
        label: "Refund Reason",
        type: "select",
        required: false,
        options: [
          { value: "duplicate", label: "Duplicate charge" },
          { value: "fraudulent", label: "Fraudulent transaction" },
          { value: "requested_by_customer", label: "Requested by customer" }
        ],
        description: "Reason for the refund",
        tooltip: "This helps with reporting and dispute management"
      },
      {
        name: "metadata",
        label: "Custom Metadata",
        type: "object",
        required: false,
        placeholder: '{"refund_reason": "product_return", "ticket_id": "12345"}',
        description: "Key-value pairs for storing additional information",
        advanced: true
      }
    ],
    outputSchema: [
      { name: "refundId", label: "Refund ID", type: "string", description: "The unique ID of the refund (re_...)" },
      { name: "amount", label: "Amount", type: "number", description: "The refund amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "status", label: "Status", type: "string", description: "Refund status (pending, succeeded, failed, canceled)" },
      { name: "charge", label: "Charge ID", type: "string", description: "The ID of the charge that was refunded" },
      { name: "paymentIntent", label: "Payment Intent ID", type: "string", description: "The ID of the payment intent if applicable" },
      { name: "reason", label: "Reason", type: "string", description: "The reason for the refund" },
      { name: "receiptNumber", label: "Receipt Number", type: "string", description: "The refund receipt number" },
      { name: "created", label: "Created At", type: "number", description: "Unix timestamp of when the refund was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ]
  },
  {
    type: "stripe_action_cancel_subscription",
    title: "Cancel Subscription",
    description: "Cancel a subscription immediately or at period end",
    icon: XOctagon,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "subscriptionId",
        label: "Subscription",
        type: "combobox",
        dynamic: "stripe_subscriptions",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a subscription...",
        description: "Select the subscription to cancel"
      },
      {
        name: "at_period_end",
        label: "Cancel at Period End",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "If true, subscription remains active until end of billing period. If false, cancels immediately.",
        tooltip: "Enable this to let customers finish their paid period before cancellation takes effect"
      },
      {
        name: "invoice_now",
        label: "Create Invoice Now",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Create a final invoice immediately for any outstanding charges",
        advanced: true
      },
      {
        name: "prorate",
        label: "Prorate",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Calculate prorated amounts for partial billing period",
        advanced: true
      }
    ],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The ID of the canceled subscription" },
      { name: "status", label: "Status", type: "string", description: "Subscription status after cancellation" },
      { name: "canceledAt", label: "Canceled At", type: "number", description: "Unix timestamp of when subscription was canceled" },
      { name: "cancelAtPeriodEnd", label: "Cancel At Period End", type: "boolean", description: "Whether subscription will end at period end" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "number", description: "Unix timestamp of when current period ends" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer ID" },
      { name: "endedAt", label: "Ended At", type: "number", description: "Unix timestamp of when subscription ended (if applicable)" }
    ]
  },
  {
    type: "stripe_action_update_subscription",
    title: "Update Subscription",
    description: "Update subscription plan, quantity, or other settings",
    icon: Edit3,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "subscriptionId",
        label: "Subscription",
        type: "combobox",
        dynamic: "stripe_subscriptions",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a subscription...",
        description: "Select the subscription to update"
      },
      {
        name: "priceId",
        label: "New Price",
        type: "combobox",
        dynamic: "stripe_prices",
        required: false,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a price...",
        description: "Change to a different price/plan (leave empty to keep current plan)",
        dependsOn: "subscriptionId",
        hidden: { $deps: ["subscriptionId"], $condition: { subscriptionId: { $exists: false } } }
      },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        required: false,
        placeholder: "5",
        description: "Number of subscription units (e.g., seats, licenses)",
        tooltip: "Leave empty to keep current quantity"
      },
      {
        name: "trial_end",
        label: "Trial End",
        type: "text",
        required: false,
        placeholder: "now or timestamp",
        description: "End trial immediately ('now') or at specific timestamp",
        advanced: true
      },
      {
        name: "cancel_at_period_end",
        label: "Cancel at Period End",
        type: "boolean",
        required: false,
        description: "Schedule cancellation for end of current period",
        advanced: true
      },
      {
        name: "proration_behavior",
        label: "Proration Behavior",
        type: "select",
        required: false,
        options: [
          { value: "create_prorations", label: "Create prorations (default)" },
          { value: "none", label: "No proration" },
          { value: "always_invoice", label: "Always invoice immediately" }
        ],
        description: "How to handle proration when changing plans",
        tooltip: "Controls billing for partial periods when upgrading/downgrading",
        advanced: true
      },
      {
        name: "default_payment_method",
        label: "Default Payment Method",
        type: "text",
        required: false,
        placeholder: "pm_1234567890",
        description: "Update the default payment method",
        advanced: true
      },
      {
        name: "collection_method",
        label: "Collection Method",
        type: "select",
        required: false,
        options: [
          { value: "charge_automatically", label: "Charge automatically" },
          { value: "send_invoice", label: "Send invoice" }
        ],
        description: "How to collect payment",
        advanced: true
      },
      {
        name: "days_until_due",
        label: "Days Until Due",
        type: "number",
        required: false,
        placeholder: "30",
        description: "Days before invoice is due (for send_invoice mode)",
        dependsOn: "collection_method",
        advanced: true
      },
      {
        name: "metadata",
        label: "Custom Metadata",
        type: "object",
        required: false,
        placeholder: '{"plan_change_reason": "upgrade"}',
        description: "Key-value pairs for storing additional information",
        advanced: true
      }
    ],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer ID" },
      { name: "status", label: "Status", type: "string", description: "Subscription status" },
      { name: "currentPeriodStart", label: "Current Period Start", type: "number", description: "Unix timestamp of period start" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "number", description: "Unix timestamp of period end" },
      { name: "cancelAtPeriodEnd", label: "Cancel At Period End", type: "boolean", description: "Whether subscription will cancel at period end" },
      { name: "trialStart", label: "Trial Start", type: "number", description: "Unix timestamp of trial start" },
      { name: "trialEnd", label: "Trial End", type: "number", description: "Unix timestamp of trial end" },
      { name: "items", label: "Subscription Items", type: "array", description: "Array of subscription items with prices and quantities" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ]
  },
  {
    type: "stripe_action_create_checkout_session",
    title: "Create Checkout Session",
    description: "Create a Stripe Checkout session for hosted payment page",
    icon: CheckCircle2,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "line_items",
        label: "Line Items",
        type: "array",
        required: true,
        placeholder: '[{"price": "price_1234567890", "quantity": 1}]',
        description: "Array of items for checkout. Each item needs price ID and quantity.",
        tooltip: "Example: [{\"price\": \"price_abc123\", \"quantity\": 2}]"
      },
      {
        name: "mode",
        label: "Mode",
        type: "select",
        required: true,
        defaultValue: "payment",
        options: [
          { value: "payment", label: "One-time payment" },
          { value: "subscription", label: "Subscription" },
          { value: "setup", label: "Setup (save payment method)" }
        ],
        description: "Type of checkout session"
      },
      {
        name: "success_url",
        label: "Success URL",
        type: "text",
        required: true,
        placeholder: "https://yoursite.com/success?session_id={CHECKOUT_SESSION_ID}",
        description: "URL to redirect customer after successful payment",
        tooltip: "Use {CHECKOUT_SESSION_ID} placeholder to include session ID in URL"
      },
      {
        name: "cancel_url",
        label: "Cancel URL",
        type: "text",
        required: true,
        placeholder: "https://yoursite.com/canceled",
        description: "URL to redirect customer if they cancel"
      },
      {
        name: "customer",
        label: "Customer",
        type: "combobox",
        dynamic: "stripe_customers",
        required: false,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a customer...",
        description: "Existing customer (use this OR customer_email)"
      },
      {
        name: "customer_email",
        label: "Customer Email",
        type: "email",
        required: false,
        placeholder: "customer@example.com",
        description: "Pre-fill customer email (creates customer if doesn't exist)"
      },
      {
        name: "payment_method_types",
        label: "Payment Method Types",
        type: "multiselect",
        required: false,
        options: [
          { value: "card", label: "Credit/Debit Card" },
          { value: "us_bank_account", label: "US Bank Account (ACH)" },
          { value: "ideal", label: "iDEAL" },
          { value: "klarna", label: "Klarna" },
          { value: "afterpay_clearpay", label: "Afterpay/Clearpay" }
        ],
        description: "Accepted payment methods (defaults to card)",
        advanced: true
      },
      {
        name: "allow_promotion_codes",
        label: "Allow Promotion Codes",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Let customers enter promotion codes",
        advanced: true
      },
      {
        name: "billing_address_collection",
        label: "Billing Address Collection",
        type: "select",
        required: false,
        options: [
          { value: "auto", label: "Automatic (based on payment method)" },
          { value: "required", label: "Always require" }
        ],
        description: "Whether to collect billing address",
        advanced: true
      },
      {
        name: "shipping_address_collection",
        label: "Shipping Address Collection",
        type: "object",
        required: false,
        placeholder: '{"allowed_countries": ["US", "CA", "GB"]}',
        description: "Configure shipping address collection with allowed countries",
        advanced: true
      },
      {
        name: "metadata",
        label: "Custom Metadata",
        type: "object",
        required: false,
        placeholder: '{"order_id": "12345", "source": "website"}',
        description: "Key-value pairs for storing additional information",
        advanced: true
      },
      {
        name: "client_reference_id",
        label: "Client Reference ID",
        type: "text",
        required: false,
        placeholder: "order_12345",
        description: "Your internal reference ID for this checkout",
        advanced: true
      },
      {
        name: "locale",
        label: "Locale",
        type: "select",
        required: false,
        options: [
          { value: "auto", label: "Auto-detect" },
          { value: "en", label: "English" },
          { value: "es", label: "Spanish" },
          { value: "fr", label: "French" },
          { value: "de", label: "German" },
          { value: "it", label: "Italian" },
          { value: "ja", label: "Japanese" },
          { value: "zh", label: "Chinese" }
        ],
        description: "Language for checkout page",
        advanced: true
      }
    ],
    outputSchema: [
      { name: "sessionId", label: "Session ID", type: "string", description: "The unique ID of the checkout session" },
      { name: "url", label: "Checkout URL", type: "string", description: "URL to redirect customer to for payment" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer ID (if applicable)" },
      { name: "paymentIntentId", label: "Payment Intent ID", type: "string", description: "Payment intent ID (for one-time payments)" },
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "Subscription ID (for subscriptions)" },
      { name: "amountTotal", label: "Amount Total", type: "number", description: "Total amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "Three-letter ISO currency code" },
      { name: "paymentStatus", label: "Payment Status", type: "string", description: "Payment status" },
      { name: "status", label: "Status", type: "string", description: "Session status" },
      { name: "expiresAt", label: "Expires At", type: "number", description: "Unix timestamp of when session expires" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" }
    ]
  },
  {
    type: "stripe_action_create_payment_link",
    title: "Create Payment Link",
    description: "Create a shareable payment link (no code required)",
    icon: Link2,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "line_items",
        label: "Line Items",
        type: "array",
        required: true,
        placeholder: '[{"price": "price_1234567890", "quantity": 1}]',
        description: "Array of items for the payment link. Each item needs price ID and quantity.",
        tooltip: "Example: [{\"price\": \"price_abc123\", \"quantity\": 2}]"
      },
      {
        name: "after_completion",
        label: "After Completion",
        type: "object",
        required: false,
        placeholder: '{"type": "redirect", "redirect": {"url": "https://yoursite.com/success"}}',
        description: "What happens after payment (redirect or hosted_confirmation)",
        advanced: true
      },
      {
        name: "allow_promotion_codes",
        label: "Allow Promotion Codes",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Let customers enter promotion codes"
      },
      {
        name: "shipping_address_collection",
        label: "Shipping Address Collection",
        type: "object",
        required: false,
        placeholder: '{"allowed_countries": ["US", "CA", "GB"]}',
        description: "Configure shipping address collection with allowed countries",
        advanced: true
      },
      {
        name: "metadata",
        label: "Custom Metadata",
        type: "object",
        required: false,
        placeholder: '{"campaign": "summer_sale"}',
        description: "Key-value pairs for storing additional information",
        advanced: true
      },
      {
        name: "application_fee_amount",
        label: "Application Fee Amount",
        type: "number",
        required: false,
        placeholder: "100",
        description: "Fee amount in cents (for Connect platforms)",
        advanced: true
      },
      {
        name: "application_fee_percent",
        label: "Application Fee Percent",
        type: "number",
        required: false,
        placeholder: "5.5",
        description: "Fee as percentage (for Connect platforms)",
        advanced: true
      }
    ],
    outputSchema: [
      { name: "paymentLinkId", label: "Payment Link ID", type: "string", description: "The unique ID of the payment link" },
      { name: "url", label: "Payment Link URL", type: "string", description: "The shareable payment link URL" },
      { name: "active", label: "Active", type: "boolean", description: "Whether the payment link is active" },
      { name: "metadata", label: "Metadata", type: "object", description: "Custom metadata key-value pairs" },
      { name: "lineItems", label: "Line Items", type: "array", description: "Array of line items in the payment link" }
    ]
  },
  {
    type: "stripe_action_find_customer",
    title: "Find Customer",
    description: "Look up a customer by ID or email",
    icon: SearchCheck,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "customerId",
        label: "Customer",
        type: "combobox",
        dynamic: "stripe_customers",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a customer by name or email...",
        description: "Find a customer by selecting from the list or using the search"
      }
    ],
    outputSchema: [
      { name: "found", label: "Found", type: "boolean", description: "Whether customer was found" },
      { name: "customer", label: "Customer", type: "object", description: "Customer object (null if not found)" }
    ]
  },
  {
    type: "stripe_action_find_subscription",
    title: "Find Subscription",
    description: "Look up a subscription by ID",
    icon: SearchCheck,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "subscriptionId",
        label: "Subscription",
        type: "combobox",
        dynamic: "stripe_subscriptions",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a subscription...",
        description: "Select the subscription to find"
      }
    ],
    outputSchema: [
      { name: "found", label: "Found", type: "boolean", description: "Whether subscription was found" },
      { name: "subscription", label: "Subscription", type: "object", description: "Subscription object (null if not found)" }
    ]
  },
  {
    type: "stripe_action_find_payment_intent",
    title: "Find Payment Intent",
    description: "Look up a payment intent by ID",
    icon: SearchCheck,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "paymentIntentId",
        label: "Payment Intent",
        type: "combobox",
        dynamic: "stripe_payment_intents",
        required: true,
        loadOnMount: true,
        searchable: true,
        placeholder: "Search for a payment intent...",
        description: "Select a payment intent to find"
      }
    ],
    outputSchema: [
      { name: "found", label: "Found", type: "boolean", description: "Whether payment intent was found" },
      { name: "paymentIntent", label: "Payment Intent", type: "object", description: "Payment intent object (null if not found)" }
    ]
  },
]
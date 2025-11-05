import {
  ShoppingCart,
  Users,
  UserPlus,
  CreditCard,
  Repeat,
  XCircle,
  AlertTriangle,
  FileText,
  Search
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
    configSchema: [],
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
        type: "text",
        required: false,
        placeholder: "pm_1234567890",
        description: "ID of a PaymentMethod to attach as the default payment method"
      },
      {
        name: "invoice_prefix",
        label: "Invoice Prefix (Optional)",
        type: "text",
        required: false,
        placeholder: "CUST",
        description: "Custom prefix for invoice numbers (e.g., 'CUST' results in 'CUST-0001')"
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
    type: "stripe_trigger_customer_created",
    title: "Customer Created",
    description: "Triggers when a new customer is created in Stripe",
    icon: UserPlus,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
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
    type: "stripe_trigger_payment_succeeded",
    title: "Payment Succeeded",
    description: "Triggers when a payment is completed successfully",
    icon: CreditCard,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "paymentIntentId", label: "Payment Intent ID", type: "string", description: "The unique ID of the payment intent" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who made the payment" },
      { name: "amount", label: "Amount", type: "number", description: "The payment amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "The payment currency (e.g., usd)" },
      { name: "status", label: "Status", type: "string", description: "The payment status" },
      { name: "created", label: "Created Date", type: "string", description: "When the payment was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Any custom metadata associated with the payment" }
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
    configSchema: [],
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
    configSchema: [],
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
    configSchema: [],
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
      { name: "customerId", label: "Customer ID", type: "text", required: false, placeholder: "cus_1234567890" },
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
      { name: "customerId", label: "Customer ID", type: "text", required: true, placeholder: "cus_1234567890" },
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
      { name: "customerId", label: "Customer ID", type: "text", required: true, placeholder: "cus_1234567890" },
      { name: "priceId", label: "Price ID", type: "text", required: true, placeholder: "price_1234567890" },
      { name: "trialPeriodDays", label: "Trial Period (days)", type: "number", required: false, placeholder: "7" }
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
    type: "stripe_action_get_customers",
    title: "Get Customers",
    description: "Retrieve customers from Stripe with optional filtering",
    icon: Search,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    configSchema: [
      {
        name: "email",
        label: "Filter by Email (Optional)",
        type: "email",
        required: false,
        placeholder: "customer@example.com",
        description: "Filter customers by email address"
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Number of customers to retrieve (max 100)"
      },
      {
        name: "starting_after",
        label: "Starting After (Optional)",
        type: "text",
        required: false,
        placeholder: "cus_1234567890",
        tooltip: "Customer ID to start after for pagination. Use to retrieve the next page of results."
      }
    ],
    outputSchema: [
      {
        name: "customers",
        label: "Customers",
        type: "array",
        description: "Array of customers from Stripe"
      },
      {
        name: "count",
        label: "Count",
        type: "number",
        description: "Number of customers retrieved"
      }
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
]
import { ShoppingBag, Package, Users, TrendingUp, FileText, AlertCircle } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Shopify Integration
 *
 * Triggers:
 * - New Order
 * - Order Updated
 * - New Customer
 * - Product Updated
 * - Inventory Level Low
 *
 * Actions:
 * - Create Order
 * - Update Order Status
 * - Create Product
 * - Update Inventory
 * - Create Customer
 * - Add Order Note
 */

export const shopifyNodes: NodeComponent[] = [
  // ============================================================================
  // TRIGGERS
  // ============================================================================
  {
    type: "shopify_trigger_new_order",
    title: "New Order",
    description: "Triggers when a new order is created in your Shopify store",
    icon: ShoppingBag,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["read_orders"],
    configSchema: [
      {
        name: "fulfillment_status",
        label: "Fulfillment Status Filter (Optional)",
        type: "select",
        required: false,
        options: [
          { label: "Any Status", value: "any" },
          { label: "Fulfilled", value: "fulfilled" },
          { label: "Unfulfilled", value: "unfulfilled" },
          { label: "Partially Fulfilled", value: "partial" },
        ],
        defaultValue: "any",
        description: "Only trigger for orders with this fulfillment status"
      },
      {
        name: "financial_status",
        label: "Payment Status Filter (Optional)",
        type: "select",
        required: false,
        options: [
          { label: "Any Status", value: "any" },
          { label: "Paid", value: "paid" },
          { label: "Pending", value: "pending" },
          { label: "Authorized", value: "authorized" },
          { label: "Refunded", value: "refunded" },
        ],
        defaultValue: "any",
        description: "Only trigger for orders with this payment status"
      },
    ],
    outputSchema: [
      { name: "order_id", label: "Order ID", type: "string", description: "Unique identifier for the order" },
      { name: "order_number", label: "Order Number", type: "number", description: "Human-readable order number" },
      { name: "customer_email", label: "Customer Email", type: "string", description: "Email address of the customer" },
      { name: "customer_name", label: "Customer Name", type: "string", description: "Full name of the customer" },
      { name: "total_price", label: "Total Price", type: "number", description: "Total price of the order" },
      { name: "currency", label: "Currency", type: "string", description: "Currency code (e.g., USD, EUR)" },
      { name: "fulfillment_status", label: "Fulfillment Status", type: "string", description: "Current fulfillment status" },
      { name: "financial_status", label: "Payment Status", type: "string", description: "Current payment status" },
      { name: "line_items", label: "Line Items", type: "array", description: "Array of products in the order" },
      { name: "created_at", label: "Created At", type: "string", description: "When the order was created (ISO 8601)" },
    ],
  },
  {
    type: "shopify_trigger_order_updated",
    title: "Order Updated",
    description: "Triggers when an existing order is updated",
    icon: FileText,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["read_orders"],
    configSchema: [
      {
        name: "watch_field",
        label: "Watch For Changes In",
        type: "multi-select",
        required: false,
        options: [
          { label: "Fulfillment Status", value: "fulfillment_status" },
          { label: "Payment Status", value: "financial_status" },
          { label: "Tags", value: "tags" },
          { label: "Notes", value: "note" },
        ],
        description: "Only trigger when these fields change (leave empty to trigger on any change)"
      },
    ],
    outputSchema: [
      { name: "order_id", label: "Order ID", type: "string", description: "Unique identifier for the order" },
      { name: "order_number", label: "Order Number", type: "number", description: "Human-readable order number" },
      { name: "customer_email", label: "Customer Email", type: "string", description: "Email address of the customer" },
      { name: "fulfillment_status", label: "Fulfillment Status", type: "string", description: "Current fulfillment status" },
      { name: "financial_status", label: "Payment Status", type: "string", description: "Current payment status" },
      { name: "tags", label: "Tags", type: "string", description: "Tags associated with the order" },
      { name: "updated_at", label: "Updated At", type: "string", description: "When the order was last updated (ISO 8601)" },
    ],
  },
  {
    type: "shopify_trigger_new_customer",
    title: "New Customer",
    description: "Triggers when a new customer is created",
    icon: Users,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["read_customers"],
    configSchema: [
      {
        name: "notificationOnly",
        label: "Trigger Configuration",
        type: "select",
        required: false,
        options: [{ value: "all", label: "Trigger for all new customers" }],
        defaultValue: "all",
        description: "This trigger will fire whenever a new customer is created in your Shopify store"
      }
    ],
    outputSchema: [
      { name: "customer_id", label: "Customer ID", type: "string", description: "Unique identifier for the customer" },
      { name: "email", label: "Email", type: "string", description: "Customer's email address" },
      { name: "first_name", label: "First Name", type: "string", description: "Customer's first name" },
      { name: "last_name", label: "Last Name", type: "string", description: "Customer's last name" },
      { name: "phone", label: "Phone", type: "string", description: "Customer's phone number" },
      { name: "orders_count", label: "Orders Count", type: "number", description: "Total number of orders placed" },
      { name: "total_spent", label: "Total Spent", type: "number", description: "Total amount spent by customer" },
      { name: "created_at", label: "Created At", type: "string", description: "When the customer was created (ISO 8601)" },
    ],
  },
  {
    type: "shopify_trigger_product_updated",
    title: "Product Updated",
    description: "Triggers when a product is created or updated",
    icon: Package,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["read_products"],
    configSchema: [
      {
        name: "collection_id",
        label: "Collection Filter (Optional)",
        type: "select",
        dynamic: "shopify_collections",
        required: false,
        loadOnMount: true,
        placeholder: "All collections",
        description: "Only trigger for products in this collection"
      },
    ],
    outputSchema: [
      { name: "product_id", label: "Product ID", type: "string", description: "Unique identifier for the updated product" },
      { name: "title", label: "Title", type: "string", description: "The updated title of the product" },
      { name: "vendor", label: "Vendor", type: "string", description: "The vendor/brand of the product" },
      { name: "product_type", label: "Product Type", type: "string", description: "The type/category of the product" },
      { name: "status", label: "Status", type: "string", description: "Current status of the product (active, draft, archived)" },
      { name: "variants", label: "Variants", type: "array", description: "Array of product variants with pricing and inventory data" },
      { name: "updated_at", label: "Updated At", type: "string", description: "Timestamp when the product was last updated (ISO 8601)" },
    ],
  },
  {
    type: "shopify_trigger_inventory_low",
    title: "Inventory Level Low",
    description: "Triggers when product inventory falls below a threshold",
    icon: AlertCircle,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["read_inventory"],
    configSchema: [
      {
        name: "threshold",
        label: "Low Stock Threshold",
        type: "number",
        required: true,
        defaultValue: 10,
        placeholder: "10",
        description: "Trigger when inventory falls below this number"
      },
      {
        name: "location_id",
        label: "Location (Optional)",
        type: "select",
        dynamic: "shopify_locations",
        required: false,
        loadOnMount: true,
        placeholder: "All locations",
        description: "Only check inventory at this location"
      },
    ],
    outputSchema: [
      { name: "inventory_item_id", label: "Inventory Item ID", type: "string", description: "Unique identifier for the inventory item" },
      { name: "product_id", label: "Product ID", type: "string", description: "Unique identifier for the product with low stock" },
      { name: "variant_id", label: "Variant ID", type: "string", description: "Unique identifier for the specific variant" },
      { name: "sku", label: "SKU", type: "string", description: "Stock Keeping Unit code for the variant" },
      { name: "quantity", label: "Current Quantity", type: "number", description: "Current inventory quantity that fell below threshold" },
      { name: "location_id", label: "Location ID", type: "string", description: "The location where inventory is low" },
    ],
  },

  // ============================================================================
  // ACTIONS
  // ============================================================================
  {
    type: "shopify_action_create_order",
    title: "Create Order",
    description: "Create a new order in Shopify",
    icon: ShoppingBag,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: ["write_orders"],
    configSchema: [
      {
        name: "customer_email",
        label: "Customer Email",
        type: "text",
        required: true,
        placeholder: "customer@example.com",
        description: "Email address of the customer",
        supportsAI: true,
      },
      {
        name: "line_items",
        label: "Line Items",
        type: "array",
        required: true,
        placeholder: JSON.stringify([
          { variant_id: "123456", quantity: 1 }
        ], null, 2),
        description: "Array of items to include in the order",
        supportsAI: true,
      },
      {
        name: "send_receipt",
        label: "Send Order Confirmation Email",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Send order confirmation email to customer"
      },
      {
        name: "note",
        label: "Order Note (Optional)",
        type: "text",
        required: false,
        placeholder: "Special instructions...",
        description: "Internal note for the order",
        supportsAI: true,
      },
      {
        name: "tags",
        label: "Tags (Optional)",
        type: "text",
        required: false,
        placeholder: "wholesale, priority",
        description: "Comma-separated tags for the order",
        supportsAI: true,
      },
    ],
    outputSchema: [
      {
        name: "order_id",
        label: "Order ID",
        type: "string",
        description: "The unique identifier for the created order",
        example: "gid://shopify/Order/1234567890"
      },
      {
        name: "order_number",
        label: "Order Number",
        type: "number",
        description: "The order number displayed in Shopify admin",
        example: 1001
      },
      {
        name: "total_price",
        label: "Total Price",
        type: "number",
        description: "The total price of the order including taxes and shipping",
        example: 129.99
      },
      {
        name: "admin_url",
        label: "Admin URL",
        type: "string",
        description: "Direct link to view the order in Shopify admin",
        example: "https://mystore.myshopify.com/admin/orders/1234567890"
      },
      {
        name: "created_at",
        label: "Created At",
        type: "string",
        description: "ISO 8601 timestamp when the order was created",
        example: "2024-01-15T10:30:00Z"
      },
    ],
  },
  {
    type: "shopify_action_update_order_status",
    title: "Update Order Status",
    description: "Update the fulfillment or payment status of an order",
    icon: TrendingUp,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: ["write_orders"],
    configSchema: [
      {
        name: "order_id",
        label: "Order ID",
        type: "text",
        required: true,
        placeholder: "{{trigger.order_id}}",
        description: "The ID of the order to update",
        supportsAI: true,
      },
      {
        name: "action",
        label: "Action",
        type: "select",
        required: true,
        options: [
          { label: "Fulfill Order", value: "fulfill" },
          { label: "Cancel Order", value: "cancel" },
          { label: "Add Tags", value: "add_tags" },
          { label: "Add Note", value: "add_note" },
        ],
        description: "What action to perform on the order"
      },
      {
        name: "tags",
        label: "Tags",
        type: "text",
        required: false,
        placeholder: "urgent, priority",
        description: "Tags to add (only if action is 'Add Tags')",
        showIf: { field: "action", value: "add_tags" },
        supportsAI: true,
      },
      {
        name: "note",
        label: "Note",
        type: "text",
        required: false,
        placeholder: "Customer requested expedited shipping",
        description: "Note to add (only if action is 'Add Note')",
        showIf: { field: "action", value: "add_note" },
        supportsAI: true,
      },
      {
        name: "notify_customer",
        label: "Notify Customer",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Send notification email to customer"
      },
    ],
    outputSchema: [
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the order status update was successful",
        example: true
      },
      {
        name: "order_id",
        label: "Order ID",
        type: "string",
        description: "The unique identifier for the order that was updated",
        example: "gid://shopify/Order/1234567890"
      },
      {
        name: "status",
        label: "New Status",
        type: "string",
        description: "The new status of the order after the update",
        example: "fulfilled"
      },
      {
        name: "updated_at",
        label: "Updated At",
        type: "string",
        description: "ISO 8601 timestamp when the order was last updated",
        example: "2024-01-15T10:30:00Z"
      },
    ],
  },
  {
    type: "shopify_action_create_product",
    title: "Create Product",
    description: "Create a new product in Shopify",
    icon: Package,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: ["write_products"],
    configSchema: [
      {
        name: "title",
        label: "Product Title",
        type: "text",
        required: true,
        placeholder: "Amazing Product",
        description: "The name of the product",
        supportsAI: true,
      },
      {
        name: "body_html",
        label: "Description (HTML)",
        type: "text",
        required: false,
        placeholder: "<p>Product description...</p>",
        description: "Product description in HTML format",
        supportsAI: true,
      },
      {
        name: "vendor",
        label: "Vendor",
        type: "text",
        required: false,
        placeholder: "My Brand",
        description: "The vendor of the product",
        supportsAI: true,
      },
      {
        name: "product_type",
        label: "Product Type",
        type: "text",
        required: false,
        placeholder: "Apparel",
        description: "The type/category of the product",
        supportsAI: true,
      },
      {
        name: "price",
        label: "Price",
        type: "number",
        required: true,
        placeholder: "29.99",
        description: "The price of the product",
        supportsAI: true,
      },
      {
        name: "sku",
        label: "SKU (Optional)",
        type: "text",
        required: false,
        placeholder: "PROD-001",
        description: "Stock Keeping Unit",
        supportsAI: true,
      },
      {
        name: "inventory_quantity",
        label: "Initial Inventory",
        type: "number",
        required: false,
        defaultValue: 0,
        placeholder: "100",
        description: "Starting inventory quantity"
      },
    ],
    outputSchema: [
      {
        name: "product_id",
        label: "Product ID",
        type: "string",
        description: "The unique identifier for the created product",
        example: "gid://shopify/Product/9876543210"
      },
      {
        name: "variant_id",
        label: "Variant ID",
        type: "string",
        description: "The unique identifier for the default variant of the product",
        example: "gid://shopify/ProductVariant/1112223334"
      },
      {
        name: "title",
        label: "Title",
        type: "string",
        description: "The title of the created product",
        example: "Amazing Product"
      },
      {
        name: "admin_url",
        label: "Admin URL",
        type: "string",
        description: "Direct link to view the product in Shopify admin",
        example: "https://mystore.myshopify.com/admin/products/9876543210"
      },
      {
        name: "created_at",
        label: "Created At",
        type: "string",
        description: "ISO 8601 timestamp when the product was created",
        example: "2024-01-15T10:30:00Z"
      },
    ],
  },
  {
    type: "shopify_action_update_inventory",
    title: "Update Inventory",
    description: "Update the inventory level of a product variant",
    icon: Package,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: ["write_inventory"],
    configSchema: [
      {
        name: "inventory_item_id",
        label: "Inventory Item ID",
        type: "text",
        required: true,
        placeholder: "{{trigger.inventory_item_id}}",
        description: "The inventory item ID to update",
        supportsAI: true,
      },
      {
        name: "location_id",
        label: "Location",
        type: "select",
        dynamic: "shopify_locations",
        required: true,
        loadOnMount: true,
        placeholder: "Select location",
        description: "The location to update inventory at"
      },
      {
        name: "adjustment_type",
        label: "Adjustment Type",
        type: "select",
        required: true,
        options: [
          { label: "Set to Specific Amount", value: "set" },
          { label: "Add to Current", value: "add" },
          { label: "Subtract from Current", value: "subtract" },
        ],
        defaultValue: "set",
        description: "How to adjust the inventory"
      },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        required: true,
        placeholder: "100",
        description: "The amount to set/add/subtract",
        supportsAI: true,
      },
    ],
    outputSchema: [
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the inventory update was successful",
        example: true
      },
      {
        name: "inventory_item_id",
        label: "Inventory Item ID",
        type: "string",
        description: "The unique identifier for the inventory item that was updated",
        example: "gid://shopify/InventoryItem/5556667778"
      },
      {
        name: "new_quantity",
        label: "New Quantity",
        type: "number",
        description: "The updated inventory quantity after the adjustment",
        example: 150
      },
      {
        name: "location_id",
        label: "Location ID",
        type: "string",
        description: "The unique identifier for the location where inventory was updated",
        example: "gid://shopify/Location/9998887776"
      },
    ],
  },
  {
    type: "shopify_action_create_customer",
    title: "Create Customer",
    description: "Create a new customer in Shopify",
    icon: Users,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: ["write_customers"],
    configSchema: [
      {
        name: "email",
        label: "Email",
        type: "text",
        required: true,
        placeholder: "customer@example.com",
        description: "Customer's email address",
        supportsAI: true,
      },
      {
        name: "first_name",
        label: "First Name",
        type: "text",
        required: false,
        placeholder: "John",
        description: "Customer's first name",
        supportsAI: true,
      },
      {
        name: "last_name",
        label: "Last Name",
        type: "text",
        required: false,
        placeholder: "Doe",
        description: "Customer's last name",
        supportsAI: true,
      },
      {
        name: "phone",
        label: "Phone (Optional)",
        type: "text",
        required: false,
        placeholder: "+1-555-1234",
        description: "Customer's phone number",
        supportsAI: true,
      },
      {
        name: "tags",
        label: "Tags (Optional)",
        type: "text",
        required: false,
        placeholder: "vip, wholesale",
        description: "Comma-separated tags",
        supportsAI: true,
      },
      {
        name: "send_welcome_email",
        label: "Send Welcome Email",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Send account activation email"
      },
    ],
    outputSchema: [
      {
        name: "customer_id",
        label: "Customer ID",
        type: "string",
        description: "The unique identifier for the created customer",
        example: "gid://shopify/Customer/1234567890"
      },
      {
        name: "email",
        label: "Email",
        type: "string",
        description: "The email address of the created customer",
        example: "customer@example.com"
      },
      {
        name: "admin_url",
        label: "Admin URL",
        type: "string",
        description: "Direct link to view the customer in Shopify admin",
        example: "https://mystore.myshopify.com/admin/customers/1234567890"
      },
      {
        name: "created_at",
        label: "Created At",
        type: "string",
        description: "ISO 8601 timestamp when the customer was created",
        example: "2024-01-15T10:30:00Z"
      },
    ],
  },
  {
    type: "shopify_action_add_order_note",
    title: "Add Order Note",
    description: "Add an internal note to an existing order",
    icon: FileText,
    providerId: "shopify",
    category: "E-commerce",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: ["write_orders"],
    configSchema: [
      {
        name: "order_id",
        label: "Order ID",
        type: "text",
        required: true,
        placeholder: "{{trigger.order_id}}",
        description: "The ID of the order",
        supportsAI: true,
      },
      {
        name: "note",
        label: "Note",
        type: "text",
        required: true,
        placeholder: "Customer requested gift wrapping",
        description: "The note to add to the order",
        supportsAI: true,
      },
      {
        name: "append",
        label: "Append to Existing Note",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Add to existing note instead of replacing"
      },
    ],
    outputSchema: [
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the note was successfully added to the order",
        example: true
      },
      {
        name: "order_id",
        label: "Order ID",
        type: "string",
        description: "The unique identifier of the order that was updated",
        example: "gid://shopify/Order/1234567890"
      },
      {
        name: "note",
        label: "Updated Note",
        type: "string",
        description: "The complete note text after the update (includes appended content if applicable)",
        example: "Customer requested gift wrapping. Special delivery instructions: Leave at front door."
      },
    ],
  },
]

import { NodeComponent } from "../../../types"
import { Package, Edit, Search } from "lucide-react"

/**
 * Create Product Action
 */
export const hubspotActionCreateProduct: NodeComponent = {
  type: "hubspot_action_create_product",
  title: "Create Product",
  description: "Create a new product in HubSpot",
  icon: Package,
  providerId: "hubspot",
  requiredScopes: ["e-commerce"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    {
      name: "name",
      label: "Product Name",
      type: "text",
      required: true,
      placeholder: "Enter product name",
      description: "Name of the product"
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      required: false,
      placeholder: "Product description",
      description: "Detailed product description"
    },
    {
      name: "price",
      label: "Price",
      type: "number",
      required: false,
      placeholder: "0.00",
      description: "Product price"
    },
    {
      name: "hs_sku",
      label: "SKU",
      type: "text",
      required: false,
      placeholder: "Product SKU",
      description: "Stock keeping unit identifier"
    },
    {
      name: "hs_cost_of_goods_sold",
      label: "Cost of Goods Sold",
      type: "number",
      required: false,
      placeholder: "0.00",
      description: "Cost to produce/acquire the product"
    },
    {
      name: "hs_recurring_billing_period",
      label: "Billing Period",
      type: "select",
      required: false,
      options: [
        { value: "monthly", label: "Monthly" },
        { value: "quarterly", label: "Quarterly" },
        { value: "annually", label: "Annually" },
        { value: "P24M", label: "Every 24 months" },
        { value: "P36M", label: "Every 36 months" }
      ],
      description: "Recurring billing period (if applicable)"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Product ID", type: "string", description: "The unique ID of the created product" },
    { name: "name", label: "Product Name", type: "string", description: "The product name" },
    { name: "price", label: "Price", type: "number", description: "The product price" },
    { name: "hs_sku", label: "SKU", type: "string", description: "The product SKU" },
    { name: "createdAt", label: "Created At", type: "string", description: "When the product was created (ISO 8601)" },
    { name: "updatedAt", label: "Updated At", type: "string", description: "When the product was last updated (ISO 8601)" }
  ]
}

/**
 * Update Product Action
 */
export const hubspotActionUpdateProduct: NodeComponent = {
  type: "hubspot_action_update_product",
  title: "Update Product",
  description: "Update an existing product in HubSpot",
  icon: Edit,
  providerId: "hubspot",
  requiredScopes: ["e-commerce"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    // Product Selection (Parent field)
    {
      name: "productId",
      label: "Product to Update",
      type: "combobox",
      dynamic: "hubspot_products",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter product ID",
      description: "Choose the product you want to update"
    },

    // All updatable fields cascade after product selection
    {
      name: "name",
      label: "Product Name",
      type: "text",
      required: false,
      dependsOn: "productId",
      hidden: { $deps: ["productId"], $condition: { productId: { $exists: false } } },
      placeholder: "Enter product name",
      description: "Name of the product"
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      required: false,
      dependsOn: "productId",
      hidden: { $deps: ["productId"], $condition: { productId: { $exists: false } } },
      placeholder: "Product description",
      description: "Detailed product description"
    },
    {
      name: "price",
      label: "Price",
      type: "number",
      required: false,
      dependsOn: "productId",
      hidden: { $deps: ["productId"], $condition: { productId: { $exists: false } } },
      placeholder: "0.00",
      description: "Product price"
    },
    {
      name: "hs_sku",
      label: "SKU",
      type: "text",
      required: false,
      dependsOn: "productId",
      hidden: { $deps: ["productId"], $condition: { productId: { $exists: false } } },
      placeholder: "Product SKU",
      description: "Stock keeping unit identifier"
    },
    {
      name: "hs_cost_of_goods_sold",
      label: "Cost of Goods Sold",
      type: "number",
      required: false,
      dependsOn: "productId",
      hidden: { $deps: ["productId"], $condition: { productId: { $exists: false } } },
      placeholder: "0.00",
      description: "Cost to produce/acquire the product"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Product ID", type: "string", description: "The unique ID of the updated product" },
    { name: "name", label: "Product Name", type: "string", description: "The updated product name" },
    { name: "price", label: "Price", type: "number", description: "The updated product price" },
    { name: "hs_sku", label: "SKU", type: "string", description: "The updated product SKU" },
    { name: "updatedAt", label: "Updated At", type: "string", description: "When the product was last updated (ISO 8601)" }
  ]
}

/**
 * Get Products Action
 */
export const hubspotActionGetProducts: NodeComponent = {
  type: "hubspot_action_get_products",
  title: "Get Products",
  description: "Search and retrieve products from HubSpot",
  icon: Search,
  providerId: "hubspot",
  requiredScopes: ["e-commerce"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      description: "Maximum number of products to retrieve (max 100)"
    },
    {
      name: "filterProperty",
      label: "Filter Property",
      type: "text",
      required: false,
      placeholder: "e.g., hs_sku, name",
      description: "Property to filter by (optional)"
    },
    {
      name: "filterValue",
      label: "Filter Value",
      type: "text",
      required: false,
      placeholder: "Filter value",
      description: "Value to match for the filter property"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "products",
      label: "Products",
      type: "array",
      description: "Array of products from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of products retrieved"
    },
    {
      name: "total",
      label: "Total",
      type: "number",
      description: "Total number of products matching the criteria"
    }
  ]
}

export const productManagementActions = [
  hubspotActionCreateProduct,
  hubspotActionUpdateProduct,
  hubspotActionGetProducts
]

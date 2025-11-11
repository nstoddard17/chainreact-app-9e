import { NodeComponent } from "../../../types"
import { ShoppingCart, Edit, Trash2, Search } from "lucide-react"

/**
 * Create Line Item Action
 *
 * Associates a product with a deal as a line item
 */
export const hubspotActionCreateLineItem: NodeComponent = {
  type: "hubspot_action_create_line_item",
  title: "Create Line Item",
  description: "Add a product to a deal as a line item",
  icon: ShoppingCart,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.line_items.write", "crm.objects.deals.read"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    {
      name: "dealId",
      label: "Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter deal ID",
      description: "The deal to add the line item to"
    },
    {
      name: "productId",
      label: "Product",
      type: "combobox",
      dynamic: "hubspot_products",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter product ID",
      description: "The product to add to the deal"
    },
    {
      name: "quantity",
      label: "Quantity",
      type: "number",
      required: false,
      defaultValue: 1,
      placeholder: "1",
      description: "Number of units"
    },
    {
      name: "price",
      label: "Price (Optional)",
      type: "number",
      required: false,
      placeholder: "Override product price",
      description: "Override the default product price"
    },
    {
      name: "discount",
      label: "Discount (Optional)",
      type: "number",
      required: false,
      placeholder: "Discount amount",
      description: "Discount to apply to this line item"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "lineItemId",
      label: "Line Item ID",
      type: "string",
      description: "The unique ID of the created line item"
    },
    {
      name: "dealId",
      label: "Deal ID",
      type: "string",
      description: "The deal this line item is associated with"
    },
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "The product ID"
    },
    {
      name: "quantity",
      label: "Quantity",
      type: "number",
      description: "Number of units"
    },
    {
      name: "price",
      label: "Price",
      type: "number",
      description: "Unit price"
    },
    {
      name: "discount",
      label: "Discount",
      type: "number",
      description: "Discount applied"
    },
    {
      name: "amount",
      label: "Total Amount",
      type: "number",
      description: "Total line item amount (price * quantity - discount)"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "When the line item was created (ISO 8601)"
    }
  ]
}

/**
 * Update Line Item Action
 */
export const hubspotActionUpdateLineItem: NodeComponent = {
  type: "hubspot_action_update_line_item",
  title: "Update Line Item",
  description: "Update an existing line item",
  icon: Edit,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.line_items.write"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    {
      name: "lineItemId",
      label: "Line Item ID",
      type: "text",
      required: true,
      placeholder: "Enter line item ID",
      description: "The ID of the line item to update"
    },
    {
      name: "quantity",
      label: "New Quantity (Optional)",
      type: "number",
      required: false,
      placeholder: "Update quantity",
      description: "New quantity value"
    },
    {
      name: "price",
      label: "New Price (Optional)",
      type: "number",
      required: false,
      placeholder: "Update price",
      description: "New unit price"
    },
    {
      name: "discount",
      label: "New Discount (Optional)",
      type: "number",
      required: false,
      placeholder: "Update discount",
      description: "New discount amount"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "lineItemId",
      label: "Line Item ID",
      type: "string",
      description: "The unique ID of the updated line item"
    },
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "The product ID"
    },
    {
      name: "quantity",
      label: "Quantity",
      type: "number",
      description: "Updated quantity"
    },
    {
      name: "price",
      label: "Price",
      type: "number",
      description: "Updated unit price"
    },
    {
      name: "discount",
      label: "Discount",
      type: "number",
      description: "Updated discount"
    },
    {
      name: "amount",
      label: "Total Amount",
      type: "number",
      description: "Updated total amount"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "When the line item was updated (ISO 8601)"
    }
  ]
}

/**
 * Remove Line Item Action
 */
export const hubspotActionRemoveLineItem: NodeComponent = {
  type: "hubspot_action_remove_line_item",
  title: "Remove Line Item",
  description: "Remove a line item from a deal",
  icon: Trash2,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.line_items.write"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    {
      name: "lineItemId",
      label: "Line Item ID",
      type: "text",
      required: true,
      placeholder: "Enter line item ID",
      description: "The ID of the line item to remove"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the line item was successfully removed"
    },
    {
      name: "lineItemId",
      label: "Line Item ID",
      type: "string",
      description: "The ID of the removed line item"
    },
    {
      name: "deletedAt",
      label: "Deleted At",
      type: "string",
      description: "When the line item was deleted (ISO 8601)"
    }
  ]
}

/**
 * Get Line Items Action
 */
export const hubspotActionGetLineItems: NodeComponent = {
  type: "hubspot_action_get_line_items",
  title: "Get Line Items",
  description: "Retrieve all line items for a deal",
  icon: Search,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.line_items.read", "crm.objects.deals.read"],
  category: "Products",
  isTrigger: false,
  configSchema: [
    {
      name: "dealId",
      label: "Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter deal ID",
      description: "The deal to retrieve line items for"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "lineItems",
      label: "Line Items",
      type: "array",
      description: "Array of line items associated with the deal"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of line items retrieved"
    },
    {
      name: "dealId",
      label: "Deal ID",
      type: "string",
      description: "The deal ID"
    }
  ]
}

export const lineItemActions = [
  hubspotActionCreateLineItem,
  hubspotActionUpdateLineItem,
  hubspotActionRemoveLineItem,
  hubspotActionGetLineItems
]

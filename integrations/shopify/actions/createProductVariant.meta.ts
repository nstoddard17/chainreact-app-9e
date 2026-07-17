import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:create_product_variant` —
 * Slice 4.SHOPIFY-META-2. Mirrors `createProductVariant.schema.ts`.
 * `option1..3` match the parent product's option positions. `price` is a
 * decimal-as-string. No Q11 gate.
 */
export const shopifyCreateProductVariantMeta: ActionMeta = {
  key: "shopify:create_product_variant",
  provider: "shopify",
  type: "create_product_variant",
  displayName: "Create Product Variant",
  description:
    "Add a variant to an existing product. `option1..3` correspond to the product's option positions (e.g. Size = \"Large\"). Price is a decimal string. Optional SKU, inventory, weight, and barcode.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "product_id",
      label: "Product",
      description:
        "The parent product to add the variant to. Pick from your store's products or type a Shopify product id.",
      type: "combobox",
      optionsSource: "shopify:products",
      allowManualEntry: true,
      required: true,
      placeholder: "Search products or type an id",
    },
    {
      name: "price",
      label: "Price",
      description: "Decimal price as a string (e.g. \"39.99\").",
      type: "text",
      required: true,
      placeholder: "39.99",
    },
    {
      name: "option1",
      label: "Option 1",
      description:
        "Optional value for the product's first option — e.g. 'Large' if option 1 is Size.",
      type: "text",
      required: false,
    },
    {
      name: "option2",
      label: "Option 2",
      description:
        "Optional value for the product's second option — e.g. 'Red' if option 2 is Color.",
      type: "text",
      required: false,
    },
    {
      name: "option3",
      label: "Option 3",
      description:
        "Optional value for the product's third option — e.g. 'Cotton' if option 3 is Material.",
      type: "text",
      required: false,
    },
    {
      name: "sku",
      label: "SKU",
      description: "Optional SKU for the variant.",
      type: "text",
      required: false,
    },
    {
      name: "inventory_quantity",
      label: "Inventory Quantity",
      description: "Optional starting inventory for the variant.",
      type: "number",
      required: false,
      numeric: { min: 0, integer: true },
    },
    {
      name: "weight",
      label: "Weight",
      description: "Optional weight in the shop's default weight unit.",
      type: "number",
      required: false,
      numeric: { min: 0 },
    },
    {
      name: "barcode",
      label: "Barcode",
      description: "Optional barcode (ISBN, UPC, GTIN, etc.).",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the variant was created." },
    { name: "variantId", type: "string", description: "Shopify variant id." },
    { name: "productId", type: "string", description: "Parent product id." },
    {
      name: "inventoryItemId",
      type: "string",
      description:
        "The new variant's inventory item id. Map this into Update Inventory to set the variant's stock in the next step.",
    },
    { name: "sku", type: "string", description: "SKU stored. Null when not supplied." },
    { name: "price", type: "string", description: "Variant price as a decimal string." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the variant." },
    { name: "createdAt", type: "string", description: "ISO timestamp the variant was created." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a product variant — recoverable external write.",
};

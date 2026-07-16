import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:update_product_variant` —
 * Slice 4.SHOPIFY-META-2. Mirrors `updateProductVariant.schema.ts`.
 *
 * At least one mutable field is required by the runtime schema (.refine) —
 * a `variant_id`-only config is rejected. The meta can't express "at least
 * one of N" so every mutable field is `required: false`; the description
 * states the rule and the handler enforces it. Inventory fields are NOT
 * here by design — use `update_inventory`.
 */
export const shopifyUpdateProductVariantMeta: ActionMeta = {
  key: "shopify:update_product_variant",
  provider: "shopify",
  type: "update_product_variant",
  displayName: "Update Product Variant",
  description:
    "Update fields on an existing variant. Provide at least one field to change besides the id (the runtime rejects a variant-id-only update). Inventory is intentionally excluded — use the Update Inventory action instead.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "variant_id",
      label: "Variant ID",
      description: "The Shopify variant id to update.",
      type: "text",
      required: true,
      placeholder: "808950810",
    },
    {
      name: "price",
      label: "Price",
      description: "Optional decimal price as a string (e.g. \"44.99\").",
      type: "text",
      required: false,
      placeholder: "44.99",
    },
    {
      name: "compare_at_price",
      label: "Compare-at Price",
      description: "Optional decimal compare-at price (display only).",
      type: "text",
      required: false,
    },
    {
      name: "sku",
      label: "SKU",
      description: "Optional new SKU.",
      type: "text",
      required: false,
    },
    {
      name: "barcode",
      label: "Barcode",
      description: "Optional new barcode.",
      type: "text",
      required: false,
    },
    {
      name: "option1",
      label: "Option 1",
      description:
        "Optional new value for the product's first option — e.g. 'Large' if option 1 is Size.",
      type: "text",
      required: false,
    },
    {
      name: "option2",
      label: "Option 2",
      description:
        "Optional new value for the product's second option — e.g. 'Red' if option 2 is Color.",
      type: "text",
      required: false,
    },
    {
      name: "option3",
      label: "Option 3",
      description:
        "Optional new value for the product's third option — e.g. 'Cotton' if option 3 is Material.",
      type: "text",
      required: false,
    },
    {
      name: "weight",
      label: "Weight",
      description: "Optional weight value (in Weight Unit).",
      type: "number",
      required: false,
      numeric: { min: 0 },
    },
    {
      name: "weight_unit",
      label: "Weight Unit",
      description: "Optional weight unit. Shopify accepts exactly these four.",
      type: "select",
      required: false,
      options: [
        { value: "g", label: "Grams (g)" },
        { value: "kg", label: "Kilograms (kg)" },
        { value: "oz", label: "Ounces (oz)" },
        { value: "lb", label: "Pounds (lb)" },
      ],
    },
    {
      name: "taxable",
      label: "Taxable",
      description: "Optional. Whether the variant is taxable.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the update succeeded." },
    { name: "variantId", type: "string", description: "The Shopify variant id." },
    { name: "productId", type: "string", description: "Parent product id. Null when omitted." },
    { name: "title", type: "string", description: "Variant title after update." },
    { name: "price", type: "string", description: "Variant price as a decimal string." },
    { name: "compareAtPrice", type: "string", description: "Compare-at price. Null when not set." },
    { name: "sku", type: "string", description: "SKU after update. Null when not set." },
    { name: "barcode", type: "string", description: "Barcode after update. Null when not set." },
    { name: "option1", type: "string", description: "Option 1 value. Null when not set." },
    { name: "option2", type: "string", description: "Option 2 value. Null when not set." },
    { name: "option3", type: "string", description: "Option 3 value. Null when not set." },
    { name: "inventoryItemId", type: "string", description: "Linked inventory item id (use with Update Inventory)." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the variant." },
    { name: "updatedAt", type: "string", description: "ISO timestamp of the update." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates a product variant — recoverable external write.",
};

import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:create_product` — Slice 4.SHOPIFY-META-2.
 * Mirrors `createProduct.schema.ts`. Creates a product with one default
 * variant; `price` / `sku` / `inventory_quantity` land on that variant.
 * `price` is a decimal-as-string per Shopify convention. No Q11 gate.
 */
export const shopifyCreateProductMeta: ActionMeta = {
  key: "shopify:create_product",
  provider: "shopify",
  type: "create_product",
  displayName: "Create Product",
  description:
    "Create a product on the connected Shopify store with a single default variant. Price is a decimal string (e.g. \"29.99\"). Optional vendor, type, SKU, and starting inventory land on the default variant.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "title",
      label: "Title",
      description: "Product title.",
      type: "text",
      required: true,
    },
    {
      name: "price",
      label: "Price",
      description: "Decimal price as a string (e.g. \"29.99\").",
      type: "text",
      required: true,
      placeholder: "29.99",
    },
    {
      name: "body_html",
      label: "Description (HTML)",
      description: "Optional product description; accepts HTML.",
      type: "textarea",
      required: false,
    },
    {
      name: "vendor",
      label: "Vendor",
      description: "Optional product vendor.",
      type: "text",
      required: false,
    },
    {
      name: "product_type",
      label: "Product Type",
      description: "Optional product type / category label.",
      type: "text",
      required: false,
    },
    {
      name: "sku",
      label: "SKU",
      description: "Optional SKU for the default variant.",
      type: "text",
      required: false,
    },
    {
      name: "inventory_quantity",
      label: "Inventory Quantity",
      description: "Optional starting inventory for the default variant.",
      type: "number",
      required: false,
      numeric: { min: 0, integer: true },
    },
  ],
  outputs: [
    { name: "productId", type: "string", description: "Shopify product id." },
    { name: "variantId", type: "string", description: "Default variant id created with the product." },
    { name: "title", type: "string", description: "Product title Shopify stored." },
    { name: "vendor", type: "string", description: "Vendor Shopify stored. Null when not supplied." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the product." },
    { name: "createdAt", type: "string", description: "ISO timestamp the product was created." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a product record — recoverable external write.",
};

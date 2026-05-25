import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:update_product` — Slice 4.SHOPIFY-META-2.
 * Mirrors `updateProduct.schema.ts`. All fields except `product_id` optional
 * (partial PUT). `published` maps to Shopify status active/draft; omit to
 * leave unchanged. No Q11 gate.
 */
export const shopifyUpdateProductMeta: ActionMeta = {
  key: "shopify:update_product",
  provider: "shopify",
  type: "update_product",
  displayName: "Update Product",
  description:
    "Update fields on an existing product. Only supplied fields change. `published` toggles the product between active (true) and draft (false); omit it to leave the publish status unchanged.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "product_id",
      label: "Product ID",
      description: "The Shopify product id to update.",
      type: "text",
      required: true,
      placeholder: "632910392",
    },
    {
      name: "title",
      label: "Title",
      description: "Optional new title.",
      type: "text",
      required: false,
    },
    {
      name: "body_html",
      label: "Description (HTML)",
      description: "Optional new description; accepts HTML.",
      type: "textarea",
      required: false,
    },
    {
      name: "vendor",
      label: "Vendor",
      description: "Optional new vendor.",
      type: "text",
      required: false,
    },
    {
      name: "product_type",
      label: "Product Type",
      description: "Optional new product type.",
      type: "text",
      required: false,
    },
    {
      name: "tags",
      label: "Tags",
      description: "Optional comma-separated tags (replaces existing tags).",
      type: "text",
      required: false,
    },
    {
      name: "published",
      label: "Published",
      description:
        "Optional. True publishes the product (status active); false unpublishes (draft). Omit to leave unchanged.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the update succeeded." },
    { name: "productId", type: "string", description: "The Shopify product id." },
    { name: "title", type: "string", description: "Title after update." },
    { name: "status", type: "string", description: "Shopify status after update (active / draft)." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the product." },
    { name: "updatedAt", type: "string", description: "ISO timestamp of the update." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates a product record — recoverable external write.",
};

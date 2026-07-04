/**
 * Certification seed — shopify.
 *
 * Write lifecycle batch certified 2026-07-04 on the partner_test dev store.
 * Shopify registers NO read actions, so every verify runs through the shopify
 * per-resource state seams (product/variant/customer/order/inventory GETs).
 * No registered product/customer delete exists -> those marked artifacts stay;
 * orders are cancelled via the registered update_order_status where Shopify
 * permits (fulfilled orders cannot be cancelled).
 *
 * SAFETY: safe facts only — no secrets, tokens, selector values, ids,
 * payloads, or PII (guarded by certification.test.ts).
 */
import type { CertificationRecord } from "../certification";
import { records } from "./_shared";

const SMOKE_WRITE_SHOPIFY = "2026-07-04";

export const SHOPIFY_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create (marker title, 0.00) + product_state read-back proves the title; marked product stays (no registered delete)", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "create_product"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live retitle + suffix-pinned product_state read-back proves marker+updated; marked product stays", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "update_product"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live marker variant on a smoke product + product_state variants[] read-back; marked product + variant stay", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "create_product_variant"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live re-sku of a smoke product's default variant + suffix-pinned variant_state read-back; marked product stays", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "update_product_variant"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create (synthetic marker email, welcome email explicit false) + customer_state read-back; marked customer stays (no registered delete)", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "create_customer"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live rename + suffix-pinned customer_state read-back proves marker+updated; marked customer stays", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "update_customer"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live 0.00 test order (staged variant, send_receipt false) + order_state read-back; cancelled via registered update_order_status (persists)", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "create_order"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live cancel of a smoke 0.00 order + order_state read-back proves cancelled==true; cancelled marked order stays (no order delete)", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "update_order_status"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live marker note on a smoke 0.00 order + order_state read-back proves the note; order cancelled after (persists cancelled)", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "add_order_note"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live fulfillment of a smoke 0.00 order + order_state read-back proves fulfillmentStatus fulfilled; fulfilled marked order stays", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "create_fulfillment"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live set on a dev-test-staged tracked item + inventory_level read-back proves available==7; staged product torn down by the dev test", SMOKE_WRITE_SHOPIFY, [
    ["shopify", "update_inventory"],
  ]),
];

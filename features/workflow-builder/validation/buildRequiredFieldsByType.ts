/**
 * Re-export shim (B). The implementation moved to `core/workflows/requiredFields`
 * so both the builder and every server execution path share one ruleset. Kept at
 * this path so existing importers (builder page, run-now preflight, tests) are
 * unchanged.
 */
export { buildRequiredFieldsByType } from "@/core/workflows/requiredFields";

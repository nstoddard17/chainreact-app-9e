import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-docs:get_document — read-only document fetch (JSON content).
 *
 * Returns document title + flattened text content via documents.get (JSON,
 * NOT raw file bytes). documentId comes from env. Read-only — the report
 * asserts only the terminal run status, never document content.
 */
export default defineActionSmokeFixture({
  provider: "google-docs",
  action: "get_document",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { documentId: "SMOKE_GDOCS_DOCUMENT_ID" },
  requiredEnv: ["SMOKE_GOOGLE_DOCS_CONNECTED", "SMOKE_GDOCS_DOCUMENT_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Google Docs get_document (JSON content, no file bytes) on the smoke document.",
});

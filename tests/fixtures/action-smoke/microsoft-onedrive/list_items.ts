import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onedrive:list_items — read-only listing of a folder's children
 * (metadata only). `parentItemId` is optional; omitting it lists the drive
 * root, so this runs with just a connection.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onedrive",
  action: "list_items",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 10 },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only OneDrive root listing; needs a connected OneDrive.",
});

import type { NextRequest } from "next/server";
import { MobileAppConfigSchema } from "@chainreact/mobile-contracts";
import { requireMobilePublic, sendMobileJson } from "../_shared";
import { buildMobileAppConfig } from "@/services/mobile/appConfig";

/**
 * GET /api/mobile/v1/app-config — public client gate
 * (MOBILE-COMPANION-M1-MOBILE-READ-API-1). Unauthenticated by design (the
 * app checks versions before sign-in), still behind the namespace flag +
 * per-IP rate limit. 60s shared cache = the documented staleness tolerance
 * for force-update/maintenance state.
 */
export async function GET(request: NextRequest) {
  const gate = await requireMobilePublic(request);
  if (!gate.ok) return gate.response;
  return sendMobileJson(MobileAppConfigSchema, buildMobileAppConfig(), {
    headers: { "Cache-Control": "public, max-age=60, must-revalidate" },
  });
}

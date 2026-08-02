import type { NextRequest } from "next/server";
import { MobileSessionSchema } from "@chainreact/mobile-contracts";
import { requireMobileUser, sendMobileJson } from "../_shared";
import { buildMobileSession } from "@/services/mobile/session";

/**
 * GET /api/mobile/v1/session — authenticated session/account context
 * (MOBILE-COMPANION-M1-MOBILE-READ-API-1). Read-only: never mutates the web
 * active-account pointer; `defaultAccountId` is a suggestion the client owns
 * from here on.
 */
export async function GET(request: NextRequest) {
  const gate = await requireMobileUser(request);
  if (!gate.ok) return gate.response;
  const session = await buildMobileSession({
    userId: gate.user.userId,
    email: gate.user.email,
  });
  return sendMobileJson(MobileSessionSchema, session);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuthedUserId,
  parseAccountBody,
} from "@/app/api/account/_shared";
import { createTeamAccount } from "@/services/accounts/createTeamAccount";

/**
 * POST /api/accounts — create a Team account (4.ACCOUNT-MODEL-13, Phase D).
 *
 * Backend-only: no visible UI ships in this slice. Creates a SEPARATE team
 * account owned by the caller (owner membership + free billing) and auto-
 * activates it. The caller's personal account is untouched; a user may create
 * many teams.
 *
 * Scope fences enforced here:
 *   - Authenticated session → the owner is the SESSION user, never request input.
 *   - `type` is locked to `'team'` — `'organization'` cannot be created directly
 *     (it is reached only via the future in-place upgrade).
 *   - Free plan only (the service inits default billing; no Stripe).
 */

// Only `team` is creatable in this slice. The body cannot request another type.
const CreateAccountBodySchema = z.object({
  name: z.string().trim().min(1, "A team name is required.").max(100, "Name too long."),
  type: z.literal("team").optional().default("team"),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, CreateAccountBodySchema);
  if (!body.ok) return body.response;

  const account = await createTeamAccount({
    userId: auth.userId,
    name: body.data.name,
  });

  return NextResponse.json({ ok: true, account }, { status: 201 });
}

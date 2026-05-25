import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Shared route-layer helpers for /api/providers and /api/native.
 *
 * Per project-structure-and-module-boundaries.md §5: route handlers stay
 * thin. Discovery routes are read-only metadata exposers; the only
 * cross-cutting concern is the auth gate. The /api/native routes import
 * from this same file for consistency.
 *
 * Underscore-prefixed file: not a route.
 */

export interface AuthSuccess {
  ok: true;
  userId: string;
}
export interface AuthFailure {
  ok: false;
  response: NextResponse;
}

export async function requireUser(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthenticated" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, userId: user.id };
}

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getProvider } from "@/integrations/_registry";
import { isMachineCredentialAuthFlow } from "@/contracts/integration";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { disconnectMachineProvider } from "@/services/machineCredentials/connect";

/**
 * Disconnect the active account's machine credential for a provider. Owner/admin
 * only (account-credential management), mirroring the connect gate. Idempotent:
 * disconnecting when nothing is connected returns `{ disconnected: false }`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const manifest = getProvider(provider);
  if (!manifest || !isMachineCredentialAuthFlow(manifest.authFlow)) {
    return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
  }

  const resolved = await resolveActiveAccount(user.id);
  if (!resolved.ok) {
    const statusByReason = { not_member: 403, account_frozen: 409 } as const;
    return NextResponse.json({ error: resolved.reason }, { status: statusByReason[resolved.reason] });
  }
  const roleCheck = await requireAccountRole(user.id, resolved.accountId, ["owner", "admin"]);
  if (!roleCheck.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await disconnectMachineProvider({
      accountId: resolved.accountId,
      actorUserId: user.id,
      provider,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "disconnect_failed" }, { status: 400 });
  }
}

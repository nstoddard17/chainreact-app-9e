import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getProvider } from "@/integrations/_registry";
import { isMachineCredentialAuthFlow } from "@/contracts/integration";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  connectMachineCredential,
  UnsupportedMachineProviderError,
} from "@/services/machineCredentials/connect";
import { MachineConnectInputError } from "@/services/machineCredentials/types";
import { MtlsCertificateError } from "@/services/http/mtls";

/**
 * Connect a machine (client_credentials + mTLS) credential for the active account.
 *
 * Thin route: authenticate, gate (machine providers are account/service resources
 * → owner/admin only, like every account-credential connect), parse the credential
 * body, dispatch to the service, return the SECRET-OMITTING DTO. The raw body
 * carries the client secret + private key, so NOTHING from it is ever echoed back
 * or logged — errors collapse to stable codes.
 *
 * Body: { clientId, clientSecret, certPem, keyPem, environment?, label? } (strings).
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

  // Provider must exist, be ENABLED, and use the machine auth flow. A disabled
  // provider (ADP today) refuses connect even though its config is registered.
  const manifest = getProvider(provider);
  if (!manifest || !isMachineCredentialAuthFlow(manifest.authFlow)) {
    return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
  }
  if (!manifest.isEnabled) {
    return NextResponse.json({ error: "provider_disabled" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    const candidate = text.trim() ? (JSON.parse(text) as unknown) : null;
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    body = candidate as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Resolve the active account (membership + freeze enforced) and require
  // owner/admin — connecting a shared machine credential is account management.
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
    const dto = await connectMachineCredential({
      accountId: resolved.accountId,
      actorUserId: user.id,
      provider,
      input: {
        clientId: String(body.clientId ?? ""),
        clientSecret: String(body.clientSecret ?? ""),
        certPem: String(body.certPem ?? ""),
        keyPem: String(body.keyPem ?? ""),
        environment: typeof body.environment === "string" ? body.environment : null,
        label: typeof body.label === "string" ? body.label : null,
      },
    });
    return NextResponse.json({ credential: dto });
  } catch (err) {
    // Typed, non-leaking mapping. The raw error may reference cert internals /
    // input — never echo it. Input + cert problems are 400 (user can fix); an
    // unsupported provider is 404; anything else is a generic 400.
    if (err instanceof UnsupportedMachineProviderError) {
      return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
    }
    if (err instanceof MachineConnectInputError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof MtlsCertificateError) {
      // Redacted cert code (e.g. certificate_expired) — safe, no PEM.
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: "connect_failed" }, { status: 400 });
  }
}

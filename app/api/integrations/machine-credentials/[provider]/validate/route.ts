import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getProvider } from "@/integrations/_registry";
import { isMachineCredentialAuthFlow } from "@/contracts/integration";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  parseClientCertificate,
  assertKeyMatchesCertificate,
  MtlsCertificateError,
} from "@/services/http/mtls";

/**
 * Pre-submit certificate validation for the machine-credential connect form.
 *
 * Parses the pasted/uploaded certificate + private key and returns ONLY SAFE,
 * NON-SECRET metadata (subject, fingerprint, validity window, expired/not-yet-
 * valid flags, key-pair match) so the form can show cert details + clear errors
 * BEFORE the user commits. It **stores nothing** and never echoes the cert body,
 * private key, or client secret. Same auth gate as connect (owner/admin) — it
 * accepts a private key, so it is not an open oracle.
 *
 * Reuses the exact server-side validation (`services/http/mtls`) the store uses,
 * so pre-submit results match what connect will accept.
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

  const certPem = String(body.certPem ?? "");
  const keyPem = String(body.keyPem ?? "");
  if (!certPem.trim() || !keyPem.trim()) {
    return NextResponse.json({ error: "missing_field" }, { status: 400 });
  }

  // Parse the certificate → safe metadata. Unparseable ⇒ typed code (redacted).
  let info;
  try {
    info = parseClientCertificate(certPem);
  } catch (err) {
    const code = err instanceof MtlsCertificateError ? err.code : "certificate_parse_failed";
    return NextResponse.json({ ok: false, code }, { status: 200 });
  }

  // Key/cert pairing — report as a boolean (don't hard-fail; the form shows it).
  let keyMatches = true;
  let keyError: string | null = null;
  try {
    assertKeyMatchesCertificate(certPem, keyPem);
  } catch (err) {
    keyMatches = false;
    keyError = err instanceof MtlsCertificateError ? err.code : "key_certificate_mismatch";
  }

  const nowMs = Date.now();
  const notYetValid = nowMs < new Date(info.validFrom).getTime();
  const expired = nowMs > new Date(info.validTo).getTime();

  return NextResponse.json({
    ok: keyMatches && !notYetValid && !expired,
    cert: {
      subject: info.subject,
      fingerprint256: info.fingerprint256,
      validFrom: info.validFrom,
      validTo: info.validTo,
      expired,
      notYetValid,
      keyMatches,
      keyError,
    },
  });
}

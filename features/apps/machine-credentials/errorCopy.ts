/**
 * Maps machine-credential error/validation codes to friendly, SAFE UI copy.
 *
 * Every string is generic and never reflects a secret value. Unknown codes fall
 * back to a neutral message, so a new server code can never surface a raw error.
 */
const COPY: Readonly<Record<string, string>> = {
  // Input
  missing_field: "Fill in every field before continuing.",
  field_too_long: "One of the values is too long. Check the certificate and key.",
  invalid_environment: "Choose a valid environment.",
  invalid_body: "Something went wrong sending the form. Please try again.",
  invalid_client_id: "The client id looks invalid (it must not contain spaces).",
  bad_client_id: "The client id looks invalid.",
  // Certificate / key (from the mTLS validator + store)
  certificate_parse_failed: "That doesn't look like a valid PEM certificate.",
  private_key_parse_failed: "That doesn't look like a valid PEM private key.",
  key_certificate_mismatch: "The private key doesn't match the certificate.",
  certificate_expired: "The certificate has expired. Use a current certificate.",
  certificate_not_yet_valid: "The certificate isn't valid yet (its start date is in the future).",
  invalid_certificate: "The certificate must be a PEM-encoded X.509 certificate.",
  invalid_private_key: "The private key must be a PEM-encoded private key.",
  // Authz / availability
  unauthenticated: "Please sign in again.",
  forbidden: "Only an account owner or admin can manage this connection.",
  not_member: "Only an account owner or admin can manage this connection.",
  account_frozen: "This account is not currently active.",
  provider_disabled: "This connection isn't available yet.",
  unsupported_provider: "This connection isn't available.",
  // Generic
  connect_failed: "Couldn't save the connection. Check the values and try again.",
  disconnect_failed: "Couldn't disconnect. Please try again.",
  request_failed: "Something went wrong. Please try again.",
};

export function machineCredentialErrorCopy(code: string | undefined): string {
  if (!code) return COPY.request_failed!;
  return COPY[code] ?? COPY.request_failed!;
}

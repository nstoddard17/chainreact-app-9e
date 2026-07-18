/**
 * Server-side mutual-TLS transport (provider-neutral).
 *
 * Barrel for the mTLS infrastructure used by any provider that must present a
 * client certificate on every request (first consumer: ADP). Import from here.
 */
export {
  createMtlsClient,
  mtlsRequest,
  type MtlsClientCredential,
  type MtlsRequestInput,
  type MtlsResponse,
  type MtlsDispatch,
  type MtlsDispatchInput,
} from "./client";
export {
  parseClientCertificate,
  assertKeyMatchesCertificate,
  assertCertificateCurrentlyValid,
  certificateExpiringWithin,
  type ClientCertificateInfo,
} from "./certificate";
export {
  MtlsError,
  MtlsCertificateError,
  CertificateExpiredError,
  CertificateNotYetValidError,
  extractCauseCode,
  type MtlsErrorCode,
} from "./errors";

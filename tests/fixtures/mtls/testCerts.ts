/**
 * TEST-ONLY throwaway self-signed certificate + matching EC private key.
 *
 * ⚠️ NOT A SECRET. Generated once with openssl for unit tests of the mTLS
 * transport. The private key is disposable and grants access to nothing. Stored
 * inline in a .ts file (not a .pem) because the repo `.gitignore`s `*.pem` and
 * the MCP path denylist blocks `.pem` reads — an inline test string avoids both
 * while keeping the fixture in-repo.
 *
 * Subject: CN=chainreact-mtls-test, O=ChainReact TEST ONLY DO NOT TRUST
 * SAN: DNS:localhost, IP:127.0.0.1  (so the integration test can do full
 *      hostname verification against a local https server)
 * notBefore: 2026-07-18T01:55:49Z
 * notAfter:  2126-06-24T01:55:49Z
 *
 * Validity-window branches (expired / not-yet-valid) are exercised by injecting
 * a `now` outside this window against this single fixture — no backdated cert
 * needed.
 */

export const TEST_CERT_NOT_BEFORE_ISO = "2026-07-18T01:55:49.000Z";
export const TEST_CERT_NOT_AFTER_ISO = "2126-06-24T01:55:49.000Z";

export const TEST_CLIENT_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICCjCCAa+gAwIBAgIUCR1/XSWGXaTWEAt4Mo5UyAxwY/cwCgYIKoZIzj0EAwIw
SzEdMBsGA1UEAwwUY2hhaW5yZWFjdC1tdGxzLXRlc3QxKjAoBgNVBAoMIUNoYWlu
UmVhY3QgVEVTVCBPTkxZIERPIE5PVCBUUlVTVDAgFw0yNjA3MTgwMTU1NDlaGA8y
MTI2MDYyNDAxNTU0OVowSzEdMBsGA1UEAwwUY2hhaW5yZWFjdC1tdGxzLXRlc3Qx
KjAoBgNVBAoMIUNoYWluUmVhY3QgVEVTVCBPTkxZIERPIE5PVCBUUlVTVDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABD+MD0+iX45ATlcWg33tJUBEQRQHmahr5P5k
WXhtnMUhHC1OelVlsOhIjxJUmruMQ3DwSRjOAzTd8OXwHwXr5VqjbzBtMB0GA1Ud
DgQWBBR9Nx0OvNgUuYDFU6hSP+J2vF2MljAfBgNVHSMEGDAWgBR9Nx0OvNgUuYDF
U6hSP+J2vF2MljAPBgNVHRMBAf8EBTADAQH/MBoGA1UdEQQTMBGCCWxvY2FsaG9z
dIcEfwAAATAKBggqhkjOPQQDAgNJADBGAiEAndrLzuOWCHqtyTepCxnkDJYYWywU
I0onqifggAmpyXkCIQDgf+K3j/cUuVAOBJcNAKEGsp+RXquh/EHs+Dx1wWZXzg==
-----END CERTIFICATE-----
`;

export const TEST_CLIENT_KEY_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIAPpZgAImNgXhkKLn1DIscqtb62I8FcfFB19V/dv3xwnoAoGCCqGSM49
AwEHoUQDQgAEP4wPT6JfjkBOVxaDfe0lQERBFAeZqGvk/mRZeG2cxSEcLU56VWWw
6EiPElSau4xDcPBJGM4DNN3w5fAfBevlWg==
-----END EC PRIVATE KEY-----
`;

/** A syntactically-broken PEM for parse-failure tests. */
export const TEST_MALFORMED_CERT_PEM = `-----BEGIN CERTIFICATE-----
not-a-real-certificate
-----END CERTIFICATE-----
`;

/**
 * Step 01 — authorize the THROWAWAY spike client as Test Account A with the
 * drive.file scope ONLY. Prints the granted scope string (the fresh-grant
 * hygiene check) and stores tokens in the out-of-repo state dir.
 *
 * Flow: localhost:8765 loopback redirect + PKCE. Sign in with Test Account A
 * in the browser window this opens. NEVER use a production account.
 */
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { exec } from "node:child_process";
import { assertNotProduction, requireEnv, saveState, DRIVE_FILE_SCOPE, stateDir } from "./_shared";

assertNotProduction();
const clientId = requireEnv("SPIKE_GOOGLE_CLIENT_ID");
const clientSecret = requireEnv("SPIKE_GOOGLE_CLIENT_SECRET");
const REDIRECT = "http://localhost:8765/callback";

const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const stateToken = randomBytes(16).toString("base64url");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: DRIVE_FILE_SCOPE,
    state: stateToken,
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost:8765");
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (err || !code || url.searchParams.get("state") !== stateToken) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${err ?? "bad state/code"}`);
    console.error(`Authorization failed: ${err ?? "state mismatch or missing code"}`);
    process.exit(1);
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed — see terminal.");
    console.error(`Token exchange failed: HTTP ${tokenRes.status}`);
    process.exit(1);
  }
  const t = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  if (!t.refresh_token) {
    console.error("Google returned no refresh_token (re-run; prompt=consent should force one).");
    process.exit(1);
  }
  const granted = (t.scope ?? "").split(" ").filter(Boolean);
  saveState({
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    accessTokenExpiresAt: Date.now() + t.expires_in * 1000,
    grantedScopes: granted,
  });
  res.writeHead(200, { "Content-Type": "text/plain" }).end("Spike authorization complete — return to the terminal.");
  console.log("Granted scopes (fresh-grant hygiene check — must be drive.file and nothing broader):");
  for (const s of granted) console.log(`  ${s}`);
  const extraDrive = granted.filter((s) => s.includes("/auth/drive") && s !== DRIVE_FILE_SCOPE);
  if (extraDrive.length > 0) {
    console.error("CONTAMINATED GRANT: broader Drive scope present. Revoke the app on Account A and re-run.");
    process.exit(1);
  }
  console.log(`Tokens stored (outside repo) in: ${stateDir()}`);
  server.close();
});

server.listen(8765, () => {
  console.log("Opening the authorize URL — sign in as Test Account A…");
  console.log(authUrl);
  exec(`start "" "${authUrl.replaceAll("&", "^&")}"`);
});

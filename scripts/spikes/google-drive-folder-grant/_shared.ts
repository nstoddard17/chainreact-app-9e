/**
 * Shared plumbing for the drive.file folder-grant spike harness.
 *
 * SAFETY MODEL
 *   - Standalone: imports NOTHING from ChainReact runtime code, so it can
 *     never pick up the production Google client by accident.
 *   - Refuses to run if SPIKE_GOOGLE_CLIENT_ID equals the production
 *     GOOGLE_CLIENT_ID present in the environment.
 *   - All state (tokens, picked ids, subscription names) lives OUTSIDE the
 *     repo, in `${os.tmpdir()}/chainreact-drive-spike/state.json` (override
 *     with SPIKE_STATE_DIR). Nothing secret is printed or committed.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface SpikeState {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  grantedScopes?: string[];
  pickedFolderId?: string;
  pickedFileId?: string;
  subscriptionNames?: string[];
  changesToken?: string;
}

export function stateDir(): string {
  const dir = process.env.SPIKE_STATE_DIR ?? join(tmpdir(), "chainreact-drive-spike");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const statePath = () => join(stateDir(), "state.json");

export function loadState(): SpikeState {
  if (!existsSync(statePath())) return {};
  return JSON.parse(readFileSync(statePath(), "utf8")) as SpikeState;
}

export function saveState(patch: Partial<SpikeState>): SpikeState {
  const next = { ...loadState(), ...patch };
  writeFileSync(statePath(), JSON.stringify(next, null, 2));
  return next;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name} — see the README's owner-setup section.`);
    process.exit(1);
  }
  return v;
}

/** Abort if the spike is pointed at the production OAuth client. */
export function assertNotProduction(): void {
  const spike = requireEnv("SPIKE_GOOGLE_CLIENT_ID");
  const prod = process.env.GOOGLE_CLIENT_ID;
  if (prod && spike === prod) {
    console.error(
      "SPIKE_GOOGLE_CLIENT_ID equals the production GOOGLE_CLIENT_ID. " +
        "This spike must use a throwaway client. Aborting.",
    );
    process.exit(1);
  }
}

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Access token for the NARROW (drive.file) spike grant, refreshing if stale. */
export async function narrowAccessToken(): Promise<string> {
  const state = loadState();
  if (state.accessToken && state.accessTokenExpiresAt && Date.now() < state.accessTokenExpiresAt - 60_000) {
    return state.accessToken;
  }
  if (!state.refreshToken) {
    console.error("No spike refresh token — run 01-authorize.ts first.");
    process.exit(1);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: state.refreshToken,
      client_id: requireEnv("SPIKE_GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("SPIKE_GOOGLE_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    console.error(`Token refresh failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  saveState({ accessToken: json.access_token, accessTokenExpiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

/** files.get with the narrow token; returns a compact sanitized result row. */
export async function probeFilesGet(fileId: string): Promise<{ ok: boolean; status: number; name?: string; mimeType?: string }> {
  const token = await narrowAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,isAppAuthorized&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return { ok: false, status: res.status };
  const j = (await res.json()) as { name?: string; mimeType?: string };
  return { ok: true, status: res.status, name: j.name, mimeType: j.mimeType };
}

/** Content readability probe: alt=media for binary, export for Google-native. */
export async function probeContent(fileId: string, mimeType: string | undefined): Promise<{ ok: boolean; status: number }> {
  const token = await narrowAccessToken();
  const isNative = (mimeType ?? "").startsWith("application/vnd.google-apps");
  const url = isNative
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  // Read at most a few bytes to prove access without dumping content.
  if (res.ok) await res.arrayBuffer();
  return { ok: res.ok, status: res.status };
}

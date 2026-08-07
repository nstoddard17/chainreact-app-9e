# Google Drive folder-grant spike harness (GOOGLE-DRIVE-FOLDER-GRANT-SPIKE-1)

Proves (or refutes) the gate question from
[`docs/slices/phase-5/google-oauth/drive-restricted-scope-escape-audit.md`](../../../docs/slices/phase-5/google-oauth/drive-restricted-scope-escape-audit.md):

> If a user explicitly authorizes a folder under `drive.file`, does ChainReact
> receive Workspace Events for files created beneath it (including by another
> user, including nested), and can the same narrow token then READ those files?

**Never uses production anything.** The harness refuses to run against the
production Google client: it takes its own `SPIKE_*` env vars and will abort if
`SPIKE_GOOGLE_CLIENT_ID` equals `GOOGLE_CLIENT_ID`. Tokens/state are written
OUTSIDE the repo (OS temp dir by default). No secret is ever printed or
committed.

## One-time owner setup (~20 minutes, all throwaway)

1. **Google Cloud project** (new, throwaway — NOT `chainreact-462214`), e.g.
   `chainreact-drive-spike`. Note its **project number**.
2. Enable APIs: **Google Drive API**, **Google Workspace Events API**,
   **Google Picker API**, **Cloud Pub/Sub API**.
3. **OAuth consent screen**: External + Testing mode. Add **Test account A**
   (a throwaway Google account you control) as a test user.
4. **OAuth client** (type: Web application) with redirect URI
   `http://localhost:8765/callback`. Note client id + secret.
5. **API key** (for the Picker developer key).
6. **Pub/Sub**: create topic `drive-spike-events`; grant role
   *Pub/Sub Publisher* on the topic to
   `drive-api-event-push@system.gserviceaccount.com`; create a **pull**
   subscription `drive-spike-pull` on the topic.
7. **Test accounts**: Account A (authorizes the app; owns the test folder) and
   Account B (second throwaway account; gets edit access to the folder). In
   Account A's Drive create folder `ChainReact Drive Scope Spike` with child
   folder `Nested`, share it with B (editor). Optionally pre-create
   `pre-existing.txt` (in the folder) and `pre-existing-nested.txt` (in
   `Nested`) BEFORE running step 02 — these become Tests E/F.
8. `gcloud` CLI authenticated as any principal with `pubsub.subscriber` on the
   subscription (only used for `gcloud auth print-access-token`).

Set env (PowerShell example; never commit these):

```
$env:SPIKE_GOOGLE_CLIENT_ID     = "<throwaway client id>"
$env:SPIKE_GOOGLE_CLIENT_SECRET = "<throwaway client secret>"
$env:SPIKE_GOOGLE_API_KEY       = "<throwaway API key>"
$env:SPIKE_GOOGLE_PROJECT_NUMBER= "<throwaway project NUMBER>"
$env:SPIKE_PUBSUB_PROJECT       = "<throwaway project id>"
$env:SPIKE_PUBSUB_SUBSCRIPTION  = "drive-spike-pull"
$env:SPIKE_GCLOUD_ACCESS_TOKEN  = (gcloud auth print-access-token)
```

## Run order

```
npx tsx scripts/spikes/google-drive-folder-grant/01-authorize.ts   # sign in as Account A; drive.file ONLY
npx tsx scripts/spikes/google-drive-folder-grant/02-picker.ts      # pick the spike folder (and optionally one file as the control)
npx tsx scripts/spikes/google-drive-folder-grant/03-subscribe.ts   # Events sub on the folder, includeDescendants:true
npx tsx scripts/spikes/google-drive-folder-grant/04-listen.ts      # pull events; auto-probes files.get per event
npx tsx scripts/spikes/google-drive-folder-grant/05-probes.ts <cmd># files-get|files-list|changes-baseline|changes-list|subscribe-file|cleanup
```

With `04-listen.ts` running, execute the §7 test matrix (create/move the
A-root/B-root/A-nested/B-nested/moved files as the matching account); each
delivered event is immediately re-probed with the NARROW token and printed as a
result row (`event ✓/✗ · files.get ✓/✗ · content ✓/✗`). Tests E/F (pre-existing
children) use `05-probes.ts files-get <id>` directly. The control test for the
Sheets escape is `02-picker.ts` file-pick + `05-probes.ts subscribe-file <id>`
then editing that file.

## Cleanup

`npx tsx scripts/spikes/google-drive-folder-grant/05-probes.ts cleanup` deletes
the Events subscription(s) created by the harness. Then delete the throwaway
Pub/Sub subscription/topic and (optionally) the project, revoke the test app at
myaccount.google.com/permissions (Account A), and trash the spike folder.

## Fresh-grant hygiene (critical)

Result contamination check: Account A must have NO prior broad-scope grant to
the throwaway app. `01-authorize.ts` prints the granted scope string returned
by Google — the run is valid only if it contains `drive.file` and no other
Drive scope. If in doubt, revoke the app's access on Account A and re-run.

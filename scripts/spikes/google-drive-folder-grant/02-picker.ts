/**
 * Step 02 — explicit resource authorization via the real Google Picker,
 * exactly as the proposed production model would do it: OAuth token (narrow
 * drive.file grant from step 01) + setAppId(project number) + developer key.
 *
 * Serves a minimal local page at http://localhost:8766 with two buttons:
 *   - "Pick the spike FOLDER"  (FOLDERS view, setSelectFolderEnabled)
 *   - "Pick a control FILE"    (DocsView; used for the Sheets-escape control)
 * Picked ids are posted back and stored in spike state. The page receives a
 * short-lived ACCESS token only (never the refresh token).
 */
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { assertNotProduction, requireEnv, narrowAccessToken, saveState } from "./_shared";

assertNotProduction();
const apiKey = requireEnv("SPIKE_GOOGLE_API_KEY");
const appId = requireEnv("SPIKE_GOOGLE_PROJECT_NUMBER");

function page(accessToken: string): string {
  return `<!doctype html><html><head><title>Drive spike picker</title></head><body>
<h3>ChainReact drive.file spike — explicit resource authorization</h3>
<button onclick="pick('folder')">Pick the spike FOLDER</button>
<button onclick="pick('file')">Pick a control FILE</button>
<pre id="out"></pre>
<script src="https://apis.google.com/js/api.js" onload="gapi.load('picker', () => {})"></script>
<script>
const TOKEN = ${JSON.stringify(accessToken)};
const API_KEY = ${JSON.stringify(apiKey)};
const APP_ID = ${JSON.stringify(appId)};
function pick(kind) {
  let view;
  if (kind === 'folder') {
    view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true).setIncludeFolders(true);
  } else {
    view = new google.picker.DocsView().setIncludeFolders(false);
  }
  const picker = new google.picker.PickerBuilder()
    .setOAuthToken(TOKEN).setDeveloperKey(API_KEY).setAppId(APP_ID)
    .addView(view)
    .setCallback(async (data) => {
      if (data.action !== google.picker.Action.PICKED) return;
      const doc = data.docs[0];
      document.getElementById('out').textContent = kind + ' picked: ' + doc.id + ' (' + doc.name + ')';
      await fetch('/picked', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ kind, id: doc.id }) });
    })
    .build();
  picker.setVisible(true);
}
</script></body></html>`;
}

async function main() {
  const token = await narrowAccessToken();
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" }).end(page(token));
      return;
    }
    if (req.method === "POST" && req.url === "/picked") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { kind, id } = JSON.parse(body) as { kind: string; id: string };
      if (kind === "folder") saveState({ pickedFolderId: id });
      else saveState({ pickedFileId: id });
      console.log(`Picked ${kind}: ${id} (stored in spike state)`);
      res.writeHead(204).end();
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(8766, () => {
    console.log("Picker page: http://localhost:8766 — pick the folder (and optionally a control file), then Ctrl+C.");
    exec('start "" "http://localhost:8766"');
  });
}

void main();

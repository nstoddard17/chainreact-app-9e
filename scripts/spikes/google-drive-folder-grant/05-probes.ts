/**
 * Step 05 — direct probes with the NARROW drive.file token + cleanup.
 *
 *   files-get <fileId>       Tests E/F (pre-existing children) + any ad-hoc id
 *   files-list [q]           §9 corpus check (documents exact params used)
 *   changes-baseline         §10: fetch + remember a changes start page token
 *   changes-list             §10: list changes since the baseline
 *   subscribe-file <fileId>  Control test: Events subscription on a PICKED
 *                            file (the Sheets-escape analogue; no public
 *                            webhook needed, unlike files.watch)
 *   cleanup                  Delete every Events subscription this harness made
 */
import { assertNotProduction, narrowAccessToken, probeFilesGet, probeContent, loadState, saveState, requireEnv } from "./_shared";

assertNotProduction();

async function filesList(q?: string) {
  const token = await narrowAccessToken();
  const params = new URLSearchParams({
    fields: "files(id,name,mimeType,parents),nextPageToken",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (q) params.set("q", q);
  console.log(`files.list params: ${params.toString()}`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`files.list HTTP ${res.status}`);
    return;
  }
  const j = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string }> };
  console.log(`Visible corpus under drive.file: ${j.files?.length ?? 0} item(s)`);
  for (const f of j.files ?? []) console.log(`  ${f.id} · ${f.mimeType} · ${f.name}`);
}

async function changesBaseline() {
  const token = await narrowAccessToken();
  const res = await fetch("https://www.googleapis.com/drive/v3/changes/startPageToken?supportsAllDrives=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await res.json()) as { startPageToken?: string };
  if (!res.ok || !j.startPageToken) {
    console.error(`startPageToken failed: HTTP ${res.status}`);
    return;
  }
  saveState({ changesToken: j.startPageToken });
  console.log(`Baseline stored. Now modify: the picked file, the picked folder, a child, and an unrelated file — then run changes-list.`);
}

async function changesList() {
  const token = await narrowAccessToken();
  const stateToken = loadState().changesToken;
  if (!stateToken) {
    console.error("No baseline — run changes-baseline first.");
    return;
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(stateToken)}&supportsAllDrives=true&includeItemsFromAllDrives=true&includeRemoved=true&fields=changes(fileId,file(name,mimeType)),newStartPageToken`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error(`changes.list HTTP ${res.status}`);
    return;
  }
  const j = (await res.json()) as { changes?: Array<{ fileId: string; file?: { name?: string } }> };
  console.log(`changes.list visible entries under drive.file: ${j.changes?.length ?? 0}`);
  for (const c of j.changes ?? []) console.log(`  ${c.fileId} · ${c.file?.name ?? "(no file body)"}`);
}

async function subscribeFile(fileId: string) {
  const token = await narrowAccessToken();
  const pubsubProject = requireEnv("SPIKE_PUBSUB_PROJECT");
  const topic = process.env.SPIKE_PUBSUB_TOPIC ?? "drive-spike-events";
  const res = await fetch("https://workspaceevents.googleapis.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      targetResource: `//drive.googleapis.com/files/${fileId}`,
      eventTypes: ["google.workspace.drive.file.v3.contentChanged"],
      notificationEndpoint: { pubsubTopic: `projects/${pubsubProject}/topics/${topic}` },
      payloadOptions: { includeResource: false },
    }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`File subscription FAILED: HTTP ${res.status}`);
    console.error(JSON.stringify(body, null, 2));
    return;
  }
  const sub = (body.response ?? body) as Record<string, unknown>;
  if (typeof sub.name === "string") {
    saveState({ subscriptionNames: [...(loadState().subscriptionNames ?? []), sub.name] });
  }
  console.log("Control file subscription created — edit the picked file, watch 04-listen output.");
  console.log(JSON.stringify({ name: sub.name, targetResource: sub.targetResource, expireTime: sub.expireTime }, null, 2));
}

async function cleanup() {
  const token = await narrowAccessToken();
  const names = loadState().subscriptionNames ?? [];
  if (names.length === 0) {
    console.log("No harness-created subscriptions recorded.");
    return;
  }
  for (const name of names) {
    const res = await fetch(`https://workspaceevents.googleapis.com/v1/${name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`${name} → delete HTTP ${res.status}`);
  }
  saveState({ subscriptionNames: [] });
  console.log("Done. Also delete the throwaway Pub/Sub topic/subscription + project, and revoke the app on Account A (see README).");
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "files-get": {
      if (!arg) return console.error("usage: files-get <fileId>");
      const r = await probeFilesGet(arg);
      const c = r.ok ? await probeContent(arg, r.mimeType) : { ok: false, status: 0 };
      console.log(r.ok ? `files.get ✓ (${r.name}) · content ${c.ok ? "✓" : `✗ HTTP ${c.status}`}` : `files.get ✗ HTTP ${r.status}`);
      return;
    }
    case "files-list":
      return filesList(arg);
    case "changes-baseline":
      return changesBaseline();
    case "changes-list":
      return changesList();
    case "subscribe-file": {
      if (!arg) return console.error("usage: subscribe-file <fileId>");
      return subscribeFile(arg);
    }
    case "cleanup":
      return cleanup();
    default:
      console.error("usage: 05-probes.ts <files-get|files-list|changes-baseline|changes-list|subscribe-file|cleanup> [arg]");
  }
}

void main();

/**
 * Step 04 — the core test loop. Pulls CloudEvents from the throwaway Pub/Sub
 * pull subscription and, for EVERY Drive event received, immediately probes
 * the event's file with the NARROW drive.file token:
 *
 *   event received → files.get (metadata) → content read (alt=media/export)
 *
 * printing one sanitized result row per event. Event delivery alone is NOT
 * success — the row is the §7 matrix evidence (event ✓/✗ · get ✓/✗ · read ✓/✗).
 *
 * Pub/Sub pull auth uses SPIKE_GCLOUD_ACCESS_TOKEN (`gcloud auth
 * print-access-token`) — GCP-side auth is unrelated to the Drive-side scope
 * question being tested. Re-export it if it expires (~1h).
 *
 * Run the §7 matrix while this is live: create A-root.txt (Account A, folder),
 * B-root.txt (Account B, folder), A-nested.txt / B-nested.txt (Nested), and
 * move pre-created files into the folder / Nested. Ctrl+C to stop.
 */
import { assertNotProduction, requireEnv, probeFilesGet, probeContent } from "./_shared";

assertNotProduction();
const gcpToken = requireEnv("SPIKE_GCLOUD_ACCESS_TOKEN");
const project = requireEnv("SPIKE_PUBSUB_PROJECT");
const subscription = requireEnv("SPIKE_PUBSUB_SUBSCRIPTION");

const PULL_URL = `https://pubsub.googleapis.com/v1/projects/${project}/subscriptions/${subscription}:pull`;
const ACK_URL = `https://pubsub.googleapis.com/v1/projects/${project}/subscriptions/${subscription}:acknowledge`;

interface PubsubMessage {
  ackId: string;
  message: { data?: string; attributes?: Record<string, string>; messageId: string };
}

function fileIdFromEvent(attributes: Record<string, string>, payload: Record<string, unknown>): string | null {
  // CloudEvents put the subject in attributes (ce-subject) as
  // "//drive.googleapis.com/files/{id}"; fall back to payload shapes.
  const subject = attributes["ce-subject"] ?? attributes["subject"] ?? "";
  const m = subject.match(/files\/([^/]+)$/);
  if (m) return m[1] ?? null;
  const file = payload["file"] as { name?: string } | undefined;
  const n = file?.name?.match(/files\/([^/]+)$/);
  return n?.[1] ?? null;
}

async function pullOnce(): Promise<void> {
  const res = await fetch(PULL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${gcpToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ maxMessages: 10 }),
  });
  if (!res.ok) {
    console.error(`Pub/Sub pull failed: HTTP ${res.status} (re-export SPIKE_GCLOUD_ACCESS_TOKEN if expired)`);
    process.exit(1);
  }
  const { receivedMessages } = (await res.json()) as { receivedMessages?: PubsubMessage[] };
  if (!receivedMessages?.length) return;

  for (const rm of receivedMessages) {
    const attrs = rm.message.attributes ?? {};
    const payload = rm.message.data
      ? (JSON.parse(Buffer.from(rm.message.data, "base64").toString("utf8")) as Record<string, unknown>)
      : {};
    const eventType = attrs["ce-type"] ?? "(unknown type)";
    const fileId = fileIdFromEvent(attrs, payload);
    if (!fileId) {
      console.log(`EVENT ${eventType} — could not extract fileId (attrs: ${Object.keys(attrs).join(",")})`);
      continue;
    }
    const get = await probeFilesGet(fileId);
    const content = get.ok ? await probeContent(fileId, get.mimeType) : { ok: false, status: 0 };
    console.log(
      [
        `EVENT ✓ ${eventType}`,
        `file=${fileId}`,
        get.ok ? `files.get ✓ (${get.name ?? "?"})` : `files.get ✗ HTTP ${get.status}`,
        get.ok ? (content.ok ? "content ✓" : `content ✗ HTTP ${content.status}`) : "content — skipped",
      ].join(" · "),
    );
  }
  await fetch(ACK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${gcpToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ackIds: receivedMessages.map((m) => m.ackId) }),
  });
}

async function main() {
  console.log("Listening (Pub/Sub pull, 5s interval). Perform the §7 matrix actions now. Ctrl+C to stop.");
  for (;;) {
    await pullOnce();
    await new Promise((r) => setTimeout(r, 5000));
  }
}

void main();

/**
 * Step 03 — create the Workspace Events subscription on the PICKED folder
 * with driveOptions.includeDescendants: true, delivering to the throwaway
 * Pub/Sub topic. Prints the subscription as returned (name, target, TTL,
 * driveOptions) so we can verify includeDescendants actually persisted.
 *
 * Uses the NARROW drive.file token — that is the point of the experiment.
 */
import { assertNotProduction, requireEnv, narrowAccessToken, loadState, saveState } from "./_shared";

assertNotProduction();
const pubsubProject = requireEnv("SPIKE_PUBSUB_PROJECT");
const topic = process.env.SPIKE_PUBSUB_TOPIC ?? "drive-spike-events";

async function main() {
  const { pickedFolderId } = loadState();
  if (!pickedFolderId) {
    console.error("No picked folder in spike state — run 02-picker.ts first.");
    process.exit(1);
  }
  const token = await narrowAccessToken();
  const res = await fetch("https://workspaceevents.googleapis.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      targetResource: `//drive.googleapis.com/files/${pickedFolderId}`,
      eventTypes: [
        "google.workspace.drive.file.v3.created",
        "google.workspace.drive.file.v3.moved",
        "google.workspace.drive.file.v3.contentChanged",
      ],
      driveOptions: { includeDescendants: true },
      notificationEndpoint: { pubsubTopic: `projects/${pubsubProject}/topics/${topic}` },
      payloadOptions: { includeResource: false },
    }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`Subscription create FAILED: HTTP ${res.status}`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  // Create returns an Operation wrapping the subscription.
  const sub = (body.response ?? body) as Record<string, unknown>;
  const name = (sub.name as string) ?? "";
  if (name) {
    const prior = loadState().subscriptionNames ?? [];
    saveState({ subscriptionNames: [...prior, name] });
  }
  console.log("Subscription created. Verify target/driveOptions/expireTime below:");
  console.log(JSON.stringify({ name: sub.name, targetResource: sub.targetResource, eventTypes: sub.eventTypes, driveOptions: sub.driveOptions, expireTime: sub.expireTime, state: sub.state }, null, 2));
}

void main();

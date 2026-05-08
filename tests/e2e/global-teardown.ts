import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getGoogleMockHandle,
  getMicrosoftMockHandle,
  getMockHandle,
  STATE_FILE,
} from "./global-setup";

export default async function globalTeardown(): Promise<void> {
  const slackHandle = getMockHandle();
  if (slackHandle) {
    await slackHandle.stop();
    console.log("[e2e] mock Slack stopped");
  }
  const googleHandle = getGoogleMockHandle();
  if (googleHandle) {
    await googleHandle.stop();
    console.log("[e2e] mock Google stopped");
  }
  const microsoftHandle = getMicrosoftMockHandle();
  if (microsoftHandle) {
    await microsoftHandle.stop();
    console.log("[e2e] mock Microsoft stopped");
  }
  // Clean up the state directory. All state files live under the same
  // .state/ folder, so removing the parent dir cleans them all.
  await rm(dirname(STATE_FILE), { recursive: true, force: true });
}

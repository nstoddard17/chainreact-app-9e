import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getAirtableMockHandle,
  getGitHubMockHandle,
  getGoogleMockHandle,
  getHubSpotMockHandle,
  getMailchimpMockHandle,
  getMicrosoftMockHandle,
  getMockHandle,
  getNotionMockHandle,
  getShopifyMockHandle,
  getStripeMockHandle,
  getTrelloMockHandle,
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
  const notionHandle = getNotionMockHandle();
  if (notionHandle) {
    await notionHandle.stop();
    console.log("[e2e] mock Notion stopped");
  }
  const airtableHandle = getAirtableMockHandle();
  if (airtableHandle) {
    await airtableHandle.stop();
    console.log("[e2e] mock Airtable stopped");
  }
  const stripeHandle = getStripeMockHandle();
  if (stripeHandle) {
    await stripeHandle.stop();
    console.log("[e2e] mock Stripe stopped");
  }
  const shopifyHandle = getShopifyMockHandle();
  if (shopifyHandle) {
    await shopifyHandle.stop();
    console.log("[e2e] mock Shopify stopped");
  }
  const hubspotHandle = getHubSpotMockHandle();
  if (hubspotHandle) {
    await hubspotHandle.stop();
    console.log("[e2e] mock HubSpot stopped");
  }
  const githubHandle = getGitHubMockHandle();
  if (githubHandle) {
    await githubHandle.stop();
    console.log("[e2e] mock GitHub stopped");
  }
  const mailchimpHandle = getMailchimpMockHandle();
  if (mailchimpHandle) {
    await mailchimpHandle.stop();
    console.log("[e2e] mock Mailchimp stopped");
  }
  const trelloHandle = getTrelloMockHandle();
  if (trelloHandle) {
    await trelloHandle.stop();
    console.log("[e2e] mock Trello stopped");
  }
  // Clean up the state directory. All state files live under the same
  // .state/ folder, so removing the parent dir cleans them all.
  await rm(dirname(STATE_FILE), { recursive: true, force: true });
}

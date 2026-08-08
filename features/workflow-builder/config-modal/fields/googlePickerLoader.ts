"use client";

/**
 * Google Picker script loader + open helper
 * (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
 *
 * Loads Google's hosted picker bundle on demand (same dynamic-script pattern as
 * `features/auth/TurnstileWidget.tsx`) and opens a single-select, MIME-filtered
 * picker. Kept separate from the React component so the component stays
 * declarative and this seam is trivially mockable in jsdom tests.
 *
 * SECURITY: `accessToken` is the short-lived picker credential from
 * `/api/integrations/picker-session`. It is passed straight to Google's widget
 * and held only for the duration of the call — never stored, never logged,
 * never appended to a URL.
 */

const SCRIPT_ID = "google-api-js";
const SCRIPT_SRC = "https://apis.google.com/js/api.js";

interface GapiLoader {
  load(module: string, callback: () => void): void;
}

/** Minimal structural typing of the picker surface we actually use. */
interface PickerDoc {
  id?: string;
  name?: string;
}
interface PickerResponse {
  action?: string;
  docs?: PickerDoc[];
}
interface PickerView {
  setMimeTypes(mimeTypes: string): PickerView;
  setIncludeFolders(include: boolean): PickerView;
}
interface PickerBuilder {
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  addView(view: PickerView): PickerBuilder;
  setCallback(cb: (data: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface GooglePickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new () => PickerView;
  Action: { PICKED: string };
}

declare global {
  interface Window {
    gapi?: GapiLoader;
    google?: { picker?: GooglePickerApi };
  }
}

function ensureScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.gapi) return resolve();
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("picker-script")), {
        once: true,
      });
      if (window.gapi) resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("picker-script")), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

function loadPickerModule(): Promise<GooglePickerApi> {
  return new Promise((resolve, reject) => {
    const gapi = window.gapi;
    if (!gapi) return reject(new Error("picker-unavailable"));
    gapi.load("picker", () => {
      const picker = window.google?.picker;
      if (!picker) return reject(new Error("picker-unavailable"));
      resolve(picker);
    });
  });
}

export interface OpenResourcePickerInput {
  accessToken: string;
  appId: string;
  apiKey: string;
  mimeType: string;
  title: string;
}

/**
 * Opens the picker and resolves with the chosen resource, or `null` when the
 * user cancels/closes without choosing. Rejects only when the picker itself
 * cannot be loaded.
 */
export async function openResourcePicker(
  input: OpenResourcePickerInput,
): Promise<{ id: string; name: string } | null> {
  await ensureScript();
  const picker = await loadPickerModule();

  return new Promise((resolve) => {
    const view = new picker.DocsView()
      .setMimeTypes(input.mimeType)
      .setIncludeFolders(false);

    new picker.PickerBuilder()
      .setOAuthToken(input.accessToken)
      .setDeveloperKey(input.apiKey)
      .setAppId(input.appId)
      .setTitle(input.title)
      .addView(view)
      .setCallback((data) => {
        if (data.action !== picker.Action.PICKED) {
          // Cancelled / closed / still open — only PICKED commits a value.
          if (data.action === "cancel") resolve(null);
          return;
        }
        const doc = data.docs?.[0];
        if (!doc?.id) return resolve(null);
        resolve({ id: doc.id, name: doc.name ?? doc.id });
      })
      .build()
      .setVisible(true);
  });
}
